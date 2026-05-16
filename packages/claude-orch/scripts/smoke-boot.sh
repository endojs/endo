#!/usr/bin/env bash
# Real-host QEMU smoke boot for the claude-orch microVM stack.
#
# Builds a minimal x86_64 kernel from the upstream tarball with the
# microvm.fragment config, cross-compiles the bootstrap-init + runtime-agent
# binaries to musl, packs an ext4 rootfs.raw, and boots QEMU. The
# orchestrator's ctl/fs/agent UDS endpoints are simulated via a tiny
# Node.js listener so the test does not need a full @endo/claude-orch
# daemon — it validates kernel + bootstrap-init + 9P relay + runtime-agent
# wiring in isolation.
#
# Requires:
#   - Linux host with KVM (/dev/kvm world-rw is fine; root not required)
#   - rustup with x86_64-unknown-linux-musl target installed
#   - qemu, e2fsprogs, gcc, make, bison, flex, openssl, bc, elfutils, perl
#     on PATH (or nix-shell -p qemu rustup e2fsprogs gcc gnumake bison ...)
#   - $LINUX_TARBALL pointing at a linux-*.tar.xz, or default to fetching
#     linux-6.18 from kernel.org.
#
# Exits 0 if the in-guest claude-agent's Ready message reaches the host
# orchestrator side, nonzero otherwise. Useful as the human-driven
# counterpart to the no-QEMU ava e2e-smoke test.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BUILD_DIR="${SMOKE_BUILD_DIR:-/tmp/claude-orch-smoke}"
LINUX_VERSION="${LINUX_VERSION:-6.18.28}"

step() { printf '\n== %s ==\n' "$*"; }

step "Staging build dir at $BUILD_DIR"
mkdir -p "$BUILD_DIR"/{rootfs/sbin,rootfs/usr/local/bin,rootfs/home/claude,rootfs/workspace,rootfs/dev,rootfs/proc,rootfs/sys,rootfs/tmp,rootfs/run,rootfs/etc}

step "Cross-compiling guest Rust binaries to x86_64-unknown-linux-musl"
( cd "$REPO_ROOT" && \
  cargo build --release --target x86_64-unknown-linux-musl \
    --manifest-path rust/claude-orch/bootstrap-init/Cargo.toml && \
  cargo build --release --target x86_64-unknown-linux-musl \
    --manifest-path rust/claude-orch/runtime-agent/Cargo.toml )
install -m 0755 "$REPO_ROOT/target/x86_64-unknown-linux-musl/release/init" \
  "$BUILD_DIR/rootfs/sbin/init"
install -m 0755 "$REPO_ROOT/target/x86_64-unknown-linux-musl/release/claude-agent" \
  "$BUILD_DIR/rootfs/usr/local/bin/claude-agent"

step "Packing rootfs.raw"
rm -f "$BUILD_DIR/rootfs.raw"
mke2fs -t ext4 -d "$BUILD_DIR/rootfs" -L claude-rootfs "$BUILD_DIR/rootfs.raw" 32M >/dev/null
# Smoke boot mounts rw so bootstrap-init can write /home/claude/.claude/.
# Production uses a tmpfs overlay; the smoke test keeps a per-run copy.
cp -f "$BUILD_DIR/rootfs.raw" "$BUILD_DIR/rootfs-rw.raw"

if [ ! -f "$BUILD_DIR/vmlinux-x86_64" ]; then
  KSRC="$BUILD_DIR/linux-$LINUX_VERSION"
  if [ ! -d "$KSRC" ]; then
    step "Fetching linux-$LINUX_VERSION source"
    TARBALL="${LINUX_TARBALL:-https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-$LINUX_VERSION.tar.xz}"
    if [[ "$TARBALL" == http* ]]; then
      curl -sL "$TARBALL" | tar -xJ -C "$BUILD_DIR"
    else
      tar -xJf "$TARBALL" -C "$BUILD_DIR"
    fi
  fi
  step "Configuring + building kernel ($LINUX_VERSION)"
  ( cd "$KSRC" && \
    make tinyconfig >/dev/null && \
    ./scripts/kconfig/merge_config.sh -m .config \
      "$REPO_ROOT/packages/claude-orch/images/kernel/microvm.fragment" >/dev/null && \
    make olddefconfig >/dev/null && \
    make -j"$(nproc)" bzImage )
  cp "$KSRC/arch/x86/boot/bzImage" "$BUILD_DIR/vmlinux-x86_64"
fi

step "Booting QEMU; expecting Hello on ctl.sock and Ready on agent.sock"
rm -f "$BUILD_DIR"/{ctl,fs,agent}.sock

HELLO_FILE="$BUILD_DIR/hello.json"
READY_FILE="$BUILD_DIR/agent-ready.json"
rm -f "$HELLO_FILE" "$READY_FILE"

NONCE="$(printf 'a%.0s' {1..64})"
node - "$BUILD_DIR" "$HELLO_FILE" "$READY_FILE" <<'EOF' &
const net = require('node:net');
const fs = require('node:fs');
const [, , dir, helloFile, readyFile] = process.argv;

// ctl: receive Hello, send BootConfig.
net.createServer(conn => {
  let buf = '';
  conn.on('data', d => {
    buf += d.toString('utf8');
    const i = buf.indexOf('\n');
    if (i >= 0) {
      fs.writeFileSync(helloFile, buf.slice(0, i));
      conn.write(JSON.stringify({
        type: 'boot_config',
        credentials: { apiKey: 'k' },
        fsMountTag: 'workspace',
        workspaceUidGid: [1000, 1000],
        envExtra: {},
        agentControlPort: 'agent',
      }) + '\n');
    }
  });
}).listen(`${dir}/ctl.sock`);

// fs: minimal 9P2000.L server — replies to Tversion/Tattach/Tgetattr/Twalk/Tclunk
// so the guest's `mount -t 9p` succeeds. Anything beyond that is silently ignored.
net.createServer(c => {
  c.on('data', d => {
    let off = 0;
    while (off + 7 <= d.length) {
      const sz = d.readUInt32LE(off);
      if (off + sz > d.length) break;
      const t = d.readUInt8(off + 4);
      const tag = d.readUInt16LE(off + 5);
      let r = null;
      if (t === 100) {
        const v = Buffer.from('9P2000.L');
        r = Buffer.alloc(13 + v.length);
        r.writeUInt32LE(r.length, 0); r.writeUInt8(101, 4); r.writeUInt16LE(0xffff, 5);
        r.writeUInt32LE(8192, 7); r.writeUInt16LE(v.length, 11); v.copy(r, 13);
      } else if (t === 104) {
        r = Buffer.alloc(20);
        r.writeUInt32LE(20, 0); r.writeUInt8(105, 4); r.writeUInt16LE(tag, 5);
        r.writeUInt8(0x80, 7);
      } else if (t === 24) {
        r = Buffer.alloc(160);
        r.writeUInt32LE(160, 0); r.writeUInt8(25, 4); r.writeUInt16LE(tag, 5);
        r.writeBigUInt64LE(0x7ffn, 7); r.writeUInt8(0x80, 15);
        r.writeUInt32LE(0o40755, 28); r.writeUInt32LE(1000, 32); r.writeUInt32LE(1000, 36);
        r.writeBigUInt64LE(2n, 40); r.writeBigUInt64LE(4096n, 56);
      } else if (t === 110) {
        const nwname = d.readUInt16LE(off + 15);
        r = Buffer.alloc(7 + 2 + nwname * 13);
        r.writeUInt32LE(r.length, 0); r.writeUInt8(111, 4); r.writeUInt16LE(tag, 5);
        r.writeUInt16LE(nwname, 7);
        for (let i = 0; i < nwname; i += 1) r.writeUInt8(0x80, 9 + i * 13);
      } else if (t === 120) {
        r = Buffer.alloc(7);
        r.writeUInt32LE(7, 0); r.writeUInt8(121, 4); r.writeUInt16LE(tag, 5);
      }
      if (r) c.write(r);
      off += sz;
    }
  });
}).listen(`${dir}/fs.sock`);

// agent: receive Ready from claude-agent.
net.createServer(c => {
  let buf = '';
  c.on('data', d => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'ready') fs.writeFileSync(readyFile, JSON.stringify(msg));
      } catch { /* ignore */ }
    }
  });
}).listen(`${dir}/agent.sock`);

setTimeout(() => process.exit(0), 20000);
EOF
NODE_PID=$!
sleep 0.5

timeout 15 qemu-system-x86_64 \
  -machine pc -cpu host -accel kvm \
  -smp 1 -m 256 -no-reboot \
  -kernel "$BUILD_DIR/vmlinux-x86_64" \
  -append "console=ttyS0 root=/dev/vda rw rootfstype=ext4 earlyprintk=serial,ttyS0,115200 claude.session_id=smoketest claude.boot_nonce=$NONCE" \
  -drive "id=rootfs,file=$BUILD_DIR/rootfs-rw.raw,format=raw,if=none" \
  -device virtio-blk-pci,drive=rootfs \
  -device virtio-serial-pci \
  -chardev "socket,id=ctl,path=$BUILD_DIR/ctl.sock,reconnect-ms=100" \
  -device virtserialport,chardev=ctl,name=orchestrator \
  -chardev "socket,id=fs,path=$BUILD_DIR/fs.sock,reconnect-ms=100" \
  -device virtserialport,chardev=fs,name=workspace \
  -chardev "socket,id=agent,path=$BUILD_DIR/agent.sock,reconnect-ms=100" \
  -device virtserialport,chardev=agent,name=agent \
  -serial stdio -display none >"$BUILD_DIR/qemu.log" 2>&1 || true
wait "$NODE_PID" 2>/dev/null || true

ok=1
if [ -s "$HELLO_FILE" ]; then
  echo "Hello: $(cat "$HELLO_FILE")"
else
  echo "[smoke-boot] no Hello arrived" >&2
  ok=0
fi
if [ -s "$READY_FILE" ]; then
  echo "Ready: $(cat "$READY_FILE")"
else
  echo "[smoke-boot] no Ready arrived" >&2
  ok=0
fi

if [ "$ok" = 1 ]; then
  echo "[smoke-boot] PASS"
  exit 0
fi
echo "[smoke-boot] FAIL" >&2
echo "Tail of qemu.log:" >&2
tail -30 "$BUILD_DIR/qemu.log" >&2 || true
exit 1

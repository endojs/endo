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

# Host-side responder: real ctl + agent handshakes, real 9P bridge
# from @endo/claude-container backed by an @endo/remote-fs in-memory
# FS. Replaces the previous inline hand-rolled responder; the bridge
# is now the same code path CI exercises in `9p-server.test.js`.
node "$REPO_ROOT/packages/claude-orch/scripts/smoke-boot-host.js" \
  "$BUILD_DIR" "$HELLO_FILE" "$READY_FILE" &
NODE_PID=$!
sleep 0.5

# Accel selection: prefer KVM when available; fall back to TCG.
# CI runners (GitHub Actions) typically lack nested KVM; TCG runs
# the boot in software, ~5-10× slower but functionally identical.
# Override via SMOKE_BOOT_ACCEL=tcg or =kvm.
SMOKE_BOOT_ACCEL="${SMOKE_BOOT_ACCEL:-auto}"
if [ "$SMOKE_BOOT_ACCEL" = "auto" ]; then
  if [ -r /dev/kvm ] && [ -w /dev/kvm ]; then
    SMOKE_BOOT_ACCEL=kvm
  else
    SMOKE_BOOT_ACCEL=tcg
  fi
fi
step "QEMU accel: $SMOKE_BOOT_ACCEL"

# `-cpu host` requires KVM; `-cpu max` is the safe TCG choice.
if [ "$SMOKE_BOOT_ACCEL" = "kvm" ]; then
  QEMU_CPU="-cpu host -accel kvm"
  QEMU_TIMEOUT=15
else
  QEMU_CPU="-cpu max -accel tcg"
  # TCG is much slower; give it more headroom.
  QEMU_TIMEOUT=120
fi

timeout "$QEMU_TIMEOUT" qemu-system-x86_64 \
  -machine pc $QEMU_CPU \
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

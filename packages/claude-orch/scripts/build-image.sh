#!/bin/bash
# Build the claude-orch guest rootfs + kernel for one architecture.
#
# Usage:
#   ./scripts/build-image.sh [x86_64|aarch64]
#
# Requires (on the host running this script):
#   - mkosi
#   - cargo + rustup with the target installed
#   - linux source tree at $LINUX_SRC (default: /usr/src/linux)
#   - Linux host (mkosi does not run on macOS)
#
# Outputs land in build/<arch>/.
set -euo pipefail

ARCH="${1:-x86_64}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
IMAGE_DIR="$PACKAGE_DIR/images"
BUILD_DIR="$IMAGE_DIR/build/$ARCH"
LINUX_SRC="${LINUX_SRC:-/usr/src/linux}"
CLAUDE_CODE_VERSION="${CLAUDE_CODE_VERSION:-latest}"

mkdir -p "$BUILD_DIR"

case "$ARCH" in
  x86_64)
    RUST_TARGET="x86_64-unknown-linux-musl"
    KERNEL_ARCH="x86_64"
    KERNEL_TARGET="bzImage"
    KERNEL_IMG="vmlinux-x86_64"
    KERNEL_RELPATH="arch/x86/boot/bzImage"
    MKOSI_ARCH="x86-64"
    ;;
  aarch64|arm64)
    ARCH=aarch64
    RUST_TARGET="aarch64-unknown-linux-musl"
    KERNEL_ARCH="arm64"
    KERNEL_TARGET="Image"
    KERNEL_IMG="Image-arm64"
    KERNEL_RELPATH="arch/arm64/boot/Image"
    MKOSI_ARCH="arm64"
    ;;
  *)
    echo "unknown arch: $ARCH" >&2
    exit 1
    ;;
esac

echo "== building guest binaries (Rust, target=$RUST_TARGET)"
cargo build --release \
  --target "$RUST_TARGET" \
  --manifest-path "$REPO_ROOT/rust/claude-orch/bootstrap-init/Cargo.toml"
cargo build --release \
  --target "$RUST_TARGET" \
  --manifest-path "$REPO_ROOT/rust/claude-orch/runtime-agent/Cargo.toml"

# Drop the Rust binaries into the mkosi ExtraTrees layout.
EXTRA="$IMAGE_DIR/mkosi.conf.d/10-claude/files"
install -m 0755 "$REPO_ROOT/target/$RUST_TARGET/release/init" \
  "$EXTRA/sbin/init"
install -m 0755 "$REPO_ROOT/target/$RUST_TARGET/release/claude-agent" \
  "$EXTRA/usr/local/bin/claude-agent"

echo "== building rootfs (mkosi, arch=$MKOSI_ARCH)"
( cd "$IMAGE_DIR" && \
    CLAUDE_CODE_VERSION="$CLAUDE_CODE_VERSION" \
    mkosi --architecture="$MKOSI_ARCH" --output-dir="$BUILD_DIR" build )

# Convert to flat ext4 if not already.
ROOTFS_SRC="$BUILD_DIR/rootfs"
ROOTFS_DST="$BUILD_DIR/rootfs-$ARCH.raw"
if [ -f "$ROOTFS_SRC" ] && [ ! -e "$ROOTFS_DST" ]; then
  cp "$ROOTFS_SRC" "$ROOTFS_DST"
fi

echo "== building kernel ($KERNEL_ARCH $KERNEL_TARGET)"
if [ ! -d "$LINUX_SRC" ]; then
  echo "LINUX_SRC=$LINUX_SRC not found." >&2
  echo "Point LINUX_SRC at a kernel source tree (>= 6.6)." >&2
  exit 1
fi
( cd "$LINUX_SRC" && \
    make ARCH="$KERNEL_ARCH" tinyconfig && \
    ./scripts/kconfig/merge_config.sh -m .config \
      "$IMAGE_DIR/kernel/microvm.fragment" && \
    make ARCH="$KERNEL_ARCH" olddefconfig && \
    make ARCH="$KERNEL_ARCH" -j"$(nproc)" "$KERNEL_TARGET" )

install -m 0644 "$LINUX_SRC/$KERNEL_RELPATH" "$BUILD_DIR/$KERNEL_IMG"

echo "== artifacts in $BUILD_DIR"
ls -la "$BUILD_DIR"

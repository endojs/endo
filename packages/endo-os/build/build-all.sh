#!/bin/bash
# Build everything for Endo OS (native Linux build), in order.
#
# Steps:
#   1. Build endo-init via Cargo (V8 is built automatically by
#      the v8 crate — no depot_tools needed)
#   2. Build Linux kernel (skip if already built)
#   3. Assemble initramfs
#
# For macOS, use ./build/build-docker.sh instead.
# After this, run ./build/run-qemu.sh to boot.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENDO_OS_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo " Endo OS: Full Build (Rust)"
echo "========================================"
echo ""

# Step 1: endo-init (Cargo builds V8 automatically)
echo "--- Building endo-init (Cargo + deno_core/V8) ---"
cd "${ENDO_OS_DIR}"
cargo build --release
cp target/release/endo-init "${SCRIPT_DIR}/endo-init"
echo "endo-init: $(du -h "${SCRIPT_DIR}/endo-init" | cut -f1)"
echo ""

# Step 2: Kernel
KERNEL="${SCRIPT_DIR}/_kernel_out/arch/x86/boot/bzImage"
if [ -f "${KERNEL}" ]; then
  echo "[skip] Kernel already built at ${KERNEL}"
else
  bash "${SCRIPT_DIR}/build-kernel.sh"
fi
echo ""

# Step 3: initramfs
bash "${SCRIPT_DIR}/build-initramfs.sh"

echo ""
echo "========================================"
echo " Build complete!  Run:"
echo "   ./build/run-qemu.sh"
echo "========================================"

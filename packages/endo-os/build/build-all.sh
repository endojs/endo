#!/bin/bash
# Build everything for Endo OS, in order.
#
# Steps:
#   1. Build V8 static library (skip if already built)
#   2. Build Linux kernel (skip if already built)
#   3. Build endo-init binary
#   4. Assemble initramfs
#
# After this, run ./build/run-qemu.sh to boot.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo " Endo OS: Full Build"
echo "========================================"
echo ""

# Step 1: V8
V8_LIB="${SCRIPT_DIR}/_v8_src/out/x64.release/obj/libv8_monolith.a"
if [ -f "${V8_LIB}" ]; then
  echo "[skip] V8 already built at ${V8_LIB}"
else
  bash "${SCRIPT_DIR}/build-v8.sh"
fi
echo ""

# Step 2: Kernel
KERNEL="${SCRIPT_DIR}/_kernel_out/arch/x86/boot/bzImage"
if [ -f "${KERNEL}" ]; then
  echo "[skip] Kernel already built at ${KERNEL}"
else
  bash "${SCRIPT_DIR}/build-kernel.sh"
fi
echo ""

# Step 3: endo-init
echo "--- Building endo-init ---"
make -C "${SCRIPT_DIR}" endo-init
echo ""

# Step 4: initramfs
bash "${SCRIPT_DIR}/build-initramfs.sh"

echo ""
echo "========================================"
echo " Build complete!  Run:"
echo "   ./build/run-qemu.sh"
echo "========================================"

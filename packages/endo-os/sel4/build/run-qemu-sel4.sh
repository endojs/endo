#!/bin/bash
# Boot Endo OS (seL4) in QEMU.
#
# Runs the seL4 Microkit image on an emulated AArch64 virt platform.
# Output goes to serial console.  Ctrl-A X to exit.
#
# Usage:
#   ./sel4/build/run-qemu-sel4.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${SCRIPT_DIR}/out/endo-os.img"

if [ ! -f "${IMAGE}" ]; then
  echo "ERROR: seL4 image not found at ${IMAGE}"
  echo ""
  echo "Build first:"
  echo "  ./sel4/build/build-sel4.sh"
  exit 1
fi

if ! command -v qemu-system-aarch64 &> /dev/null; then
  echo "ERROR: qemu-system-aarch64 not found."
  echo "Install with: brew install qemu"
  exit 1
fi

echo "=== Endo OS: Booting on seL4 (QEMU AArch64) ==="
echo "    Image:  ${IMAGE}"
echo "    Kernel: seL4 (formally verified)"
echo "    Engine: QuickJS (no JIT)"
echo ""
echo "    Press Ctrl-A X to exit QEMU"
echo ""

exec qemu-system-aarch64 \
  -machine virt,virtualization=on \
  -cpu cortex-a53 \
  -m size=2G \
  -nographic \
  -serial mon:stdio \
  -device loader,file="${IMAGE}",addr=0x70000000,cpu-num=0

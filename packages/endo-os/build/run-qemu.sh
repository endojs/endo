#!/bin/bash
# Boot Endo OS in QEMU.
#
# Serial console is connected to the terminal.
# Press Ctrl-A X to exit QEMU.
#
# Port 8920 is forwarded from localhost to the VM for the
# WebSocket gateway (Phase 4+).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}"

KERNEL="${BUILD_DIR}/_kernel_out/arch/x86/boot/bzImage"
INITRAMFS="${BUILD_DIR}/initramfs.cpio.gz"
MEMORY="${QEMU_MEMORY:-512M}"

# Check prerequisites.
if [ ! -f "${KERNEL}" ]; then
  echo "ERROR: Kernel not found at ${KERNEL}"
  echo "Run ./build/build-kernel.sh first."
  exit 1
fi

if [ ! -f "${INITRAMFS}" ]; then
  echo "ERROR: initramfs not found at ${INITRAMFS}"
  echo "Run ./build/build-initramfs.sh first."
  exit 1
fi

echo "=== Endo OS: Booting in QEMU ==="
echo "    Kernel:    ${KERNEL}"
echo "    Initramfs: ${INITRAMFS}"
echo "    Memory:    ${MEMORY}"
echo "    Gateway:   localhost:8920 → VM:8920"
echo ""
echo "    Press Ctrl-A X to exit QEMU"
echo ""

exec qemu-system-x86_64 \
  -kernel "${KERNEL}" \
  -initrd "${INITRAMFS}" \
  -append "console=ttyS0 quiet panic=-1" \
  -m "${MEMORY}" \
  -drive file=/dev/null,format=raw,if=virtio \
  -netdev user,id=net0,hostfwd=tcp::8920-:8920 \
  -device virtio-net-pci,netdev=net0 \
  -nographic \
  -no-reboot

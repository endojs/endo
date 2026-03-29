#!/bin/bash
# Boot Endo OS (seL4 x86_64) in QEMU.
# Ctrl-A X to exit.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${SCRIPT_DIR}/out/endo-os.img"
KERNEL="${SCRIPT_DIR}/out/sel4_32.elf"

if [ ! -f "${IMAGE}" ]; then
  echo "ERROR: seL4 image not found. Run ./sel4/build/build-sel4.sh"
  exit 1
fi

if [ ! -f "${KERNEL}" ]; then
  echo "ERROR: seL4 kernel not found at ${KERNEL}"
  echo "The build should extract it from the Microkit SDK."
  exit 1
fi

echo "=== Endo OS: Booting on seL4 (x86_64) ==="
echo "    Kernel: seL4 (formally verified)"
echo "    Engine: QuickJS-ng (native lockdown)"
echo ""
echo "    Press Ctrl-A X to exit QEMU"
echo ""

exec qemu-system-x86_64 \
  -cpu qemu64,+fsgsbase,+pdpe1gb,+xsaveopt,+xsave \
  -m 1G \
  -nographic \
  -serial mon:stdio \
  -kernel "${KERNEL}" \
  -initrd "${IMAGE}"

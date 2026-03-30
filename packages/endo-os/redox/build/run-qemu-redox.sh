#!/bin/bash
# Boot Endo OS on Redox in QEMU.
# Ctrl-A X to exit.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${SCRIPT_DIR}/out/redox.img"
BINARY="${SCRIPT_DIR}/out/endo-init"

if [ -f "${IMAGE}" ]; then
  echo "=== Endo OS: Booting Redox ==="
  echo "    Press Ctrl-A X to exit QEMU"
  echo ""

  exec qemu-system-x86_64 \
    -m 2048 \
    -smp 4 \
    -machine q35 \
    -serial mon:stdio \
    -nographic -vga none \
    -device e1000,netdev=net0 \
    -netdev user,id=net0,hostfwd=tcp::8920-:8920 \
    -drive file="${IMAGE}",format=raw

elif [ -f "${BINARY}" ]; then
  echo "=== Endo OS: Running binary directly ==="
  echo "(No Redox image — running on host Linux/macOS)"
  echo ""
  exec "${BINARY}"

else
  echo "ERROR: No Redox image or binary found."
  echo "Run: ./redox/build/build-redox.sh"
  exit 1
fi

#!/bin/bash
# Boot Endo OS (seL4) in QEMU.
# Ctrl-A X to exit.
#
# On Apple Silicon (M1/M2/M3): uses HVF for native-speed AArch64.
# On x86_64 Linux: uses KVM for native-speed x86_64.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${SCRIPT_DIR}/out/endo-os.img"

if [ ! -f "${IMAGE}" ]; then
  echo "ERROR: seL4 image not found. Run ./sel4/build/build-sel4.sh"
  exit 1
fi

# Detect host architecture and pick the right QEMU.
ARCH=$(uname -m)

echo "=== Endo OS: Booting on seL4 ==="
echo "    Host:   ${ARCH}"

if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
  # Apple Silicon or ARM64 Linux — use AArch64 QEMU with HVF/KVM.
  QEMU=qemu-system-aarch64
  # HVF doesn't work with seL4 (assertion failure in hvf_handle_exception).
  # TCG on host is still faster than QEMU-in-Docker.
  ACCEL=""
  if [ -e /dev/kvm ]; then
    ACCEL="-accel kvm"
    echo "    Accel:  KVM (native ARM64)"
  else
    echo "    Accel:  none (emulated)"
  fi

  echo "    Kernel: seL4 (formally verified, AArch64)"
  echo "    Engine: QuickJS-ng (native lockdown)"
  echo ""
  echo "    Press Ctrl-A X to exit QEMU"
  echo ""

  exec $QEMU \
    $ACCEL \
    -machine virt,virtualization=on \
    -cpu cortex-a53 \
    -m size=2G \
    -nographic \
    -serial mon:stdio \
    -device loader,file="${IMAGE}",addr=0x70000000,cpu-num=0

elif [ "$ARCH" = "x86_64" ]; then
  # x86_64 — use x86 QEMU.
  KERNEL="${SCRIPT_DIR}/out/sel4_32.elf"
  if [ ! -f "${KERNEL}" ]; then
    echo "ERROR: sel4_32.elf not found. Rebuild with x86_64 target."
    exit 1
  fi

  QEMU=qemu-system-x86_64
  ACCEL=""
  if [ -e /dev/kvm ]; then
    ACCEL="-accel kvm"
    echo "    Accel:  KVM (native x86_64)"
  else
    echo "    Accel:  none (emulated)"
  fi

  echo "    Kernel: seL4 (formally verified, x86_64)"
  echo ""
  echo "    Press Ctrl-A X to exit QEMU"
  echo ""

  exec $QEMU \
    $ACCEL \
    -cpu qemu64,+fsgsbase,+pdpe1gb,+xsaveopt,+xsave \
    -m 1G \
    -nographic \
    -serial mon:stdio \
    -kernel "${KERNEL}" \
    -initrd "${IMAGE}"
else
  echo "ERROR: Unsupported architecture: ${ARCH}"
  exit 1
fi

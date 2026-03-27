#!/bin/bash
# Boot Endo OS in QEMU.
#
# Modes:
#   ./run-qemu.sh           Serial console only (Ctrl-A X to quit)
#   ./run-qemu.sh --gui     Graphical window with framebuffer + audio
#   ./run-qemu.sh --docker  Use Docker build output (build/out/)
#
# Port 8920 is forwarded from localhost to the VM for the
# WebSocket gateway (Phase 4+).
#
# Device capabilities available inside the VM:
#   - Block device:  /dev/vda (virtio-blk, 64MB)
#   - Network:       virtio-net (host port 8920 → VM 8920)
#   - Display:       virtio-gpu / bochs-display framebuffer
#   - Audio:         Intel HDA (mic input + speaker output)
#   - Camera:        USB passthrough (requires --usb-camera /dev/videoN)
#   - Keyboard:      PS/2 or USB HID

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}"

MEMORY="${QEMU_MEMORY:-512M}"

# Parse arguments.
GUI_MODE=false
DOCKER_MODE=false
USB_CAMERA=""
for arg in "$@"; do
  case "$arg" in
    --gui) GUI_MODE=true ;;
    --docker) DOCKER_MODE=true ;;
    --usb-camera=*) USB_CAMERA="${arg#*=}" ;;
  esac
done

# Set paths based on build mode.
if [ "$DOCKER_MODE" = true ]; then
  KERNEL="${BUILD_DIR}/out/bzImage"
  INITRAMFS="${BUILD_DIR}/out/initramfs.cpio.gz"
else
  KERNEL="${BUILD_DIR}/_kernel_out/arch/x86/boot/bzImage"
  INITRAMFS="${BUILD_DIR}/initramfs.cpio.gz"
fi
STORE_IMG="${BUILD_DIR}/store.img"

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

# Create a persistent block store image if it doesn't exist.
if [ ! -f "${STORE_IMG}" ]; then
  echo "--- Creating 64MB block store image ---"
  dd if=/dev/zero of="${STORE_IMG}" bs=1M count=64 2>/dev/null
fi

echo "=== Endo OS: Booting in QEMU ==="
echo "    Kernel:    ${KERNEL}"
echo "    Initramfs: ${INITRAMFS}"
echo "    Memory:    ${MEMORY}"
echo "    Store:     ${STORE_IMG}"
echo "    Gateway:   localhost:8920 → VM:8920"
echo "    Mode:      $([ "$GUI_MODE" = true ] && echo "GUI" || echo "Serial")"
echo ""

# Build the QEMU command.
QEMU_ARGS=(
  -kernel "${KERNEL}"
  -initrd "${INITRAMFS}"
  -m "${MEMORY}"
  -no-reboot

  # Block device for persistence (disk capability).
  -drive file="${STORE_IMG}",format=raw,if=virtio

  # Network with port forwarding (network capability).
  -netdev user,id=net0,hostfwd=tcp::8920-:8920
  -device virtio-net-pci,netdev=net0

  # Audio: Intel HDA with duplex (mic + speaker).
  # The microphone capability reads from the capture stream.
  -device intel-hda
  -device hda-duplex

  # USB host controller (for camera passthrough).
  -device qemu-xhci,id=xhci
)

if [ "$GUI_MODE" = true ]; then
  # Graphical mode: framebuffer + keyboard + mouse.
  QEMU_ARGS+=(
    -append "console=tty0 quiet panic=-1"
    -display default
    -device virtio-gpu-pci
    -device virtio-keyboard-pci
    -device virtio-mouse-pci
  )
  echo "    Display:   virtio-gpu (graphical window)"
  echo "    Keyboard:  virtio-keyboard"
else
  # Serial-only mode for headless/CI testing.
  QEMU_ARGS+=(
    -append "console=ttyS0 quiet panic=-1"
    -nographic
  )
fi

# USB camera passthrough (if requested).
if [ -n "$USB_CAMERA" ]; then
  # Extract bus and device from /dev/videoN by looking up USB parent.
  echo "    Camera:    USB passthrough ${USB_CAMERA}"
  QEMU_ARGS+=(-device usb-host,hostdevice="${USB_CAMERA}")
fi

echo ""
if [ "$GUI_MODE" != true ]; then
  echo "    Press Ctrl-A X to exit QEMU"
  echo ""
fi

exec qemu-system-x86_64 "${QEMU_ARGS[@]}"

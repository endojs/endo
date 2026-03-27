#!/bin/bash
# Create a VirtualBox-bootable disk image from the Docker build output.
#
# VirtualBox can't boot a raw kernel+initramfs like QEMU can.
# This script creates a proper bootable disk image with GRUB that
# VirtualBox can import.
#
# Usage:
#   ./build/build-docker.sh          # build first
#   ./build/make-vbox-image.sh       # create VBox image
#
# Then in VirtualBox:
#   1. New → Name: "Endo OS", Type: Linux, Version: Other Linux (64-bit)
#   2. Memory: 512 MB
#   3. Hard disk → Use an existing virtual hard disk file
#   4. Browse to build/out/endo-os.vdi
#   5. Settings → System → Enable EFI (optional)
#   6. Settings → Audio → Enable Audio, Host Driver: CoreAudio
#   7. Settings → Network → Attached to: NAT, Port Forwarding:
#      Host 8920 → Guest 8920 (TCP)
#   8. Start!
#
# Requires: qemu-img (brew install qemu)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/out"

KERNEL="${OUT_DIR}/bzImage"
INITRAMFS="${OUT_DIR}/initramfs.cpio.gz"
RAW_IMG="${OUT_DIR}/endo-os.raw"
VDI_IMG="${OUT_DIR}/endo-os.vdi"

DISK_SIZE_MB=256  # Small — OS is in initramfs, disk is for the block store

echo "=== Creating VirtualBox disk image ==="

# Check prerequisites.
if [ ! -f "${KERNEL}" ] || [ ! -f "${INITRAMFS}" ]; then
  echo "ERROR: Build artifacts not found in ${OUT_DIR}/"
  echo "Run ./build/build-docker.sh first."
  exit 1
fi

if ! command -v qemu-img &> /dev/null; then
  echo "ERROR: qemu-img not found. Install with: brew install qemu"
  exit 1
fi

# We'll use a Docker container to create the bootable image since
# macOS can't easily create ext2/GRUB images natively.
echo "--- Creating bootable disk image via Docker ---"

docker run --rm \
  -v "${OUT_DIR}:/out" \
  --privileged \
  ubuntu:24.04 bash -c '
set -e
apt-get update -qq && apt-get install -y -qq grub-pc-bin grub2-common dosfstools e2fsprogs parted > /dev/null 2>&1

DISK=/out/endo-os.raw
DISK_SIZE='"${DISK_SIZE_MB}"'

# Create raw disk image.
dd if=/dev/zero of=${DISK} bs=1M count=${DISK_SIZE} 2>/dev/null

# Partition: 1MB BIOS boot + rest is Linux.
parted -s ${DISK} mklabel msdos
parted -s ${DISK} mkpart primary ext2 1MiB 2MiB    # GRUB BIOS boot
parted -s ${DISK} set 1 bios_grub on
parted -s ${DISK} mkpart primary ext2 2MiB 100%     # Boot + data

# Set up loop device.
LOOP=$(losetup --find --show --partscan ${DISK})
PART="${LOOP}p2"

# Wait for partition device to appear.
sleep 1
[ -b "${PART}" ] || partprobe ${LOOP} && sleep 1

# Format and mount.
mkfs.ext2 -q ${PART}
MOUNT=/mnt/endo
mkdir -p ${MOUNT}
mount ${PART} ${MOUNT}

# Create boot directory structure.
mkdir -p ${MOUNT}/boot/grub

# Copy kernel and initramfs.
cp /out/bzImage ${MOUNT}/boot/bzImage
cp /out/initramfs.cpio.gz ${MOUNT}/boot/initramfs.cpio.gz

# Create GRUB config.
cat > ${MOUNT}/boot/grub/grub.cfg << GRUB_EOF
set default=0
set timeout=3

menuentry "Endo OS" {
    linux /boot/bzImage console=tty0 quiet panic=-1
    initrd /boot/initramfs.cpio.gz
}

menuentry "Endo OS (serial console)" {
    linux /boot/bzImage console=ttyS0 quiet panic=-1
    initrd /boot/initramfs.cpio.gz
}

menuentry "Endo OS (verbose)" {
    linux /boot/bzImage console=tty0 panic=-1
    initrd /boot/initramfs.cpio.gz
}
GRUB_EOF

# Install GRUB.
grub-install --target=i386-pc --boot-directory=${MOUNT}/boot --no-floppy ${LOOP}

# Allocate space for the block store (data partition area).
dd if=/dev/zero of=${MOUNT}/store.img bs=1M count=64 2>/dev/null

# Clean up.
umount ${MOUNT}
losetup -d ${LOOP}

echo "Raw disk image created: ${DISK_SIZE}MB"
'

# Convert raw image to VDI for VirtualBox.
echo "--- Converting to VDI format ---"
rm -f "${VDI_IMG}"
qemu-img convert -f raw -O vdi "${RAW_IMG}" "${VDI_IMG}"

# Clean up raw image (keep only VDI).
rm -f "${RAW_IMG}"

echo ""
echo "=== VirtualBox image created ==="
echo "    File: ${VDI_IMG}"
echo "    Size: $(du -h "${VDI_IMG}" | cut -f1)"
echo ""
echo "To use in VirtualBox:"
echo "  1. New VM → Name: 'Endo OS', Type: Linux, 64-bit"
echo "  2. Memory: 512 MB"
echo "  3. Use existing disk → ${VDI_IMG}"
echo "  4. Settings → Network → NAT → Port Forward: 8920 ��� 8920"
echo "  5. Settings → Audio → Enable (for microphone capability)"
echo "  6. Start!"

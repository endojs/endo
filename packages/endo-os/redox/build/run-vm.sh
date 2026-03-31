#!/bin/bash
# Run Endo OS in a lightweight VM with dynamic folder sharing.
#
# Uses QEMU + virtio-9p to share host directories into the VM.
# New directories can be shared to a running VM via QMP (QEMU
# Machine Protocol) — this is the "Redox as hypervisor" model
# running on a minimal Linux until Redox image support lands.
#
# Usage:
#   ./run-vm.sh                             # bare shell
#   ./run-vm.sh --share docs=$HOME/docs     # share a folder
#   ./run-vm.sh --share project=$(pwd) --share home=$HOME
#
# To add a folder to a RUNNING VM (via QEMU monitor):
#   Press Ctrl-A C to enter QEMU monitor, then:
#   chardev-add socket,id=shr1,path=/tmp/share.sock,server=on,wait=off
#   (dynamic 9p shares require QMP — see docs)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${SCRIPT_DIR}/out/endo-init"

if [ ! -f "$BINARY" ]; then
  echo "ERROR: endo-init not found. Run ./redox/build/build-redox.sh"
  exit 1
fi

# Parse --share name=path arguments.
QEMU_9P_ARGS=""
ENDO_MOUNT_ARGS=""
SHARE_COUNT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --share)
      shift
      NAME="${1%%=*}"
      SHARE_PATH="${1#*=}"
      # Resolve to absolute path.
      ABS_PATH="$(cd "$SHARE_PATH" 2>/dev/null && pwd || echo "$SHARE_PATH")"

      QEMU_9P_ARGS="${QEMU_9P_ARGS} -fsdev local,id=fs_${NAME},path=${ABS_PATH},security_model=none"
      QEMU_9P_ARGS="${QEMU_9P_ARGS} -device virtio-9p-pci,fsdev=fs_${NAME},mount_tag=${NAME}"
      ENDO_MOUNT_ARGS="${ENDO_MOUNT_ARGS} --mount ${NAME}=/mnt/${NAME}"
      SHARE_COUNT=$((SHARE_COUNT + 1))
      echo "Share: ${NAME} → ${ABS_PATH}"
      shift
      ;;
    --port)
      shift
      ENDO_MOUNT_ARGS="${ENDO_MOUNT_ARGS} --port $1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

echo ""
echo "=== Endo OS VM ==="
echo "    Shares: ${SHARE_COUNT}"
echo "    Press Ctrl-A X to exit"
echo ""

# Create a minimal initramfs with our binary + mount script.
TMPDIR=$(mktemp -d)
trap "rm -rf ${TMPDIR}" EXIT

mkdir -p "${TMPDIR}/initramfs"/{bin,mnt,proc,sys,dev,tmp}

cp "${BINARY}" "${TMPDIR}/initramfs/bin/endo-init"
chmod +x "${TMPDIR}/initramfs/bin/endo-init"

# Create init script that mounts 9p shares then runs endo-init.
cat > "${TMPDIR}/initramfs/init" << 'INITEOF'
#!/bin/sh
mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev

# Mount all 9p shares listed in /proc/cmdline.
# Format: endo_mounts=name1,name2,name3
MOUNTS=$(cat /proc/cmdline | tr ' ' '\n' | grep endo_mounts= | sed 's/endo_mounts=//')
MOUNT_ARGS=""

if [ -n "$MOUNTS" ]; then
  IFS=',' read -ra NAMES <<< "$MOUNTS"
  for NAME in $NAMES; do
    mkdir -p "/mnt/${NAME}"
    mount -t 9p -o trans=virtio "${NAME}" "/mnt/${NAME}" 2>/dev/null && \
      MOUNT_ARGS="${MOUNT_ARGS} --mount ${NAME}=/mnt/${NAME}" && \
      echo "Mounted: ${NAME} → /mnt/${NAME}" || \
      echo "Warning: could not mount ${NAME}"
  done
fi

# Extract additional args from cmdline.
EXTRA_ARGS=$(cat /proc/cmdline | tr ' ' '\n' | grep endo_args= | sed 's/endo_args=//' | tr ',' ' ')

echo ""
exec /bin/endo-init ${MOUNT_ARGS} ${EXTRA_ARGS}
INITEOF
chmod +x "${TMPDIR}/initramfs/init"

# Also include busybox for shell utilities (mount, etc).
# Try to find a static busybox.
BUSYBOX=$(which busybox 2>/dev/null || echo "")
if [ -z "$BUSYBOX" ]; then
  # Download a static busybox for the host architecture.
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then ARCH="aarch64"; fi
  echo "Downloading busybox for ${ARCH}..."
  curl -sL "https://busybox.net/downloads/binaries/1.35.0-${ARCH}-linux-musl/busybox" \
    -o "${TMPDIR}/initramfs/bin/busybox" 2>/dev/null || \
  curl -sL "https://busybox.net/downloads/binaries/1.35.0-x86_64-linux-musl/busybox" \
    -o "${TMPDIR}/initramfs/bin/busybox" 2>/dev/null || \
  echo "Warning: could not download busybox, 9p mounts won't work"
fi
if [ -f "${TMPDIR}/initramfs/bin/busybox" ]; then
  chmod +x "${TMPDIR}/initramfs/bin/busybox"
  # Create symlinks for utilities.
  for cmd in sh mount umount mkdir cat ls; do
    ln -sf busybox "${TMPDIR}/initramfs/bin/${cmd}"
  done
fi

# Build initramfs.
(cd "${TMPDIR}/initramfs" && find . | cpio -o -H newc 2>/dev/null | gzip) > "${TMPDIR}/initramfs.cpio.gz"

# We need a kernel. Check for one or download.
KERNEL="${SCRIPT_DIR}/out/vmlinuz"
if [ ! -f "$KERNEL" ]; then
  ARCH=$(uname -m)
  echo "Downloading minimal Linux kernel for ${ARCH}..."
  # Use the kernel from the Docker build, or download a pre-built one.
  # For now, try to extract from Docker.
  docker run --rm -v "${SCRIPT_DIR}/out:/out" ubuntu:24.04 \
    sh -c 'cp /boot/vmlinuz-* /out/vmlinuz 2>/dev/null || echo "No kernel in container"'
fi

if [ ! -f "$KERNEL" ]; then
  echo "ERROR: No kernel found at ${KERNEL}"
  echo "Copy a vmlinuz to ${KERNEL}, or we'll need to build one."
  echo ""
  echo "Quick fix: docker run --rm -v ${SCRIPT_DIR}/out:/out ubuntu:24.04 sh -c 'apt-get update && apt-get install -y linux-image-generic && cp /boot/vmlinuz-* /out/vmlinuz'"
  exit 1
fi

# Build comma-separated mount name list for kernel cmdline.
MOUNT_NAMES=$(echo "${ENDO_MOUNT_ARGS}" | grep -o '\-\-mount [a-zA-Z_]*=' | sed 's/--mount //;s/=//' | tr '\n' ',' | sed 's/,$//')

echo "Starting QEMU VM..."

# Detect host arch for QEMU.
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
  exec qemu-system-aarch64 \
    -machine virt \
    -cpu cortex-a72 \
    -m 512M \
    -nographic \
    -serial mon:stdio \
    -kernel "${KERNEL}" \
    -initrd "${TMPDIR}/initramfs.cpio.gz" \
    -append "console=ttyAMA0 quiet endo_mounts=${MOUNT_NAMES}" \
    ${QEMU_9P_ARGS}
else
  exec qemu-system-x86_64 \
    -m 512M \
    -nographic \
    -serial mon:stdio \
    -kernel "${KERNEL}" \
    -initrd "${TMPDIR}/initramfs.cpio.gz" \
    -append "console=ttyS0 quiet endo_mounts=${MOUNT_NAMES}" \
    ${QEMU_9P_ARGS} \
    -enable-kvm 2>/dev/null || \
  exec qemu-system-x86_64 \
    -m 512M \
    -nographic \
    -serial mon:stdio \
    -kernel "${KERNEL}" \
    -initrd "${TMPDIR}/initramfs.cpio.gz" \
    -append "console=ttyS0 quiet endo_mounts=${MOUNT_NAMES}" \
    ${QEMU_9P_ARGS}
fi

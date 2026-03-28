#!/bin/bash
# Assemble the initramfs for Endo OS.
#
# The initramfs contains:
#   - /init (symlink to /endo-init)
#   - /endo-init (static binary: V8 + SES + daemon bootstrap)
#   - /ses-lockdown.js (SES lockdown bundle)
#   - /bootstrap.js (Endo daemon bootstrap script)
#   - /dev, /proc, /sys (empty mount points for kernel)
#
# Output: $BUILD_DIR/initramfs.cpio.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENDO_OS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="${ENDO_OS_DIR}/build"

INITRAMFS_DIR="${BUILD_DIR}/_initramfs"
ENDO_INIT="${BUILD_DIR}/endo-init"
SES_BUNDLE="${ENDO_OS_DIR}/src/js/ses-lockdown.js"
DEVICES_JS="${ENDO_OS_DIR}/src/js/devices.js"
BOOTSTRAP="${ENDO_OS_DIR}/src/js/bootstrap.js"

echo "=== Endo OS: Assembling initramfs ==="

# Check that endo-init exists.
if [ ! -f "${ENDO_INIT}" ]; then
  echo "ERROR: ${ENDO_INIT} not found."
  echo "Run 'cargo build --release' first."
  exit 1
fi

# Clean and create initramfs structure.
rm -rf "${INITRAMFS_DIR}"
mkdir -p "${INITRAMFS_DIR}"/{dev,proc,sys}

# Copy endo-init binary.
cp "${ENDO_INIT}" "${INITRAMFS_DIR}/endo-init"
chmod 755 "${INITRAMFS_DIR}/endo-init"

# /init must exist for the kernel to find it.
ln -sf /endo-init "${INITRAMFS_DIR}/init"

# Copy JS sources.
if [ -f "${SES_BUNDLE}" ]; then
  cp "${SES_BUNDLE}" "${INITRAMFS_DIR}/ses-lockdown.js"
  echo "    Included: ses-lockdown.js"
else
  echo "    WARNING: ${SES_BUNDLE} not found, SES will use embedded blob"
fi

if [ -f "${DEVICES_JS}" ]; then
  cp "${DEVICES_JS}" "${INITRAMFS_DIR}/devices.js"
  echo "    Included: devices.js"
else
  echo "    WARNING: ${DEVICES_JS} not found"
fi

if [ -f "${BOOTSTRAP}" ]; then
  cp "${BOOTSTRAP}" "${INITRAMFS_DIR}/bootstrap.js"
  echo "    Included: bootstrap.js"
else
  echo "    WARNING: ${BOOTSTRAP} not found, bootstrap will use embedded blob"
fi

# Create the cpio archive.
echo "--- Packing initramfs ---"
cd "${INITRAMFS_DIR}"
find . | cpio -o -H newc 2>/dev/null | gzip > "${BUILD_DIR}/initramfs.cpio.gz"

echo "=== initramfs complete ==="
echo "    Image:    ${BUILD_DIR}/initramfs.cpio.gz"
echo "    Size:     $(du -h "${BUILD_DIR}/initramfs.cpio.gz" | cut -f1)"

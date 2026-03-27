#!/bin/bash
# Build a minimal Linux kernel for Endo OS.
#
# The kernel provides only:
#   - Memory management (mmap, mprotect for V8 JIT)
#   - Basic threading (pthreads for V8 isolate threads)
#   - virtio drivers (block, network for QEMU)
#   - Serial console (ttyS0 for output)
#   - Timer/RTC (for setTimeout / Date.now)
#
# Everything else is disabled.  There is no filesystem, no
# process isolation, no shell.  PID 1 is endo-init.
#
# Output: $KERNEL_OUT/bzImage

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENDO_OS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="${ENDO_OS_DIR}/build"

KERNEL_SRC="${KERNEL_SRC:-${BUILD_DIR}/_kernel_src}"
KERNEL_OUT="${BUILD_DIR}/_kernel_out"
KERNEL_VERSION="${KERNEL_VERSION:-6.8}"
KERNEL_CONFIG="${ENDO_OS_DIR}/kernel/qemu-x86_64.config"

echo "=== Endo OS: Building Linux kernel ==="
echo "    Source:  ${KERNEL_SRC}"
echo "    Output:  ${KERNEL_OUT}"
echo "    Config:  ${KERNEL_CONFIG}"

# Download kernel source if not present.
if [ ! -d "${KERNEL_SRC}" ]; then
  echo "--- Downloading Linux ${KERNEL_VERSION} ---"
  mkdir -p "${KERNEL_SRC}"

  MAJOR_VERSION=$(echo "${KERNEL_VERSION}" | cut -d. -f1)
  TARBALL="linux-${KERNEL_VERSION}.tar.xz"
  URL="https://cdn.kernel.org/pub/linux/kernel/v${MAJOR_VERSION}.x/${TARBALL}"

  curl -L -o "${BUILD_DIR}/${TARBALL}" "${URL}"
  tar xf "${BUILD_DIR}/${TARBALL}" -C "${BUILD_DIR}"
  mv "${BUILD_DIR}/linux-${KERNEL_VERSION}" "${KERNEL_SRC}"
  rm -f "${BUILD_DIR}/${TARBALL}"
fi

# Copy our minimal config.
echo "--- Configuring kernel ---"
mkdir -p "${KERNEL_OUT}"
cp "${KERNEL_CONFIG}" "${KERNEL_OUT}/.config"
make -C "${KERNEL_SRC}" O="${KERNEL_OUT}" olddefconfig

# Build.
echo "--- Building kernel (this takes ~5 minutes) ---"
make -C "${KERNEL_SRC}" O="${KERNEL_OUT}" -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)" bzImage

echo "=== Kernel build complete ==="
echo "    Image: ${KERNEL_OUT}/arch/x86/boot/bzImage"

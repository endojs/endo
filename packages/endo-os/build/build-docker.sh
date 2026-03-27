#!/bin/bash
# Build Endo OS using Docker (works on macOS, Linux, Windows).
#
# This is the recommended way to build on macOS since we need a
# Linux toolchain for the kernel, V8, and static linking.
#
# Usage:
#   cd packages/endo-os
#   ./build/build-docker.sh
#
# Output:
#   build/out/bzImage           — Linux kernel
#   build/out/initramfs.cpio.gz — Boot image
#   build/out/endo-init         — The PID 1 binary (for inspection)
#
# Then boot with:
#   ./build/run-qemu.sh --docker

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENDO_OS_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Endo OS: Docker Build ==="
echo ""
echo "This builds V8, Linux kernel, and endo-init inside Docker."
echo "First run takes ~30 minutes (V8 build). Subsequent runs"
echo "use Docker layer caching and are much faster."
echo ""

# Check Docker is available.
if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker not found."
  echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

# Create output directory.
mkdir -p "${SCRIPT_DIR}/out"

# Build the Docker image.
echo "--- Building Docker image (this caches between runs) ---"
cd "${ENDO_OS_DIR}"
docker build \
  -t endo-os-builder \
  -f build/Dockerfile \
  --progress=plain \
  .

# Extract artifacts.
echo ""
echo "--- Extracting build artifacts ---"
docker run --rm \
  -v "${SCRIPT_DIR}/out:/out" \
  endo-os-builder

echo ""
echo "=== Build complete! ==="
echo ""
echo "Artifacts:"
ls -lh "${SCRIPT_DIR}/out/"
echo ""
echo "To boot in QEMU:"
echo "  brew install qemu    # if not already installed"
echo "  ./build/run-qemu.sh --docker"
echo ""
echo "To boot in VirtualBox:"
echo "  ./build/make-vbox-image.sh"
echo "  # Then import build/out/endo-os.vdi in VirtualBox"

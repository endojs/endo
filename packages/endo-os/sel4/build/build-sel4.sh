#!/bin/bash
# Build Endo OS for seL4 Microkit using Docker.
#
# Usage:
#   cd packages/endo-os
#   ./sel4/build/build-sel4.sh
#
# Then boot:
#   ./sel4/build/run-qemu-sel4.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SEL4_DIR="$(dirname "$SCRIPT_DIR")"
ENDO_OS_DIR="$(dirname "$SEL4_DIR")"

echo "=== Endo OS: seL4 Microkit Build ==="
echo ""
echo "Building PD for the formally verified seL4 kernel."
echo ""

if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker not found."
  echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

mkdir -p "${SCRIPT_DIR}/out"

echo "--- Building Docker image ---"
cd "${ENDO_OS_DIR}"
docker build \
  -t endo-os-sel4 \
  -f sel4/build/Dockerfile \
  --progress=plain \
  --no-cache \
  .

echo ""
echo "--- Extracting build artifacts ---"
docker run --rm \
  -v "${SCRIPT_DIR}/out:/out" \
  endo-os-sel4

echo ""
if [ -f "${SCRIPT_DIR}/out/endo-os.img" ]; then
  echo "=== Build succeeded! ==="
  ls -lh "${SCRIPT_DIR}/out/"
  echo ""
  echo "Boot with:"
  echo "  ./sel4/build/run-qemu-sel4.sh"
else
  echo "=== Build produced no image — check Docker output above ==="
  exit 1
fi

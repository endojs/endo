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

echo "=== Endo OS: seL4 Microkit Build ==="
echo ""
echo "Building QuickJS + SES on the formally verified seL4 kernel."
echo "First run downloads the Microkit SDK (~5 min). Subsequent"
echo "runs use Docker caching."
echo ""

if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker not found."
  echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

mkdir -p "${SCRIPT_DIR}/out"

echo "--- Building Docker image ---"
cd "${SEL4_DIR}"
docker build \
  -t endo-os-sel4 \
  -f build/Dockerfile \
  --progress=plain \
  .

echo ""
echo "--- Extracting build artifacts ---"
docker run --rm \
  -v "${SCRIPT_DIR}/out:/out" \
  endo-os-sel4

echo ""
echo "=== Build complete ==="
echo ""
echo "To boot in QEMU:"
echo "  ./sel4/build/run-qemu-sel4.sh"

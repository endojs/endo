#!/bin/bash
# Build Endo OS for Redox using Docker.
#
# Produces:
#   - endo-init binary (cross-compiled for Redox, or native Linux fallback)
#   - redox.img (base Redox image, if downloadable)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REDOX_DIR="$(dirname "$SCRIPT_DIR")"
ENDO_OS_DIR="$(dirname "$REDOX_DIR")"
REPO_ROOT="$(cd "$ENDO_OS_DIR/../.." && pwd)"

QUICKJS_DIR="$(cd "${REPO_ROOT}/.." && pwd)/quickjs"

echo "=== Endo OS: Redox Build ==="
echo ""

if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker not found."
  exit 1
fi

if [ ! -f "${QUICKJS_DIR}/quickjs.c" ]; then
  echo "ERROR: QuickJS-ng not found at ${QUICKJS_DIR}"
  exit 1
fi

mkdir -p "${SCRIPT_DIR}/out"

TMPCTX=$(mktemp -d)
trap "rm -rf ${TMPCTX}" EXIT

echo "--- Preparing build context ---"
mkdir -p "${TMPCTX}/quickjs"
(cd "${QUICKJS_DIR}" && git archive native-ses) | tar x -C "${TMPCTX}/quickjs" 2>/dev/null || \
  cp -r "${QUICKJS_DIR}" "${TMPCTX}/quickjs"

mkdir -p "${TMPCTX}/packages/endo-os"
cp -r "${REDOX_DIR}" "${TMPCTX}/packages/endo-os/redox"
cp -r "${ENDO_OS_DIR}/src" "${TMPCTX}/packages/endo-os/src"
# Reuse the seL4 SES shim (same file, works everywhere).
mkdir -p "${TMPCTX}/packages/endo-os/sel4/src"
cp "${ENDO_OS_DIR}/sel4/src/ses-shim.js" "${TMPCTX}/packages/endo-os/sel4/src/ses-shim.js"

echo "--- Building Docker image ---"
docker build \
  -t endo-os-redox \
  -f "${REDOX_DIR}/build/Dockerfile" \
  --progress=plain \
  --no-cache \
  "${TMPCTX}"

echo ""
echo "--- Extracting build artifacts ---"
docker run --rm \
  -v "${SCRIPT_DIR}/out:/out" \
  endo-os-redox

echo ""
if [ -f "${SCRIPT_DIR}/out/endo-init" ]; then
  echo "=== Build succeeded! ==="
  ls -lh "${SCRIPT_DIR}/out/"
  echo ""
  echo "To test on Linux directly:"
  echo "  ./redox/build/out/endo-init"
  echo ""
  echo "To boot in Redox QEMU (when image available):"
  echo "  ./redox/build/run-qemu-redox.sh"
else
  echo "=== Build failed ==="
  exit 1
fi

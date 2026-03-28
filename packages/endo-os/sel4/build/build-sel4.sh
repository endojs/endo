#!/bin/bash
# Build Endo OS for seL4 with real SES on QuickJS-ng.
#
# Docker context is the repo root (../../..) so we can pull in:
#   - ../quickjs/ (QuickJS-ng 0.13.0 with SES fix)
#   - packages/ses/dist/ses.cjs (real SES bundle)
#   - packages/endo-os/sel4/ (our PD source)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SEL4_DIR="$(dirname "$SCRIPT_DIR")"
ENDO_OS_DIR="$(dirname "$SEL4_DIR")"

# The endo-os git worktree root.
REPO_ROOT="$(cd "$ENDO_OS_DIR/../.." && pwd)"

echo "=== Endo OS: seL4 + QuickJS-ng + Real SES ==="
echo ""

if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker not found."
  exit 1
fi

# quickjs is a sibling directory of the endo-os worktree.
QUICKJS_DIR="$(cd "${REPO_ROOT}/.." && pwd)/quickjs"
if [ ! -f "${QUICKJS_DIR}/quickjs.c" ]; then
  echo "ERROR: QuickJS-ng not found at ${QUICKJS_DIR}"
  echo "Expected ../quickjs relative to the endo-os worktree."
  exit 1
fi

# SES bundle lives in the main endo repo (sibling worktree or ../endo).
SES_BUNDLE="${REPO_ROOT}/packages/ses/dist/ses.cjs"
if [ ! -f "${SES_BUNDLE}" ]; then
  # Try the main endo repo as a sibling directory.
  SES_BUNDLE="$(cd "${REPO_ROOT}/.." && pwd)/endo/packages/ses/dist/ses.cjs"
fi
if [ ! -f "${SES_BUNDLE}" ]; then
  echo "ERROR: SES bundle not found at ${SES_BUNDLE}"
  echo "Run 'cd packages/ses && yarn build' in the main endo repo."
  exit 1
fi

mkdir -p "${SCRIPT_DIR}/out"

echo "QuickJS-ng: ${QUICKJS_DIR}"
echo "SES bundle: ${SES_BUNDLE} ($(du -h "${SES_BUNDLE}" | cut -f1))"
echo ""

# We need a Docker context that includes both ../quickjs and our packages.
# Create a temporary context with symlinks.
TMPCTX=$(mktemp -d)
trap "rm -rf ${TMPCTX}" EXIT

# Copy what Docker needs (can't use symlinks with Docker).
echo "--- Preparing build context ---"
cp -r "${QUICKJS_DIR}" "${TMPCTX}/quickjs"
mkdir -p "${TMPCTX}/packages/ses/dist"
cp "${SES_BUNDLE}" "${TMPCTX}/packages/ses/dist/ses.cjs"
mkdir -p "${TMPCTX}/packages/endo-os"
cp -r "${SEL4_DIR}" "${TMPCTX}/packages/endo-os/sel4"
cp -r "${ENDO_OS_DIR}/src" "${TMPCTX}/packages/endo-os/src"

echo "--- Building Docker image ---"
docker build \
  -t endo-os-sel4 \
  -f "${SEL4_DIR}/build/Dockerfile" \
  --progress=plain \
  --no-cache \
  "${TMPCTX}"

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
  echo "Boot with: ./sel4/build/run-qemu-sel4.sh"
else
  echo "=== Build failed — check output above ==="
  exit 1
fi

#!/bin/bash
# Build Endo OS for seL4 with native lockdown + bytecode precompile.
#
# Uses QuickJS-ng native-ses branch:
#   - Native lockdown() freezes intrinsics in <1ms
#   - Native harden() deep-freezes objects
#   - Native Compartment with isolated JSContext
#   - qjsc compiles daemon bundle to bytecode

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SEL4_DIR="$(dirname "$SCRIPT_DIR")"
ENDO_OS_DIR="$(dirname "$SEL4_DIR")"
REPO_ROOT="$(cd "$ENDO_OS_DIR/../.." && pwd)"

echo "=== Endo OS: seL4 + Native Lockdown + Bytecode ==="
echo ""

if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker not found."
  exit 1
fi

QUICKJS_DIR="$(cd "${REPO_ROOT}/.." && pwd)/quickjs"
if [ ! -f "${QUICKJS_DIR}/quickjs.c" ]; then
  echo "ERROR: QuickJS-ng not found at ${QUICKJS_DIR}"
  exit 1
fi

mkdir -p "${SCRIPT_DIR}/out"

echo "QuickJS-ng: ${QUICKJS_DIR} (native-ses branch)"
echo ""

TMPCTX=$(mktemp -d)
trap "rm -rf ${TMPCTX}" EXIT

echo "--- Preparing build context ---"

# QuickJS-ng native-ses branch.
mkdir -p "${TMPCTX}/quickjs"
(cd "${QUICKJS_DIR}" && git archive native-ses) | tar x -C "${TMPCTX}/quickjs" 2>/dev/null || \
  cp -r "${QUICKJS_DIR}" "${TMPCTX}/quickjs"

# Our sources.
mkdir -p "${TMPCTX}/packages/endo-os"
cp -r "${SEL4_DIR}" "${TMPCTX}/packages/endo-os/sel4"
cp -r "${ENDO_OS_DIR}/src" "${TMPCTX}/packages/endo-os/src"

# Daemon bundle (pre-built by esbuild).
DAEMON_BUNDLE="${SCRIPT_DIR}/daemon-bundle.js"
if [ ! -f "${DAEMON_BUNDLE}" ]; then
  echo "WARNING: daemon-bundle.js not found."
  echo "Build it: cd ../endo/packages/daemon && esbuild sel4-entry.js --bundle ..."
  echo "Continuing without daemon bundle..."
  echo "// No daemon bundle" > "${TMPCTX}/packages/endo-os/sel4/build/daemon-bundle.js"
fi

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

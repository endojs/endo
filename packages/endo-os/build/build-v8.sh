#!/bin/bash
# Build V8 as a static monolithic library for Endo OS.
#
# Prerequisites:
#   - depot_tools in PATH (https://v8.dev/docs/source-code)
#   - ~10 GB disk space for V8 source + build
#
# Output: $V8_OUT/libv8_monolith.a and headers

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENDO_OS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="${ENDO_OS_DIR}/build"

# Where to check out and build V8.
V8_SRC="${V8_SRC:-${BUILD_DIR}/_v8_src}"
V8_OUT="${V8_SRC}/out/x64.release"

# V8 version to build.  Use a stable release branch.
V8_BRANCH="${V8_BRANCH:-13.3}"

echo "=== Endo OS: Building V8 ==="
echo "    Source:  ${V8_SRC}"
echo "    Output:  ${V8_OUT}"
echo "    Branch:  ${V8_BRANCH}"

# Check for depot_tools.
if ! command -v gclient &> /dev/null; then
  echo "ERROR: depot_tools not found in PATH."
  echo "Install from: https://v8.dev/docs/source-code#using-git"
  exit 1
fi

# Fetch V8 source if not already present.
if [ ! -d "${V8_SRC}" ]; then
  echo "--- Fetching V8 source ---"
  mkdir -p "${V8_SRC}"
  cd "${V8_SRC}"
  fetch v8
  cd v8
  git checkout "branch-heads/${V8_BRANCH}"
  gclient sync
else
  echo "--- V8 source already present, syncing ---"
  cd "${V8_SRC}/v8"
  gclient sync
fi

cd "${V8_SRC}/v8"

# Generate build files.
echo "--- Generating build (GN) ---"
gn gen "${V8_OUT}" --args='
  is_debug=false
  is_component_build=false
  target_cpu="x64"
  v8_enable_i18n_support=false
  v8_use_external_startup_data=false
  v8_enable_webassembly=false
  use_custom_libcxx=true
  v8_monolithic=true
  treat_warnings_as_errors=false
  symbol_level=0
'

# Build the monolithic static library.
echo "--- Building V8 (this takes ~20 minutes) ---"
ninja -C "${V8_OUT}" v8_monolith

echo "=== V8 build complete ==="
echo "    Library: ${V8_OUT}/obj/libv8_monolith.a"
echo "    Headers: ${V8_SRC}/v8/include/"

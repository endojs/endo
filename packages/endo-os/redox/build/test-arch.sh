#!/bin/bash
# Test Endo OS on Arch Linux (bare system, no dependencies).
#
# Builds an x86_64 static binary inside Arch, then runs it.
# This verifies the binary works on a minimal Linux with
# no pre-installed libraries.
#
# Usage:
#   ./redox/build/test-arch.sh                    # build + test
#   ./redox/build/test-arch.sh --interactive      # build + interactive shell

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REDOX_DIR="$(dirname "$SCRIPT_DIR")"
ENDO_OS_DIR="$(dirname "$REDOX_DIR")"
REPO_ROOT="$(cd "$ENDO_OS_DIR/../.." && pwd)"

QUICKJS_DIR="$(cd "${REPO_ROOT}/.." && pwd)/quickjs"

INTERACTIVE=false
if [ "${1:-}" = "--interactive" ] || [ "${1:-}" = "-i" ]; then
  INTERACTIVE=true
fi

echo "=== Endo OS: Arch Linux Test ==="
echo ""

if [ ! -f "${QUICKJS_DIR}/quickjs.c" ]; then
  echo "ERROR: QuickJS-ng not found at ${QUICKJS_DIR}"
  exit 1
fi

# Prepare build context.
TMPCTX=$(mktemp -d)
trap "rm -rf ${TMPCTX}" EXIT

mkdir -p "${TMPCTX}/quickjs"
(cd "${QUICKJS_DIR}" && git archive native-ses) | tar x -C "${TMPCTX}/quickjs" 2>/dev/null || \
  cp -r "${QUICKJS_DIR}" "${TMPCTX}/quickjs"

mkdir -p "${TMPCTX}/src"
cp "${REDOX_DIR}/src/endo-init.c" "${TMPCTX}/src/"
cp "${ENDO_OS_DIR}/sel4/src/ses-shim.js" "${TMPCTX}/src/ses-shim.js"
cp "${ENDO_OS_DIR}/src/js/bootstrap-sel4.js" "${TMPCTX}/src/bootstrap.js"

# Dockerfile for Arch Linux build + test.
cat > "${TMPCTX}/Dockerfile" << 'ARCHEOF'
FROM --platform=linux/amd64 archlinux:latest

# Minimal: just gcc and make. No other deps needed.
# --disable-sandbox needed when running x86_64 Arch under QEMU emulation.
RUN pacman --disable-sandbox -Sy --noconfirm gcc make vim

WORKDIR /build

COPY quickjs/ quickjs/
COPY src/ src/

# Embed JS as C arrays.
RUN echo 'const char js_ses_shim[] = {' > src/ses_shim_embed.c && \
    xxd -i < src/ses-shim.js >> src/ses_shim_embed.c && \
    echo ', 0x00 };' >> src/ses_shim_embed.c && \
    echo 'const unsigned int js_ses_shim_len = sizeof(js_ses_shim) - 1;' >> src/ses_shim_embed.c && \
    echo 'const char js_bootstrap[] = {' > src/bootstrap_embed.c && \
    xxd -i < src/bootstrap.js >> src/bootstrap_embed.c && \
    echo ', 0x00 };' >> src/bootstrap_embed.c && \
    echo 'const unsigned int js_bootstrap_len = sizeof(js_bootstrap) - 1;' >> src/bootstrap_embed.c

# Build static binary.
RUN gcc -O2 -D_GNU_SOURCE -DCONFIG_VERSION=\"endo-os\" \
      -I quickjs -c -o quickjs.o quickjs/quickjs.c && \
    gcc -O2 -D_GNU_SOURCE -c -o libregexp.o quickjs/libregexp.c && \
    gcc -O2 -D_GNU_SOURCE -c -o libunicode.o quickjs/libunicode.c && \
    gcc -O2 -D_GNU_SOURCE -c -o dtoa.o quickjs/dtoa.c && \
    gcc -O2 -D_GNU_SOURCE -DCONFIG_VERSION=\"endo-os\" \
      -I quickjs -c -o endo-init.o src/endo-init.c && \
    gcc -O2 -c -o ses_shim.o src/ses_shim_embed.c && \
    gcc -O2 -c -o bootstrap.o src/bootstrap_embed.c && \
    gcc -static -o endo-init \
      endo-init.o quickjs.o libregexp.o libunicode.o dtoa.o \
      ses_shim.o bootstrap.o -lm -lpthread && \
    echo "Binary: $(file endo-init)" && \
    echo "Size: $(ls -lh endo-init | awk '{print $5}')" && \
    ldd endo-init 2>&1 || echo "(statically linked)"

# Verify it runs.
RUN echo -e "list\ncounter.increment()\ncounter.read()\n1+1\ngreeter.greet(\"Arch\")\nstatus\n" | \
    ./endo-init 2>&1 && echo "=== PASS ==="

# Verify kernel version.
RUN uname -r && echo "Arch: $(cat /etc/arch-release)"

CMD ["/build/endo-init"]
ARCHEOF

echo "--- Building on Arch Linux (x86_64) ---"
docker build \
  --platform linux/amd64 \
  -t endo-os-arch-test \
  -f "${TMPCTX}/Dockerfile" \
  --progress=plain \
  "${TMPCTX}" 2>&1 | tail -30

if [ $? -ne 0 ]; then
  echo "=== FAIL: Build failed on Arch ==="
  exit 1
fi

echo ""
echo "=== Build + basic tests passed on Arch Linux ==="
echo ""

# Copy binary out.
mkdir -p "${SCRIPT_DIR}/out"
docker run --rm --platform linux/amd64 \
  -v "${SCRIPT_DIR}/out:/out" \
  endo-os-arch-test \
  sh -c 'cp /build/endo-init /out/endo-init-x86_64 && echo "Copied x86_64 binary"'

echo ""
ls -lh "${SCRIPT_DIR}/out/endo-init-x86_64" 2>/dev/null

if [ "$INTERACTIVE" = true ]; then
  echo ""
  echo "--- Interactive Arch Linux shell ---"
  exec docker run --rm -it --platform linux/amd64 \
    endo-os-arch-test \
    /build/endo-init
fi

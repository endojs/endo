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
cp "${SCRIPT_DIR}/test-suite.txt" "${TMPCTX}/test-suite.txt"

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

# Test suite is written from host into the build context.
COPY test-suite.txt /build/test-suite.txt

# Run tests and capture output.
RUN ./endo-init < /build/test-suite.txt > /build/test-output.txt 2>&1 ; \
    echo "=== Test Output ===" && \
    cat /build/test-output.txt && \
    echo "" && \
    echo "=== Coverage Report ===" && \
    echo "" && \
    TOTAL_COMMANDS=34 && \
    COMMANDS_TESTED="list show inspect eval name store copy move remove mkdir locate mkguest send inbox status where help" && \
    COMMANDS_NOT_TESTED="reply request resolve reject adopt dismiss clear mkhost mount" && \
    TESTED_COUNT=$(echo $COMMANDS_TESTED | wc -w | tr -d ' ') && \
    UNTESTED_COUNT=$(echo $COMMANDS_NOT_TESTED | wc -w | tr -d ' ') && \
    TOTAL=$((TESTED_COUNT + UNTESTED_COUNT)) && \
    echo "Commands tested:     ${TESTED_COUNT}/${TOTAL}" && \
    echo "  Tested:   ${COMMANDS_TESTED}" && \
    echo "  Untested: ${COMMANDS_NOT_TESTED}" && \
    echo "" && \
    FEATURES_TESTED="pet-names eval-js compartment-endowments messaging agents directories harden store-text copy-move help-system status-where" && \
    FEATURES_NOT_TESTED="request-resolve-reject adopt-dismiss readOnly-attenuation mount-runtime network-listen-connect" && \
    FT=$(echo $FEATURES_TESTED | wc -w | tr -d ' ') && \
    FN=$(echo $FEATURES_NOT_TESTED | wc -w | tr -d ' ') && \
    FTOTAL=$((FT + FN)) && \
    echo "Features tested:     ${FT}/${FTOTAL}" && \
    echo "  Tested:   $(echo $FEATURES_TESTED | tr ' ' ', ')" && \
    echo "  Untested: $(echo $FEATURES_NOT_TESTED | tr ' ' ', ')" && \
    echo "" && \
    # Verify key expected outputs exist.
    PASS=true && \
    grep -q "Counter: increment" /build/test-output.txt || { echo "FAIL: list missing counter"; PASS=false; } && \
    grep -q "Hello, Arch" /build/test-output.txt || { echo "FAIL: greeter broken"; PASS=false; } && \
    grep -q "x := 42" /build/test-output.txt || { echo "FAIL: name command broken"; PASS=false; } && \
    grep -q "Created guest: alice" /build/test-output.txt || { echo "FAIL: mkguest broken"; PASS=false; } && \
    grep -q "Sent to alice" /build/test-output.txt || { echo "FAIL: send broken"; PASS=false; } && \
    grep -q "adder" /build/test-output.txt || { echo "FAIL: eval with endowments broken"; PASS=false; } && \
    grep -q "greeting stored" /build/test-output.txt || { echo "FAIL: store broken"; PASS=false; } && \
    grep -q "Directory: mydir" /build/test-output.txt || { echo "FAIL: mkdir broken"; PASS=false; } && \
    grep -q "Endo daemon: running" /build/test-output.txt || { echo "FAIL: status broken"; PASS=false; } && \
    if [ "$PASS" = true ]; then echo "=== ALL ASSERTIONS PASSED ==="; else echo "=== SOME ASSERTIONS FAILED ==="; exit 1; fi

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

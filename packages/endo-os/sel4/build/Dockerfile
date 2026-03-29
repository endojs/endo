# Endo OS seL4 Build — Native SES + Bytecode Precompile
#
# Uses QuickJS-ng native-ses branch with native lockdown() (<1ms)
# and pre-compiles the daemon bundle to bytecode via qjsc.
#
# Expected boot time: ~2 seconds (kernel + instant lockdown + bytecode load)

FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    gcc-aarch64-linux-gnu \
    binutils-aarch64-linux-gnu \
    cmake \
    xxd \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Download seL4 Microkit SDK.
ENV MICROKIT_SDK_VERSION=2.0.1
RUN wget -q "https://github.com/seL4/microkit/releases/download/${MICROKIT_SDK_VERSION}/microkit-sdk-${MICROKIT_SDK_VERSION}-linux-x86-64.tar.gz" \
    -O /tmp/microkit-sdk.tar.gz && \
    tar xf /tmp/microkit-sdk.tar.gz -C /opt && \
    rm /tmp/microkit-sdk.tar.gz && \
    ln -sf /opt/microkit-sdk-${MICROKIT_SDK_VERSION} /opt/microkit-sdk

ENV MICROKIT_SDK=/opt/microkit-sdk

WORKDIR /build

# Copy QuickJS-ng source (native-ses branch).
COPY quickjs/ /opt/quickjs/

# === Step 1: Build qjsc for the HOST (x86_64) ===
# qjsc compiles JS to bytecode that QuickJS can load instantly.
RUN cd /opt/quickjs && \
    cmake -B build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --target qjsc -j$(nproc) && \
    cp build/qjsc . && \
    ls -lh qjsc && \
    echo "qjsc built for host"

# === Step 2: Pre-compile daemon bundle to bytecode ===
COPY packages/endo-os/sel4/build/daemon-bundle.js /build/daemon-bundle.js

# Compile JS → bytecode C array.
# -c generates a .c file with the bytecode as a uint8_t array.
# -m compiles as a module (needed for IIFE with exports).
# Post-process: stub imports, help-text, strip export, assign global.
RUN LINES=$(wc -l < /build/daemon-bundle.js) && \
    KEEP=$((LINES - 3)) && \
    sed 's/^import fs from "fs";/var fs = {};/' /build/daemon-bundle.js | \
    sed 's/var helpMap = readHelpTextFileSync.*/var helpMap = new Map();/' | \
    sed 's/new URL(.*import\.meta\.url)/new URL("file:\/\/\/endo-os")/' | \
    head -${KEEP} > /build/daemon-bundle-qjsc.js && \
    echo 'globalThis.EndoDaemon = { makeDaemon };' >> /build/daemon-bundle-qjsc.js && \
    echo "Post-processed bundle: $(wc -l < /build/daemon-bundle-qjsc.js) lines"

# Compile to bytecode with qjsc.
# Compile to bytecode. qjsc -e generates a C file with main() + bytecode.
# We post-process to rename variables and strip the main().
# Compile to bytecode with qjsc, then extract just the data arrays.
RUN cd /opt/quickjs && \
    ./qjsc -e -o /tmp/qjsc-raw.c /build/daemon-bundle-qjsc.js > /tmp/qjsc.log 2>&1 && \
    (echo '#include <stdint.h>' && \
     echo '' && \
     sed -n '/^const uint32_t\|^const uint8_t/,/^static JSContext\|^int main/{ /^static JSContext\|^int main/d; p; }' /tmp/qjsc-raw.c | \
     sed 's/qjsc_daemon_bundle_qjsc/qjsc_daemon_bundle/g') > /build/daemon-bytecode.c && \
    echo "Extracted bytecode: $(wc -c < /build/daemon-bytecode.c) bytes" && \
    echo "Daemon bytecode compiled" || \
    (echo "=== qjsc failed ===" && cat /tmp/qjsc.log && \
     echo '#include <stdint.h>' > /build/daemon-bytecode.c && \
     echo 'const uint8_t qjsc_daemon_bundle[] = {0}; const uint32_t qjsc_daemon_bundle_size = 0;' \
     >> /build/daemon-bytecode.c)

# === Step 3: Build the seL4 image ===
COPY packages/endo-os/sel4/src/ sel4/src/
COPY packages/endo-os/sel4/system.xml sel4/system.xml
COPY packages/endo-os/sel4/Makefile sel4/Makefile
COPY packages/endo-os/src/js/bootstrap-sel4.js sel4/src/bootstrap.js
COPY packages/endo-os/src/js/daemon-powers-sel4.js sel4/src/daemon-powers.js

# Copy bytecode + JS text fallback into build.
RUN cp /build/daemon-bytecode.c sel4/src/daemon-bytecode.c && \
    cp /build/daemon-bundle-qjsc.js sel4/src/daemon-bundle-text.js

RUN cd sel4 && make MICROKIT_SDK=${MICROKIT_SDK} QUICKJS_SRC=/opt/quickjs

CMD mkdir -p /out && \
    cp -v /build/sel4/build/endo-os.img /out/ && \
    cp -v /build/sel4/build/report.txt /out/ 2>/dev/null || true && \
    ls -lh /out/

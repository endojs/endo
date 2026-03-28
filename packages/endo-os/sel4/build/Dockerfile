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
# qjsc -e generates a standalone C file with main() + bytecode.
# We just need the bytecode, so use -e and extract.
# -m treats input as module (for ESM exports).
RUN cd /opt/quickjs && \
    ./qjsc -e -m -o /build/daemon-bytecode.c /build/daemon-bundle.js 2>&1 && \
    echo "Daemon bytecode compiled" && \
    wc -c /build/daemon-bytecode.c || \
    (echo "qjsc compilation failed — will fall back to JS text" && \
     echo '#include <stdint.h>' > /build/daemon-bytecode.c && \
     echo 'const uint8_t qjsc_daemon_bundle[] = {0}; const uint32_t qjsc_daemon_bundle_size = 0;' \
     >> /build/daemon-bytecode.c)

# === Step 3: Build the seL4 image ===
COPY packages/endo-os/sel4/src/ sel4/src/
COPY packages/endo-os/sel4/system.xml sel4/system.xml
COPY packages/endo-os/sel4/Makefile sel4/Makefile
COPY packages/endo-os/src/js/bootstrap-sel4.js sel4/src/bootstrap.js
COPY packages/endo-os/src/js/daemon-powers-sel4.js sel4/src/daemon-powers.js

# Copy bytecode C file into build.
RUN cp /build/daemon-bytecode.c sel4/src/daemon-bytecode.c

RUN cd sel4 && make MICROKIT_SDK=${MICROKIT_SDK} QUICKJS_SRC=/opt/quickjs

CMD mkdir -p /out && \
    cp -v /build/sel4/build/endo-os.img /out/ && \
    cp -v /build/sel4/build/report.txt /out/ 2>/dev/null || true && \
    ls -lh /out/

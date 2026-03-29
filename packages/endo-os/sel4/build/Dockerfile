# Endo OS seL4 Build — Native Lockdown + Bytecode
#
# QuickJS-ng native-ses: lockdown <1ms
# qjsc -b: daemon bytecode loads instantly
# Total boot: ~3 seconds

FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    gcc-x86-64-linux-gnu \
    binutils-x86-64-linux-gnu \
    cmake \
    xxd \
    wget \
    && rm -rf /var/lib/apt/lists/*

ENV MICROKIT_SDK_VERSION=2.1.0
RUN wget -q "https://github.com/seL4/microkit/releases/download/${MICROKIT_SDK_VERSION}/microkit-sdk-${MICROKIT_SDK_VERSION}-linux-x86-64.tar.gz" \
    -O /tmp/microkit-sdk.tar.gz && \
    tar xf /tmp/microkit-sdk.tar.gz -C /opt && \
    rm /tmp/microkit-sdk.tar.gz && \
    ls /opt/ && \
    ln -sf $(ls -d /opt/microkit-sdk-*) /opt/microkit-sdk

ENV MICROKIT_SDK=/opt/microkit-sdk

WORKDIR /build

COPY quickjs/ /opt/quickjs/

# Build qjsc for the host.
RUN cd /opt/quickjs && \
    cmake -B build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --target qjsc -j$(nproc) && \
    cp build/qjsc .

# Copy daemon IIFE bundle.
COPY packages/endo-os/sel4/build/daemon-bundle.js /build/daemon-bundle.js

# Stub require("fs"), compile IIFE to raw bytecode.
RUN sed 's/__require("fs")/({})/' /build/daemon-bundle.js \
      > /build/daemon-clean.js && \
    /opt/quickjs/qjsc -b -o /build/daemon.bin /build/daemon-clean.js && \
    echo "Bytecode: $(ls -lh /build/daemon.bin | awk '{print $5}')"

# Convert raw bytecode to C array.
RUN echo '#include <stdint.h>' > /build/daemon-bytecode.c && \
    echo "const uint32_t qjsc_daemon_bundle_size = $(wc -c < /build/daemon.bin);" \
      >> /build/daemon-bytecode.c && \
    echo 'const uint8_t qjsc_daemon_bundle[] = {' >> /build/daemon-bytecode.c && \
    xxd -i < /build/daemon.bin >> /build/daemon-bytecode.c && \
    echo '};' >> /build/daemon-bytecode.c && \
    echo "Bytecode C: $(wc -c < /build/daemon-bytecode.c) bytes"

# Copy sources.
COPY packages/endo-os/sel4/src/ sel4/src/
COPY packages/endo-os/sel4/system.xml sel4/system.xml
COPY packages/endo-os/sel4/Makefile sel4/Makefile
COPY packages/endo-os/src/js/bootstrap-sel4.js sel4/src/bootstrap.js
COPY packages/endo-os/src/js/daemon-powers-sel4.js sel4/src/daemon-powers.js

# Copy bytecode into build.
RUN cp /build/daemon-bytecode.c sel4/src/daemon-bytecode.c

# Build seL4 image.
RUN cd sel4 && make MICROKIT_SDK=${MICROKIT_SDK} QUICKJS_SRC=/opt/quickjs

CMD mkdir -p /out && \
    cp -v /build/sel4/build/endo-os.img /out/ && \
    cp -v /build/sel4/build/report.txt /out/ 2>/dev/null || true && \
    cp -v ${MICROKIT_SDK}/board/x86_64_generic/debug/elf/sel4_32.elf /out/ && \
    ls -lh /out/

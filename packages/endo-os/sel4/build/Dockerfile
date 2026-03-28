# Endo OS seL4 Build — Phase 0b: QuickJS on verified kernel
#
# Compiles QuickJS + our PD into a single ELF that runs on seL4.
#
# Usage:
#   cd packages/endo-os
#   docker build -t endo-os-sel4 -f sel4/build/Dockerfile .
#   docker run --rm -v $(pwd)/sel4/build/out:/out endo-os-sel4

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    gcc-aarch64-linux-gnu \
    binutils-aarch64-linux-gnu \
    wget \
    xxd \
    && rm -rf /var/lib/apt/lists/*

# Download seL4 Microkit SDK.
ENV MICROKIT_SDK_VERSION=2.0.1
RUN wget -q "https://github.com/seL4/microkit/releases/download/${MICROKIT_SDK_VERSION}/microkit-sdk-${MICROKIT_SDK_VERSION}-linux-x86-64.tar.gz" \
    -O /tmp/microkit-sdk.tar.gz && \
    tar xf /tmp/microkit-sdk.tar.gz -C /opt && \
    rm /tmp/microkit-sdk.tar.gz && \
    ln -sf /opt/microkit-sdk-${MICROKIT_SDK_VERSION} /opt/microkit-sdk

ENV MICROKIT_SDK=/opt/microkit-sdk

# Download QuickJS source.
RUN wget -q "https://bellard.org/quickjs/quickjs-2024-01-13.tar.xz" \
    -O /tmp/quickjs.tar.xz && \
    mkdir -p /opt/quickjs && \
    tar xf /tmp/quickjs.tar.xz -C /opt/quickjs --strip-components=1 && \
    rm /tmp/quickjs.tar.xz && \
    echo "QuickJS source: $(ls /opt/quickjs/*.c | wc -l) C files"

WORKDIR /build

# Copy our sources.
COPY sel4/src/ sel4/src/
COPY sel4/system.xml sel4/system.xml
COPY sel4/Makefile sel4/Makefile
COPY src/js/ses-lockdown-quickjs.js sel4/src/ses-lockdown.js
COPY src/js/bootstrap-sel4.js sel4/src/bootstrap.js

# Build.
RUN cd sel4 && make MICROKIT_SDK=${MICROKIT_SDK} QUICKJS_SRC=/opt/quickjs

CMD mkdir -p /out && \
    cp -v /build/sel4/build/endo-os.img /out/ && \
    cp -v /build/sel4/build/report.txt /out/ 2>/dev/null || true && \
    ls -lh /out/

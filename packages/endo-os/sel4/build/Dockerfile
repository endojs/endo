# Endo OS seL4 Build — Lean Shell (no daemon bundle)
#
# Native lockdown <1ms + interactive shell boots in ~3 seconds.
# The shell IS the daemon — implements full Endo CLI in-memory.

FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    gcc-aarch64-linux-gnu \
    binutils-aarch64-linux-gnu \
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
COPY packages/endo-os/sel4/src/ sel4/src/
COPY packages/endo-os/sel4/system.xml sel4/system.xml
COPY packages/endo-os/sel4/Makefile sel4/Makefile
COPY packages/endo-os/src/js/bootstrap-sel4.js sel4/src/bootstrap.js

RUN cd sel4 && make MICROKIT_SDK=${MICROKIT_SDK} QUICKJS_SRC=/opt/quickjs

CMD mkdir -p /out && \
    cp -v /build/sel4/build/endo-os.img /out/ && \
    cp -v /build/sel4/build/report.txt /out/ 2>/dev/null || true && \
    ls -lh /out/

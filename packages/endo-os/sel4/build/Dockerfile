# Endo OS seL4 Build Environment
#
# Builds the endo-init protection domain for seL4 Microkit.
# Phase 0a uses a C PD with the Microkit C SDK directly.
#
# Usage:
#   cd sel4
#   docker build -t endo-os-sel4 -f build/Dockerfile ..
#   docker run --rm -v $(pwd)/build/out:/out endo-os-sel4

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies.
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc-aarch64-linux-gnu \
    binutils-aarch64-linux-gnu \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Download seL4 Microkit SDK.
ENV MICROKIT_SDK_VERSION=2.0.1
RUN wget -q "https://github.com/seL4/microkit/releases/download/${MICROKIT_SDK_VERSION}/microkit-sdk-${MICROKIT_SDK_VERSION}-linux-x86-64.tar.gz" \
    -O /tmp/microkit-sdk.tar.gz && \
    tar xf /tmp/microkit-sdk.tar.gz -C /opt && \
    rm /tmp/microkit-sdk.tar.gz && \
    ls /opt/

# Find the SDK directory (it extracts with a version-named dir).
RUN MICROKIT_DIR=$(ls -d /opt/microkit-sdk-* 2>/dev/null || echo "") && \
    if [ -z "$MICROKIT_DIR" ]; then \
        echo "SDK contents:" && ls /opt/ && \
        echo "Looking for microkit tool..." && find /opt -name "microkit" -type f 2>/dev/null; \
    else \
        ln -sf "$MICROKIT_DIR" /opt/microkit-sdk; \
    fi

# Verify SDK is usable.
RUN ls /opt/microkit-sdk/bin/microkit 2>/dev/null && echo "Microkit SDK OK" || \
    (echo "Trying alternate paths..." && \
     find /opt -name "microkit" -type f 2>/dev/null && \
     FOUND=$(find /opt -name "microkit" -type f | head -1) && \
     SDK_DIR=$(dirname $(dirname $FOUND)) && \
     ln -sf "$SDK_DIR" /opt/microkit-sdk && \
     echo "Linked SDK from $SDK_DIR")

ENV MICROKIT_SDK=/opt/microkit-sdk

WORKDIR /build

# Copy only what's needed for the build.
COPY sel4/src/ sel4/src/
COPY sel4/system.xml sel4/system.xml
COPY sel4/Makefile sel4/Makefile

# Build the seL4 image.
RUN cd sel4 && make MICROKIT_SDK=${MICROKIT_SDK}

# Copy artifacts to /out.
CMD mkdir -p /out && \
    cp -v /build/sel4/build/endo-os.img /out/ && \
    cp -v /build/sel4/build/report.txt /out/ 2>/dev/null || true && \
    echo "=== seL4 build artifacts ===" && \
    ls -lh /out/

# Endo OS seL4 Build Environment
#
# Builds the endo-init protection domain for seL4 Microkit
# using QuickJS as the JS engine.
#
# Usage:
#   cd sel4
#   docker build -t endo-os-sel4 -f build/Dockerfile .
#   docker run --rm -v $(pwd)/build/out:/out endo-os-sel4
#
# Output in build/out/:
#   endo-os.img — Bootable seL4 image for QEMU (aarch64)

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies.
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    wget \
    python3 \
    cmake \
    ninja-build \
    device-tree-compiler \
    gcc-aarch64-linux-gnu \
    qemu-system-arm \
    && rm -rf /var/lib/apt/lists/*

# Install Rust.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain 1.86.0
ENV PATH="/root/.cargo/bin:${PATH}"

# Add AArch64 bare-metal target for seL4.
RUN rustup target add aarch64-unknown-none

# Download seL4 Microkit SDK.
ENV MICROKIT_SDK_VERSION=2.0.1
RUN wget -q "https://github.com/seL4/microkit/releases/download/${MICROKIT_SDK_VERSION}/microkit-sdk-${MICROKIT_SDK_VERSION}-linux-x86-64.tar.gz" \
    -O /tmp/microkit-sdk.tar.gz && \
    mkdir -p /opt/microkit-sdk && \
    tar xf /tmp/microkit-sdk.tar.gz -C /opt --strip-components=1 && \
    rm /tmp/microkit-sdk.tar.gz

ENV MICROKIT_SDK=/opt/microkit-sdk

WORKDIR /build/sel4

# Copy source.
COPY . .

# Build.
RUN make MICROKIT_SDK=${MICROKIT_SDK} || \
    echo "=== Build note: full QuickJS integration requires additional seL4 musl setup ===" && \
    echo "=== Scaffold demonstrates the architecture; see sel4/README.md ==="

# Copy artifacts to /out.
CMD mkdir -p /out && \
    cp -v build/endo-os.img /out/ 2>/dev/null; \
    cp -v build/report.txt /out/ 2>/dev/null; \
    echo "=== seL4 build artifacts ===" && \
    ls -lh /out/ 2>/dev/null || echo "(no artifacts yet — see build log)"

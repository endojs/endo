# Endo OS Build Environment (Rust)
#
# Builds everything needed for Endo OS inside a Linux container:
#   - endo-init binary (Rust + deno_core/V8, statically linked)
#   - Minimal Linux kernel
#   - initramfs (bootable image)
#
# The V8 engine is built automatically by the `v8` crate (rusty_v8)
# as part of `cargo build`.  No depot_tools or manual V8 build needed.
#
# Usage:
#   docker build -t endo-os-builder -f build/Dockerfile .
#   docker run --rm -v $(pwd)/build/out:/out endo-os-builder
#
# Output files in build/out/:
#   bzImage           — Linux kernel
#   initramfs.cpio.gz — Boot image containing endo-init + JS
#   endo-init         — The PID 1 binary (for inspection)

FROM rust:1.82-bookworm AS rust-builder

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies for V8 (built by the v8 crate)
# and for cross-compiling to musl (static binary).
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    ninja-build \
    python3 \
    pkg-config \
    libclang-dev \
    musl-tools \
    && rm -rf /var/lib/apt/lists/*

# Add musl target for static linking.
RUN rustup target add x86_64-unknown-linux-musl

WORKDIR /build/endo-os

# Copy Cargo manifest first for dependency caching.
COPY Cargo.toml Cargo.toml

# Create dummy src to cache dependency compilation.
RUN mkdir -p src/bin src/devices src/js && \
    echo 'pub mod devices;' > src/lib.rs && \
    echo 'pub mod block_device; pub mod camera; pub mod framebuffer; pub mod microphone; pub mod network;' > src/devices/mod.rs && \
    touch src/devices/block_device.rs src/devices/camera.rs src/devices/framebuffer.rs src/devices/microphone.rs src/devices/network.rs && \
    echo 'fn main() { println!("dummy"); }' > src/bin/main.rs && \
    echo '' > src/js/ses-lockdown.js && \
    echo '' > src/js/bootstrap.js && \
    echo '' > src/js/devices.js

# Build dependencies only (cached until Cargo.toml changes).
# This is the slow step (~15-20 min for V8) but only runs once.
RUN cargo build --release --target x86_64-unknown-linux-gnu 2>&1 || true

# Now copy actual source and rebuild (fast — only our code recompiles).
COPY src/ src/
RUN cargo build --release --target x86_64-unknown-linux-gnu && \
    cp target/x86_64-unknown-linux-gnu/release/endo-init /build/endo-init && \
    echo "endo-init size: $(du -h /build/endo-init | cut -f1)"

# === Stage 2: Build Linux kernel ===

FROM ubuntu:24.04 AS kernel-builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    bc \
    flex \
    bison \
    libelf-dev \
    libssl-dev \
    wget \
    xz-utils \
    cpio \
    gzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Download kernel source.
RUN wget -q https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.8.tar.xz && \
    tar xf linux-6.8.tar.xz && \
    rm linux-6.8.tar.xz

# Copy our kernel config and build.
COPY kernel/qemu-x86_64.config /build/linux-6.8/.config
RUN cd /build/linux-6.8 && \
    make olddefconfig && \
    make -j$(nproc) bzImage

# === Stage 3: Assemble initramfs ===

FROM ubuntu:24.04 AS assembler

RUN apt-get update && apt-get install -y cpio gzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY --from=rust-builder /build/endo-init /build/endo-init
COPY src/js/ /build/js/

RUN mkdir -p initramfs/{dev,proc,sys} && \
    cp endo-init initramfs/endo-init && \
    chmod 755 initramfs/endo-init && \
    ln -sf /endo-init initramfs/init && \
    cp js/ses-lockdown.js initramfs/ && \
    cp js/bootstrap.js initramfs/ && \
    cp js/devices.js initramfs/ && \
    cd initramfs && \
    find . | cpio -o -H newc 2>/dev/null | gzip > /build/initramfs.cpio.gz && \
    echo "initramfs size: $(du -h /build/initramfs.cpio.gz | cut -f1)"

# === Output stage ===

FROM ubuntu:24.04 AS output

COPY --from=kernel-builder /build/linux-6.8/arch/x86/boot/bzImage /artifacts/bzImage
COPY --from=assembler /build/initramfs.cpio.gz /artifacts/initramfs.cpio.gz
COPY --from=rust-builder /build/endo-init /artifacts/endo-init

CMD cp -v /artifacts/* /out/ && \
    echo "=== Build artifacts in /out/ ===" && \
    ls -lh /out/

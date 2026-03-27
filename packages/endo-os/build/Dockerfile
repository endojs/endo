# Endo OS Build Environment
#
# Builds everything needed for Endo OS inside a Linux container:
#   - V8 static library
#   - Minimal Linux kernel
#   - endo-init binary (V8 + device bindings)
#   - initramfs (bootable image)
#
# Usage:
#   docker build -t endo-os-builder -f build/Dockerfile .
#   docker run --rm -v $(pwd)/build/out:/out endo-os-builder
#
# Output files in build/out/:
#   bzImage           — Linux kernel
#   initramfs.cpio.gz — Boot image containing endo-init + JS

FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies.
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    wget \
    python3 \
    python3-pip \
    pkg-config \
    ninja-build \
    bc \
    flex \
    bison \
    libelf-dev \
    libssl-dev \
    cpio \
    gzip \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# === Stage 1: Build V8 ===
# This is the slowest step (~20 min).  Docker layer caching helps.

# Install depot_tools for V8 build.
RUN git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git /depot_tools
ENV PATH="/depot_tools:${PATH}"

# Fetch V8 source.
RUN mkdir -p /build/v8 && cd /build/v8 \
    && fetch v8 \
    && cd v8 \
    && git checkout branch-heads/13.3 \
    && gclient sync -D

# Build V8 as a static monolithic library.
RUN cd /build/v8/v8 && gn gen out/x64.release --args=' \
    is_debug=false \
    is_component_build=false \
    target_cpu="x64" \
    v8_enable_i18n_support=false \
    v8_use_external_startup_data=false \
    v8_enable_webassembly=false \
    use_custom_libcxx=true \
    v8_monolithic=true \
    treat_warnings_as_errors=false \
    symbol_level=0 \
    ' \
    && ninja -C out/x64.release v8_monolith

# === Stage 2: Build Linux kernel ===

# Download kernel source.
RUN wget -q https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.8.tar.xz \
    && tar xf linux-6.8.tar.xz \
    && rm linux-6.8.tar.xz

# Copy our kernel config.
COPY kernel/qemu-x86_64.config /build/linux-6.8/.config

# Build kernel.
RUN cd /build/linux-6.8 \
    && make olddefconfig \
    && make -j$(nproc) bzImage

# === Stage 3: Build endo-init ===

# Copy source files.
COPY src/v8-host/ /build/src/v8-host/
COPY src/js/ /build/src/js/

# Compile C++ sources.
RUN cd /build && \
    V8_INCLUDE=/build/v8/v8/include && \
    V8_LIB=/build/v8/v8/out/x64.release/obj/libv8_monolith.a && \
    g++ -std=c++17 -O2 -Wall \
        -I${V8_INCLUDE} \
        -DV8_COMPRESS_POINTERS \
        -DV8_ENABLE_SANDBOX \
        -c -o main.o src/v8-host/main.cc && \
    g++ -std=c++17 -O2 -Wall \
        -I${V8_INCLUDE} \
        -DV8_COMPRESS_POINTERS \
        -DV8_ENABLE_SANDBOX \
        -c -o platform.o src/v8-host/platform.cc && \
    g++ -std=c++17 -O2 -Wall \
        -I${V8_INCLUDE} \
        -DV8_COMPRESS_POINTERS \
        -DV8_ENABLE_SANDBOX \
        -c -o devices.o src/v8-host/devices.cc && \
    g++ -std=c++17 -O2 -Wall \
        -I${V8_INCLUDE} \
        -DV8_COMPRESS_POINTERS \
        -DV8_ENABLE_SANDBOX \
        -c -o block-device.o src/v8-host/block-device.cc && \
    g++ -std=c++17 -O2 -Wall \
        -I${V8_INCLUDE} \
        -DV8_COMPRESS_POINTERS \
        -DV8_ENABLE_SANDBOX \
        -c -o network-device.o src/v8-host/network-device.cc && \
    g++ -std=c++17 -O2 -Wall \
        -I${V8_INCLUDE} \
        -DV8_COMPRESS_POINTERS \
        -DV8_ENABLE_SANDBOX \
        -c -o framebuffer.o src/v8-host/framebuffer.cc && \
    g++ -std=c++17 -O2 -Wall \
        -I${V8_INCLUDE} \
        -DV8_COMPRESS_POINTERS \
        -DV8_ENABLE_SANDBOX \
        -c -o camera.o src/v8-host/camera.cc && \
    g++ -std=c++17 -O2 -Wall \
        -I${V8_INCLUDE} \
        -DV8_COMPRESS_POINTERS \
        -DV8_ENABLE_SANDBOX \
        -c -o microphone.o src/v8-host/microphone.cc

# Embed JS files as binary blobs.
RUN cd /build && \
    objcopy -I binary -O elf64-x86-64 -B i386:x86-64 \
        --rename-section .data=.rodata,alloc,load,readonly,data,contents \
        src/js/ses-lockdown.js ses-lockdown.js.o && \
    objcopy -I binary -O elf64-x86-64 -B i386:x86-64 \
        --rename-section .data=.rodata,alloc,load,readonly,data,contents \
        src/js/bootstrap.js bootstrap.js.o

# Link endo-init (static binary).
RUN cd /build && \
    V8_LIB=/build/v8/v8/out/x64.release/obj/libv8_monolith.a && \
    g++ -static -o endo-init \
        main.o platform.o devices.o \
        block-device.o network-device.o framebuffer.o \
        camera.o microphone.o \
        ses-lockdown.js.o bootstrap.js.o \
        ${V8_LIB} \
        -pthread -ldl -lm && \
    echo "endo-init size: $(du -h endo-init | cut -f1)"

# === Stage 4: Assemble initramfs ===

RUN mkdir -p /build/initramfs/{dev,proc,sys} && \
    cp /build/endo-init /build/initramfs/endo-init && \
    chmod 755 /build/initramfs/endo-init && \
    ln -sf /endo-init /build/initramfs/init && \
    cp /build/src/js/ses-lockdown.js /build/initramfs/ && \
    cp /build/src/js/bootstrap.js /build/initramfs/ && \
    cd /build/initramfs && \
    find . | cpio -o -H newc 2>/dev/null | gzip > /build/initramfs.cpio.gz && \
    echo "initramfs size: $(du -h /build/initramfs.cpio.gz | cut -f1)"

# === Output stage ===
# Copy artifacts to /out (volume-mounted from host).

FROM ubuntu:24.04 AS output
COPY --from=builder /build/linux-6.8/arch/x86/boot/bzImage /artifacts/bzImage
COPY --from=builder /build/initramfs.cpio.gz /artifacts/initramfs.cpio.gz
COPY --from=builder /build/endo-init /artifacts/endo-init

# Default command: copy artifacts to /out.
CMD cp -v /artifacts/* /out/ && \
    echo "=== Build artifacts in /out/ ===" && \
    ls -lh /out/

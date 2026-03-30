# Endo OS Redox Build
#
# Cross-compiles QuickJS-ng + Endo shell for Redox OS,
# then creates a bootable QEMU image.
#
# Approach: Use a pre-built Redox image and inject our binary.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    xxd \
    wget \
    curl \
    fuse3 \
    libfuse3-dev \
    qemu-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Redox cross-compiler and image download skipped for now.
# On M1 Mac, Docker runs ARM64 — can't use x86_64 Redox toolchain.
# The native binary works on Linux/macOS directly.

# Copy QuickJS-ng source.
COPY quickjs/ /build/quickjs/

# Copy our sources.
COPY packages/endo-os/redox/src/ /build/src/
COPY packages/endo-os/sel4/src/ses-shim.js /build/src/ses-shim.js
COPY packages/endo-os/src/js/bootstrap-sel4.js /build/src/bootstrap.js

# Embed JS into C arrays.
RUN echo 'const char js_ses_shim[] = {' > /build/src/ses_shim_embed.c && \
    xxd -i < /build/src/ses-shim.js >> /build/src/ses_shim_embed.c && \
    echo ', 0x00 };' >> /build/src/ses_shim_embed.c && \
    echo 'const unsigned int js_ses_shim_len = sizeof(js_ses_shim) - 1;' >> /build/src/ses_shim_embed.c && \
    echo 'const char js_bootstrap[] = {' > /build/src/bootstrap_embed.c && \
    xxd -i < /build/src/bootstrap.js >> /build/src/bootstrap_embed.c && \
    echo ', 0x00 };' >> /build/src/bootstrap_embed.c && \
    echo 'const unsigned int js_bootstrap_len = sizeof(js_bootstrap) - 1;' >> /build/src/bootstrap_embed.c

# Build native binary (works on Docker's host arch).
# Redox cross-compilation requires matching host arch toolchain.
RUN cd /build && \
    gcc -O2 -D_GNU_SOURCE -DCONFIG_VERSION=\"endo-os\" \
      -I quickjs \
      -c -o quickjs.o quickjs/quickjs.c && \
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
    echo "endo-init built: $(ls -lh endo-init | awk '{print $5}')"

CMD mkdir -p /out && \
    cp -v /build/endo-init /out/ && \
    cp -v /build/redox-base.img /out/redox.img 2>/dev/null || true && \
    ls -lh /out/

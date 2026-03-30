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

# Download the Redox cross-compiler toolchain.
RUN mkdir -p /opt/redox-toolchain && \
    wget -q "https://static.redox-os.org/toolchain/x86_64-unknown-redox/relibc-install.tar.gz" \
      -O /tmp/relibc.tar.gz && \
    tar xf /tmp/relibc.tar.gz -C /opt/redox-toolchain && \
    rm /tmp/relibc.tar.gz && \
    echo "Redox toolchain installed" && \
    ls /opt/redox-toolchain/

# Download a pre-built Redox server image.
RUN wget -q "https://static.redox-os.org/releases/0.9.0/x86_64/redox_server_x86_64_0.9.0_harddrive.img.zst" \
      -O /tmp/redox.img.zst 2>/dev/null && \
    apt-get update && apt-get install -y zstd && \
    zstd -d /tmp/redox.img.zst -o /build/redox-base.img && \
    rm /tmp/redox.img.zst && \
    echo "Redox base image: $(ls -lh /build/redox-base.img | awk '{print $5}')" || \
    echo "WARNING: Could not download pre-built Redox image. Will build from source."

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

# Try to cross-compile for Redox.
# If the Redox toolchain works, use it.
# Otherwise, build a native Linux binary as fallback.
RUN cd /build && \
    CC_REDOX=$(find /opt/redox-toolchain -name "x86_64-unknown-redox-gcc" 2>/dev/null | head -1) && \
    if [ -n "$CC_REDOX" ]; then \
      echo "Using Redox cross-compiler: $CC_REDOX" && \
      $CC_REDOX -O2 -D_GNU_SOURCE -DCONFIG_VERSION=\"endo-os\" \
        -I quickjs \
        -c -o quickjs.o quickjs/quickjs.c && \
      $CC_REDOX -O2 -D_GNU_SOURCE -c -o libregexp.o quickjs/libregexp.c && \
      $CC_REDOX -O2 -D_GNU_SOURCE -c -o libunicode.o quickjs/libunicode.c && \
      $CC_REDOX -O2 -D_GNU_SOURCE -c -o dtoa.o quickjs/dtoa.c && \
      $CC_REDOX -O2 -D_GNU_SOURCE -DCONFIG_VERSION=\"endo-os\" \
        -I quickjs -c -o endo-init.o src/endo-init.c && \
      $CC_REDOX -O2 -c -o ses_shim.o src/ses_shim_embed.c && \
      $CC_REDOX -O2 -c -o bootstrap.o src/bootstrap_embed.c && \
      $CC_REDOX -static -o endo-init \
        endo-init.o quickjs.o libregexp.o libunicode.o dtoa.o \
        ses_shim.o bootstrap.o -lm -lpthread && \
      echo "Redox binary built: $(ls -lh endo-init | awk '{print $5}')"; \
    else \
      echo "No Redox cross-compiler found. Building native Linux binary." && \
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
      echo "Linux binary built (fallback): $(ls -lh endo-init | awk '{print $5}')"; \
    fi

CMD mkdir -p /out && \
    cp -v /build/endo-init /out/ && \
    cp -v /build/redox-base.img /out/redox.img 2>/dev/null || true && \
    ls -lh /out/

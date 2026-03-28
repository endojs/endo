# Endo OS seL4 Build — Real SES on QuickJS-ng
#
# Uses QuickJS-ng 0.13.0 (from ../quickjs) with the real
# @endo/ses bundle for proper SES lockdown.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    gcc-aarch64-linux-gnu \
    binutils-aarch64-linux-gnu \
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

# Copy QuickJS-ng source from sibling directory.
COPY quickjs/ /opt/quickjs/

# Copy SES bundle from the endo monorepo.
COPY packages/ses/dist/ses.cjs /build/ses.cjs

# Copy our sources.
COPY packages/endo-os/sel4/src/ sel4/src/
COPY packages/endo-os/sel4/system.xml sel4/system.xml
COPY packages/endo-os/sel4/Makefile sel4/Makefile
COPY packages/endo-os/src/js/bootstrap-sel4.js sel4/src/bootstrap.js
COPY packages/endo-os/src/js/daemon-powers-sel4.js sel4/src/daemon-powers.js
COPY packages/endo-os/sel4/build/daemon-bundle.js sel4/src/daemon-bundle.js

# Create the SES loader that polyfills console then loads ses.cjs.
RUN echo '// Console polyfill + SES loader for QuickJS-ng on seL4' > sel4/src/ses-loader.js && \
    echo '(function() {' >> sel4/src/ses-loader.js && \
    echo '  if (typeof console === "undefined") { globalThis.console = { log: print }; }' >> sel4/src/ses-loader.js && \
    echo '  if (!console.warn) console.warn = console.log;' >> sel4/src/ses-loader.js && \
    echo '  if (!console.error) console.error = console.log;' >> sel4/src/ses-loader.js && \
    echo '  if (!console.info) console.info = console.log;' >> sel4/src/ses-loader.js && \
    echo '  if (!console.debug) console.debug = console.log;' >> sel4/src/ses-loader.js && \
    echo '  if (!console.trace) console.trace = console.log;' >> sel4/src/ses-loader.js && \
    echo '  if (!console.assert) console.assert = function(c) { if (!c) console.log("Assertion failed"); };' >> sel4/src/ses-loader.js && \
    echo '  if (!console.group) console.group = console.log;' >> sel4/src/ses-loader.js && \
    echo '  if (!console.groupEnd) console.groupEnd = function() {};' >> sel4/src/ses-loader.js && \
    echo '  if (!console.groupCollapsed) console.groupCollapsed = console.log;' >> sel4/src/ses-loader.js && \
    echo '  if (!console.dir) console.dir = console.log;' >> sel4/src/ses-loader.js && \
    echo '  if (!console.table) console.table = console.log;' >> sel4/src/ses-loader.js && \
    echo '  if (!console.time) { var _t = {}; console.time = function(l) { _t[l] = 0; }; console.timeEnd = function(l) { console.log(l + ": 0ms"); }; console.timeLog = console.timeEnd; }' >> sel4/src/ses-loader.js && \
    echo '  if (!console.clear) console.clear = function() {};' >> sel4/src/ses-loader.js && \
    echo '  if (!console.count) console.count = function(l) { console.log((l||"default") + ": 1"); };' >> sel4/src/ses-loader.js && \
    echo '  if (!console.countReset) console.countReset = function() {};' >> sel4/src/ses-loader.js && \
    echo '})();' >> sel4/src/ses-loader.js && \
    cat /build/ses.cjs >> sel4/src/ses-loader.js && \
    echo '' >> sel4/src/ses-loader.js && \
    echo '// Apply lockdown.' >> sel4/src/ses-loader.js && \
    echo 'lockdown({ errorTaming: "unsafe", overrideTaming: "severe", stackFiltering: "verbose", consoleTaming: "unsafe" });' >> sel4/src/ses-loader.js && \
    echo 'print("ses: Real SES lockdown applied (QuickJS-ng + @endo/ses)");' >> sel4/src/ses-loader.js && \
    wc -c sel4/src/ses-loader.js

# Build.
RUN cd sel4 && make MICROKIT_SDK=${MICROKIT_SDK} QUICKJS_SRC=/opt/quickjs

CMD mkdir -p /out && \
    cp -v /build/sel4/build/endo-os.img /out/ && \
    cp -v /build/sel4/build/report.txt /out/ 2>/dev/null || true && \
    ls -lh /out/

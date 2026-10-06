#!/bin/sh
# Build the C++ Echo server used by the live RPC interop test.
# Idempotent: re-running with no source changes is a no-op (the binary's
# mtime is checked against the source files).
#
# Requires `capnp`, `g++`, and `pkg-config` on PATH plus the capnp-rpc
# pkg-config file (provided by libcapnp-dev / libcapnp-rpc-dev on Debian
# / Ubuntu, or `brew install capnp` on macOS).

set -eu
cd "$(dirname "$0")"

SRC=echo-server.c++
SCHEMA=echo.capnp
GENSRC=echo.capnp.c++
GENHDR=echo.capnp.h
BIN=echo-server

# Generate C++ source from the schema if missing or stale.
if [ ! -f "$GENSRC" ] || [ "$SCHEMA" -nt "$GENSRC" ]; then
  capnp compile -oc++ "$SCHEMA"
fi

# Compile if the binary is missing or any input is newer.
if [ ! -x "$BIN" ] || [ "$SRC" -nt "$BIN" ] || [ "$GENSRC" -nt "$BIN" ]; then
  # shellcheck disable=SC2046
  g++ -std=c++17 -O2 -I. "$SRC" "$GENSRC" \
    $(pkg-config --cflags --libs capnp-rpc) \
    -o "$BIN"
fi

echo "$BIN ready"

#!/bin/bash
# Make the script invokable from any cwd (e.g. `bash
# rust/ocapn_noise/build.sh` from the repo root, or `yarn build:wasm`).
set -e
cd "$(dirname "$0")"
# Reproducible build: rustc embeds absolute source paths in the wasm
# (debug info, panic messages, etc.), so two contributors' or CI's
# builds would differ even with the same toolchain.  `--remap-path-prefix`
# rewrites those paths to stable placeholders so the resulting bytes
# are identical regardless of where the source tree lives.
WORKSPACE_ROOT="$(cd ../.. && pwd)"
HOME_DIR="${HOME:-$(eval echo ~$USER)}"
export RUSTFLAGS="${RUSTFLAGS:-} \
  --remap-path-prefix=${WORKSPACE_ROOT}=. \
  --remap-path-prefix=${HOME_DIR}=~"
# Single codegen unit: removes parallel-codegen ordering nondeterminism.
export CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
# `--locked` makes cargo refuse to silently update the lockfile.
# Since rust/ocapn_noise is a workspace member, the only lockfile
# cargo consults is the workspace-root ../../Cargo.lock; a build
# that would have to update it (e.g. after a `cargo update` step
# elsewhere in the tree) should fail loudly here, not silently embed
# different dep versions into the committed wasm.
cargo build --target wasm32-unknown-unknown --lib --release --locked
cp ../../target/wasm32-unknown-unknown/release/ocapn_noise_protocol_facilities.wasm \
  ../../packages/ocapn-noise/gen/ocapn-noise.wasm

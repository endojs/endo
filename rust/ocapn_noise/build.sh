#!/bin/bash
cargo build --target wasm32-unknown-unknown --lib --release
cp ../../target/wasm32-unknown-unknown/debug/ocapn_noise_protocol_facilities.wasm \
  ../../packages/ocapn-noise/gen/ocapn-noise.wasm

# OCapN Noise

This package provides cryptographic support for an [OCapN](https://ocapn.org/)
netlayer that uses [Noise Protocol](https://noiseprotocol.org/),
suitable for use on the web and in Node.js, anywhere Web Assembly can be
brought to bear.

This is a binding of a Rust `noise_protocol` and `noise_rust_crypto` crates
for the IK-x25519-ChaCha20Poly1305-Blake2 protocol variant.
An instance of the resulting WebAssembly module is small and suitable for
generate keys, 3-way-handshakes in the role of either the initiator or
responder, and then the encryption and decryption of consecutive messages
between these two parties, and performs no heap allocations on the Rust
side of the FFI boundary.

This does not use a JavaScript binding abstraction.
The Rust machine has some static state and communicates exclusively with
pointers/offsets into its own heap with the parent JavaScript process, which
copies data in and out of the Memory's underlying ArrayBuffer.

The JavaScript bindings and demo are in `@endo/ocapn-noise`.

Run `bash build.sh` to create the Wasm module and copy it into the JavaScript
package workspace.

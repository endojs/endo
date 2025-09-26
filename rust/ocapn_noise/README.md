# OCapN Noise

This package provides cryptographic support for an [OCapN](https://ocapn.org/)
netlayer that uses [Noise Protocol](https://noiseprotocol.org/),
suitable for use on the web and in Node.js, anywhere Web Assembly can be
brought to bear.

This is a binding of a Rust `noise_protocol` and `noise_rust_crypto` crates
for the XX-x25519-ChaCha20Poly1305-Blake2 protocol variant with Ed25519
signature verification. Each party signs their ephemeral X25519 encryption
public key with their Ed25519 signing key during the handshake, providing
cryptographic proof of ownership of both key pairs.

An instance of the resulting WebAssembly module is small and suitable for
generating keys, performing 3-way-handshakes in the role of either the
initiator or responder, and then the encryption and decryption of consecutive
messages between these two parties, and performs no heap allocations on the
Rust side of the FFI boundary.

## Technical Details

The implementation uses:
- **Noise XX Pattern**: 3-message handshake with mutual authentication
- **X25519**: Elliptic curve Diffie-Hellman for key agreement
- **ChaCha20Poly1305**: Authenticated encryption for message security
- **Blake2s**: Cryptographic hash function
- **Ed25519**: Digital signatures for key ownership proof

During the handshake:
1. Each party generates an ephemeral X25519 key pair for encryption
2. Each party signs their X25519 public key with their Ed25519 private key
3. Signatures are verified to ensure control of both key pairs
4. This prevents key substitution attacks and provides strong authentication

This does not use a JavaScript binding abstraction.
The Rust machine has some static state and communicates exclusively with
pointers/offsets into its own heap with the parent JavaScript process, which
copies data in and out of the Memory's underlying ArrayBuffer.

The JavaScript bindings and demo are in `@endo/ocapn-noise`.

## Building and Verifying

With a Rust toolchain installed, running `bash build.sh` will update the Wasm
module and copy it into the JavaScript package workspace.
This should provoke no changes to the checked-in artifact unless changes are
checked into this project, as the Rust `Cargo.lock` closes over both the
libraries and toolchain version.

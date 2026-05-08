# OCapN Noise

This package provides cryptographic support for an [OCapN](https://ocapn.org/)
netlayer that uses [Noise Protocol](https://noiseprotocol.org/),
suitable for use on the web and in Node.js, anywhere WebAssembly can be
brought to bear.

This is a binding of the Rust `noise-protocol` and `noise-rust-crypto`
crates for the **`Noise_IK_25519_ChaChaPoly_BLAKE2s`** pattern.  The
OCapN identity is a single Ed25519 keypair; the X25519 keypair Noise
needs is derived deterministically from the same Ed25519 seed via the
Edwards→Montgomery birational map (the libsodium / age /
wireguard-tools convention), so peers publish only their Ed25519
verifying key.

An instance of the resulting WebAssembly module is small and suitable
for performing IK handshakes in the role of either initiator or
responder and the subsequent encryption/decryption of session
messages, and performs no heap allocations on the Rust side of the FFI
boundary.

## Technical details

- **Noise IK pattern**: 2-message handshake.  Initiator already knows
  the responder's static (its Ed25519 identity, converted to X25519);
  responder learns the initiator's static through the encrypted msg 1.
  Identity hiding (Noise §7.8 property 8): the initiator's static is
  encrypted on the wire.
- **X25519**: Diffie-Hellman, derived from each peer's Ed25519 seed.
- **ChaCha20-Poly1305**: AEAD for the handshake payloads and all
  session messages.
- **BLAKE2s**: hash and HKDF-like derivation inside Noise.
- **Ed25519**: long-term identity.  No per-message signature inside
  the handshake; the post-handshake `op:start-session` location
  signature carries the Noise transcript hash as a channel-binding
  value so it cannot be replayed across sessions.

### Prologue

Both peers feed the same prologue bytes into Noise's symmetric state
before any wire message is exchanged:

```
prologue = b"OCapN/np/1\0" || INTENDED_RESPONDER_KEY (32B Ed25519)
```

The prologue commits the handshake to the OCapN protocol identifier
plus the responder's published Ed25519 verifying key, so an attacker
cannot replay a handshake payload across protocols or against a
different responder, and a successful handshake binds the channel to
the responder identity the initiator dialed.

This package does not use a JavaScript binding abstraction.  The Rust
machine has some `static mut` state and communicates exclusively with
pointers/offsets into its linear memory; the parent JavaScript process
copies data in and out of the Memory's underlying `ArrayBuffer`.

The JavaScript bindings and demo are in `@endo/ocapn-noise`.

## Building and verifying

With a Rust toolchain installed, running `bash build.sh` (or
`yarn build:wasm` from the repo root) rebuilds the WASM module and
copies it into `packages/ocapn-noise/gen/ocapn-noise.wasm`.

The artifact is committed to git so JavaScript-only contributors can
run the test suite without a Rust toolchain.  **Anyone modifying
anything under `rust/ocapn_noise/` MUST rebuild and commit the
artifact** along with their changes:

```
bash rust/ocapn_noise/build.sh
git add packages/ocapn-noise/gen/ocapn-noise.wasm
```

The pinned channel in `rust-toolchain.toml` and the deps fixed by
`Cargo.lock` together ensure that a fresh `bash build.sh` produces
bit-identical bytes across contributors.  CI's `build-wasm` job
rebuilds from source and runs
`git diff --exit-code packages/ocapn-noise/gen/ocapn-noise.wasm`,
catching drift between Rust source and the committed binary.  Cargo
caches survive across runs via `actions/cache` keyed on `Cargo.lock`
plus the Rust source tree, so a clean rebuild is only paid when the
inputs change.

## Why IK

IK is a 2-message pattern in which the initiator already knows the
responder's static — exactly OCapN's dial-by-identity model — and
gives initiator identity hiding (Noise §7.8 property 8): the
initiator's static is encrypted in msg 1 under the responder's
static.  The responder's identity is fixed at handshake start, so the
prologue can bind to the responder's published Ed25519 verifying key
plus a fixed protocol identifier without a chicken/egg problem.

No per-message Ed25519 signatures appear inside the handshake.  The
static X25519 is deterministically derived from the Ed25519 seed, so
a successful Noise DH against the published Ed25519 identity already
proves control of the corresponding signing key.

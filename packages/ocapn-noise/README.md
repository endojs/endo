# `@endo/ocapn-noise`

Provides a [Noise Protocol](https://noiseprotocol.org/) netlayer for
`@endo/ocapn`.

The particular Noise Protocol variant is XX-x25519-ChaCha20Poly1305-Blake2 with
Ed25519 signature verification. Each party signs their ephemeral X25519 encryption
public key with their Ed25519 signing key during the handshake, providing
cryptographic proof of ownership of both key pairs.

The implementation of the cryptography is Rust compiled to Web Assembly.
The Rust crate is in the Endo project's repository at `rust/ocapn_noise`.

## Handshake Protocol

The OCapN Noise Protocol uses a 3-message handshake (SYN, SYNACK, ACK) based on
the Noise XX pattern with the following enhancements:

1. **Key Generation**: Each party generates:
   - An ephemeral X25519 key pair for encryption
   - An Ed25519 key pair for signing and verification

2. **SYN Message**: The initiator sends:
   - Their Ed25519 public verifying key
   - A signature of their X25519 ephemeral public key using their Ed25519 private key
   - Supported encoding versions

3. **SYNACK Message**: The responder sends:
   - Their Ed25519 public verifying key  
   - A signature of their X25519 ephemeral public key using their Ed25519 private key
   - The negotiated encoding version

4. **ACK Message**: The initiator sends:
   - A final message to conclude the Noise Protocol handshake.

Each party verifies the other's signature to ensure they control both the
ephemeral encryption key and the static signing key, providing strong
authentication and preventing key substitution attacks.

# Aspirational Design

The OCapN JavaScript netlayer interface is intended to be as near to platform-
neutral as possible and makes extensive use of language level utilities like
promises and async iterators in order to avoid coupling to platform-specific
features like event emitters or event targets.

This OCapN Noise Protocol netlayer is also intended to stand atop multiple
transport layers, but particularly WebSocket.
Having a single cryptography over multiple transport protocols allows this
OCapN netlayer to preserve the identities of message targets regardless of what
transport capabilities are available on various platforms, such that client,
server, cloud, edge, and any other kind of peer can join the network.

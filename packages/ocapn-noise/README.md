# `@endo/ocapn-noise`

Provides a [Noise Protocol](https://noiseprotocol.org/) netlayer for
`@endo/ocapn`.

The particular Noise Protocol variant is IK-x25519-ChaCha20Poly1305-Blake2.
The implementation of the cryptography is Rust compiled to Web Assembly.
The Rust crate is in the Endo project's repository at `rust/ocap_noise`.

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

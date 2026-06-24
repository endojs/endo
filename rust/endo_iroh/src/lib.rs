//! Iroh QUIC network transport for Endo.
//!
//! This crate gives the Rust `endor` daemon an iroh transport that is
//! wire-compatible with the Node.js `@endo/daemon` iroh transport, so the two
//! runtimes can cross-connect. "Dial keys, not IPs": a peer is reached by its
//! Ed25519 node id and resolved through iroh discovery and relays, over a
//! mutually authenticated, encrypted QUIC connection.
//!
//! The compatibility surface with the Node.js transport
//! (`packages/daemon/src/networks/`) is:
//!
//! - **ALPN** [`transport::ALPN`] = `endo/captp/0`.
//! - **Identity** — the iroh secret is derived deterministically from the
//!   daemon's `NodeNumber` ([`address::derive_iroh_secret_key`]), so the node
//!   id is stable and computed identically on both runtimes.
//! - **Address scheme** — `iroh+captp0:///<nodeId>?relay=…&addr=…`
//!   ([`address`]), built and parsed byte-for-byte the same way.
//! - **Framing** — one bidirectional QUIC stream per connection carrying
//!   netstring-framed CapTP messages ([`netstring`]); the dialer opens the
//!   stream and writes the first frame.
//!
//! The transport only moves bytes. The CapTP/greeter handshake runs in the
//! Endo manager, exactly as it does over the Unix-socket bridge in
//! `endo::socket`.

pub mod address;
pub mod netstring;
pub mod transport;

pub use address::{
    build_iroh_address, derive_iroh_secret_key, is_publishable_direct_address, parse_iroh_address,
    supports_iroh_address, AddressError, IrohAddress, IROH_URL_PROTOCOL,
};
pub use transport::{IrohConnection, IrohSession, IrohTransport, TransportError, ALPN};

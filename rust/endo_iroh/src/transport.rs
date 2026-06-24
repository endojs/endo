//! The iroh QUIC transport: bind an endpoint, accept inbound connections,
//! dial outbound ones, and frame CapTP over each bidirectional stream.
//!
//! This is the Rust counterpart of the Node.js `@endo/daemon` iroh transport
//! (`packages/daemon/src/networks/iroh.js`). It is deliberately
//! wire-compatible so an `endor` daemon and a Node.js Endo daemon can
//! cross-connect:
//!
//! - the same ALPN, [`ALPN`] = `endo/captp/0`;
//! - the same deterministic secret-key derivation from the `NodeNumber`
//!   (see [`crate::address::derive_iroh_secret_key`]);
//! - the same `iroh+captp0://` address scheme
//!   (see [`crate::address`]);
//! - one bidirectional QUIC stream per connection, with the dialer opening
//!   the stream and writing the first netstring frame (the CapTP `hello`),
//!   and netstring framing of CapTP messages (see [`crate::netstring`]).
//!
//! The transport only moves bytes; the CapTP/greeter handshake itself runs
//! in the Endo manager exactly as it does for the Unix-socket bridge.

use std::net::SocketAddr;
use std::str::FromStr;

use iroh::endpoint::{presets, Connection, Incoming, RecvStream, SendStream, VarInt};
use iroh::{Endpoint, EndpointAddr, PublicKey, RelayUrl, SecretKey};
use tokio::io::BufReader;

use crate::address::{build_iroh_address, parse_iroh_address, AddressError};
use crate::netstring;

/// ALPN identifying the Endo CapTP protocol over iroh QUIC.
///
/// Matches the Node.js transport's `ALPN_STRING = 'endo/captp/0'`.
pub const ALPN: &[u8] = b"endo/captp/0";

/// Errors from binding, dialing, or accepting on the iroh transport.
#[derive(Debug)]
pub enum TransportError {
    /// Binding the endpoint failed.
    Bind(String),
    /// The peer address could not be parsed.
    Address(AddressError),
    /// The node id in the address was not a valid public key.
    NodeId(String),
    /// A relay URL or direct address hint could not be parsed.
    Hint(String),
    /// Establishing or accepting a connection failed.
    Connect(String),
    /// Opening or accepting the bidirectional stream failed.
    Stream(String),
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransportError::Bind(e) => write!(f, "iroh bind: {e}"),
            TransportError::Address(e) => write!(f, "iroh address: {e}"),
            TransportError::NodeId(e) => write!(f, "iroh node id: {e}"),
            TransportError::Hint(e) => write!(f, "iroh dial hint: {e}"),
            TransportError::Connect(e) => write!(f, "iroh connect: {e}"),
            TransportError::Stream(e) => write!(f, "iroh stream: {e}"),
        }
    }
}

impl std::error::Error for TransportError {}

impl From<AddressError> for TransportError {
    fn from(e: AddressError) -> Self {
        TransportError::Address(e)
    }
}

/// An iroh endpoint advertising the Endo CapTP ALPN.
pub struct IrohTransport {
    endpoint: Endpoint,
}

impl IrohTransport {
    /// Bind an endpoint under iroh's n0 preset (relays + discovery), so the
    /// transport keeps the "dial keys, not IPs" default. The 32-byte secret
    /// should be derived from the daemon's `NodeNumber` via
    /// [`crate::address::derive_iroh_secret_key`].
    pub async fn bind(secret_key: [u8; 32]) -> Result<Self, TransportError> {
        Self::bind_with(secret_key, true).await
    }

    /// Bind an endpoint under the minimal preset (no relay, no discovery).
    /// Reachable only via direct-address hints, so this is primarily for
    /// same-host tests where discovery has no public path to advertise.
    pub async fn bind_local(secret_key: [u8; 32]) -> Result<Self, TransportError> {
        Self::bind_with(secret_key, false).await
    }

    async fn bind_with(secret_key: [u8; 32], discovery: bool) -> Result<Self, TransportError> {
        // `SecretKey::from_bytes` is infallible: any 32 bytes are a valid
        // Ed25519 secret scalar seed.
        let secret = SecretKey::from_bytes(&secret_key);
        let endpoint = if discovery {
            Endpoint::builder(presets::N0)
                .secret_key(secret)
                .alpns(vec![ALPN.to_vec()])
                .bind()
                .await
        } else {
            Endpoint::builder(presets::Minimal)
                .secret_key(secret)
                .alpns(vec![ALPN.to_vec()])
                .bind()
                .await
        }
        .map_err(|e| TransportError::Bind(e.to_string()))?;
        Ok(IrohTransport { endpoint })
    }

    /// The local iroh node id (base32), equal to the Node.js transport's
    /// `endpoint.id().toString()`.
    pub fn node_id(&self) -> String {
        self.endpoint.id().to_string()
    }

    /// Build the published `iroh+captp0://` address for this endpoint,
    /// including the home relay and direct-address hints currently known.
    /// Loopback/private direct addresses are dropped unless `include_private`
    /// is set.
    pub fn address(&self, include_private: bool) -> String {
        let addr = self.endpoint.addr();
        let node_id = addr.id.to_string();
        let relay = addr.relay_urls().next().map(|u| u.to_string());
        let addresses: Vec<String> = addr.ip_addrs().map(|a| a.to_string()).collect();
        build_iroh_address(&node_id, relay.as_deref(), &addresses, include_private)
    }

    /// Dial a peer by its `iroh+captp0://` address and open the CapTP bidi
    /// stream. The caller writes the first netstring frame (the `hello`).
    pub async fn connect(&self, address: &str) -> Result<IrohSession, TransportError> {
        let parsed = parse_iroh_address(address)?;
        let id = PublicKey::from_str(&parsed.node_id)
            .map_err(|e| TransportError::NodeId(e.to_string()))?;
        let mut endpoint_addr = EndpointAddr::new(id);
        if let Some(relay) = &parsed.relay_url {
            let url = RelayUrl::from_str(relay).map_err(|e| TransportError::Hint(e.to_string()))?;
            endpoint_addr = endpoint_addr.with_relay_url(url);
        }
        for hint in &parsed.addresses {
            let socket_addr =
                SocketAddr::from_str(hint).map_err(|e| TransportError::Hint(e.to_string()))?;
            endpoint_addr = endpoint_addr.with_ip_addr(socket_addr);
        }
        let connection = self
            .endpoint
            .connect(endpoint_addr, ALPN)
            .await
            .map_err(|e| TransportError::Connect(e.to_string()))?;
        let (send, recv) = connection
            .open_bi()
            .await
            .map_err(|e| TransportError::Stream(e.to_string()))?;
        Ok(IrohSession::new(connection, send, recv))
    }

    /// Accept the next inbound connection and its CapTP bidi stream.
    ///
    /// Resolves to `None` once the endpoint is closed (mirroring the Node.js
    /// `acceptNext()` returning null). Otherwise resolves to one accepted
    /// session, or an error for that single connection attempt — the caller
    /// should log and keep looping rather than tearing the transport down.
    pub async fn accept(&self) -> Option<Result<IrohSession, TransportError>> {
        let incoming = self.endpoint.accept().await?;
        Some(self.accept_incoming(incoming).await)
    }

    async fn accept_incoming(&self, incoming: Incoming) -> Result<IrohSession, TransportError> {
        let accepting = incoming
            .accept()
            .map_err(|e| TransportError::Connect(e.to_string()))?;
        let connection = accepting
            .await
            .map_err(|e| TransportError::Connect(e.to_string()))?;
        let (send, recv) = connection
            .accept_bi()
            .await
            .map_err(|e| TransportError::Stream(e.to_string()))?;
        Ok(IrohSession::new(connection, send, recv))
    }

    /// Close the endpoint, which also ends the accept loop (a pending
    /// [`accept`](Self::accept) then resolves to `None`).
    pub async fn close(&self) {
        self.endpoint.close().await;
    }
}

/// One accepted or dialed iroh connection carrying a single CapTP bidi
/// stream, with netstring framing.
pub struct IrohSession {
    connection: Connection,
    send: SendStream,
    recv: BufReader<RecvStream>,
}

impl IrohSession {
    fn new(connection: Connection, send: SendStream, recv: RecvStream) -> Self {
        IrohSession {
            connection,
            send,
            recv: BufReader::new(recv),
        }
    }

    /// The underlying QUIC connection (cheap to clone; it is a handle).
    pub fn connection(&self) -> &Connection {
        &self.connection
    }

    /// The remote peer's iroh node id (base32).
    pub fn remote_node_id(&self) -> String {
        self.connection.remote_id().to_string()
    }

    /// Read the next netstring-framed CapTP message, or `None` at EOF.
    pub async fn read_frame(&mut self) -> std::io::Result<Option<Vec<u8>>> {
        netstring::read_netstring(&mut self.recv).await
    }

    /// Write one netstring-framed CapTP message.
    pub async fn write_frame(&mut self, data: &[u8]) -> std::io::Result<()> {
        netstring::write_netstring(&mut self.send, data).await
    }

    /// Signal the end of the outbound stream (QUIC FIN).
    pub fn finish(&mut self) -> Result<(), TransportError> {
        self.send
            .finish()
            .map_err(|e| TransportError::Stream(e.to_string()))
    }

    /// Close the whole connection with an application error code and reason.
    pub fn close(&self, code: u32, reason: &[u8]) {
        self.connection.close(VarInt::from(code), reason);
    }

    /// Resolve when the connection closes for any reason.
    pub async fn closed(&self) {
        let _ = self.connection.closed().await;
    }

    /// Decompose into a connection handle plus the owned send/receive halves,
    /// so a caller can drive read and write on separate tasks (as the
    /// supervisor's per-connection bridge does). The halves are returned as
    /// opaque `AsyncRead`/`AsyncWrite` values usable with
    /// [`crate::netstring`], so a consumer need not name iroh's stream types.
    pub fn into_parts(self) -> (IrohConnection, SendStream, BufReader<RecvStream>) {
        (
            IrohConnection {
                inner: self.connection,
            },
            self.send,
            self.recv,
        )
    }
}

/// A cheap, cloneable handle to a live iroh QUIC connection.
///
/// Exposes only what a byte bridge needs, so a consumer (e.g. the `endor`
/// supervisor) can manage a connection's lifetime without depending on iroh
/// directly.
#[derive(Clone)]
pub struct IrohConnection {
    inner: Connection,
}

impl IrohConnection {
    /// The remote peer's iroh node id (base32).
    pub fn remote_node_id(&self) -> String {
        self.inner.remote_id().to_string()
    }

    /// Close the connection with an application error code and reason.
    pub fn close(&self, code: u32, reason: &[u8]) {
        self.inner.close(VarInt::from(code), reason);
    }

    /// Resolve when the connection closes for any reason.
    pub async fn closed(&self) {
        let _ = self.inner.closed().await;
    }
}

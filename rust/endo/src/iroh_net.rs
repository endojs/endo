//! Iroh QUIC network device for the supervisor.
//!
//! This is the iroh counterpart of [`crate::socket`]. Where `socket`
//! bridges Unix-socket CLI clients into the daemon, this module binds an
//! iroh endpoint and bridges remote Endo peers — including Node.js Endo
//! daemons — that dial in over iroh QUIC. Both bridges are byte movers: they
//! frame CapTP with netstrings and hand the frames to the manager as
//! `deliver` envelopes; the manager runs CapTP and the greeter handshake.
//!
//! The wire is identical to the Node.js `@endo/daemon` iroh transport
//! (ALPN `endo/captp/0`, the `iroh+captp0://` address scheme, the
//! NodeNumber-derived identity, and one netstring-framed bidi stream per
//! connection), so a Rust `endor` and a Node.js daemon cross-connect. All of
//! the iroh-specific machinery lives in the `endo_iroh` crate, which is built
//! and tested independently of the XS engine.
//!
//! Protocol (mirrors the Unix-socket bridge):
//!   1. Manager sends `[0, "listen-iroh", {node: <NodeNumber hex>}, nonce]`.
//!   2. Supervisor binds the iroh endpoint and replies
//!      `[0, "listening-iroh", <iroh+captp0://… address as UTF-8>, nonce]`.
//!   3. Remote peer dials in → supervisor assigns handle C, sends
//!      `[C, "iroh-connect", {}, 0]` to the manager (a distinct verb so the
//!      manager bootstraps the session with the greeter, not the CLI's endo
//!      bootstrap).
//!   4. Peer CapTP traffic bridged, exactly as for a Unix client:
//!      - peer → manager: read netstring frame, wrap in `[C, "deliver", …, 0]`
//!      - manager → peer: `[C, "deliver", …, 0]` → netstring frame to peer
//!   5. Peer disconnect → `[C, "disconnect", {}, 0]`.

use std::sync::Arc;

use endo_iroh::address::derive_iroh_secret_key;
use endo_iroh::netstring::{read_netstring, write_netstring};
use endo_iroh::transport::{IrohSession, IrohTransport};

use crate::mailbox::MailboxReceiver;
use crate::supervisor::Supervisor;
use crate::types::{Envelope, Handle, Message};

/// Start an iroh listener that bridges inbound peer connections to the
/// manager identified by `daemon_handle`.
///
/// Binding is asynchronous, so this spawns the work and reports completion
/// out of band: on success it delivers `listening-iroh` (carrying the
/// published address) to `reply_to`; on failure it delivers an `error`
/// envelope. The `node_id_hex` is the daemon's NodeNumber, from which the
/// stable iroh identity is derived.
pub fn start_iroh_listener(
    sup: Arc<Supervisor>,
    daemon_handle: Handle,
    reply_to: Handle,
    nonce: i64,
    node_id_hex: String,
) {
    let secret = match derive_iroh_secret_key(&node_id_hex) {
        Ok(secret) => secret,
        Err(e) => {
            deliver_error(&sup, reply_to, nonce, format!("listen-iroh: {e}"));
            return;
        }
    };

    // Same-host / no-discovery mode: bind without relays or discovery and
    // publish direct-address hints so a peer on the same host can dial. Used
    // by the integration test and available to private-LAN deployments.
    let local = std::env::var_os("ENDO_IROH_LOCAL").is_some();
    // Off by default: private/loopback direct addresses are useless to remote
    // dialers. Enable for same-host runs, matching the Node.js transport's
    // ENDO_IROH_PUBLISH_PRIVATE knob; local mode implies it.
    let publish_private = local || std::env::var_os("ENDO_IROH_PUBLISH_PRIVATE").is_some();

    tokio::spawn(async move {
        let bind_result = if local {
            IrohTransport::bind_local(secret).await
        } else {
            IrohTransport::bind(secret).await
        };
        let transport = match bind_result {
            Ok(transport) => transport,
            Err(e) => {
                deliver_error(&sup, reply_to, nonce, format!("listen-iroh bind: {e}"));
                return;
            }
        };

        let address = transport.address(publish_private);
        eprintln!(
            "endor: iroh listener started, node {} at {address}",
            transport.node_id(),
        );

        // Acknowledge with the published address (plain UTF-8) so the manager
        // can advertise it as a dialable locator.
        sup.deliver(Message {
            from: 0,
            to: reply_to,
            envelope: Envelope {
                handle: 0,
                verb: "listening-iroh".to_string(),
                payload: address.clone().into_bytes(),
                nonce,
            },
            response_tx: None,
        });

        // Accept connections one at a time; each is wired up to its own
        // read/write tasks below, so the serial await here is intentional.
        loop {
            match transport.accept().await {
                None => {
                    // The endpoint closed; the listener is done.
                    return;
                }
                Some(Err(e)) => {
                    // A single failed inbound attempt must not tear down the
                    // listener, so log and keep accepting.
                    eprintln!("endor: iroh inbound connection error: {e}");
                }
                Some(Ok(session)) => {
                    let conn_handle = sup.alloc_handle();
                    let inbox = sup.register(conn_handle, None);

                    // Notify the manager of the new peer connection. A
                    // distinct verb (not the Unix bridge's `connect`) tells
                    // the manager to bootstrap this session with the greeter
                    // — peers speak the `hello` handshake, not the CLI's
                    // direct endo bootstrap.
                    sup.deliver(Message {
                        from: conn_handle,
                        to: daemon_handle,
                        envelope: Envelope {
                            handle: conn_handle,
                            verb: "iroh-connect".to_string(),
                            payload: Vec::new(),
                            nonce: 0,
                        },
                        response_tx: None,
                    });

                    wire_iroh_connection(
                        session,
                        conn_handle,
                        daemon_handle,
                        Arc::clone(&sup),
                        inbox,
                    );
                }
            }
        }
    });
}

/// Wire up read/write tasks for one accepted iroh connection.
///
/// Mirrors [`crate::socket`]'s per-client wiring: peer CapTP uses netstring
/// framing over the iroh bidi stream, bridged into the envelope protocol for
/// the manager.
fn wire_iroh_connection(
    session: IrohSession,
    conn_handle: Handle,
    daemon_handle: Handle,
    sup: Arc<Supervisor>,
    mut inbox: MailboxReceiver,
) {
    let (connection, mut send, mut recv) = session.into_parts();

    let sup_read = Arc::clone(&sup);

    // Read task: peer → manager.
    // Reads netstring-framed CapTP messages from the peer and wraps them in
    // deliver envelopes to the manager.
    tokio::spawn(async move {
        loop {
            match read_netstring(&mut recv).await {
                Ok(Some(data)) => {
                    sup_read.deliver(Message {
                        from: conn_handle,
                        to: daemon_handle,
                        envelope: Envelope {
                            handle: conn_handle,
                            verb: "deliver".to_string(),
                            payload: data,
                            nonce: 0,
                        },
                        response_tx: None,
                    });
                }
                Ok(None) => {
                    // Peer finished the stream.
                    disconnect(&sup_read, conn_handle, daemon_handle);
                    connection.close(0, b"disconnect");
                    return;
                }
                Err(e) => {
                    eprintln!("endor: iroh peer {conn_handle} read error: {e}");
                    disconnect(&sup_read, conn_handle, daemon_handle);
                    connection.close(0, b"read error");
                    return;
                }
            }
        }
    });

    // Write task: manager → peer.
    // Receives deliver envelopes from the manager and writes netstring-framed
    // CapTP messages to the peer.
    tokio::spawn(async move {
        loop {
            match inbox.recv().await {
                Some(msg) => {
                    if msg.envelope.verb == "deliver" {
                        if let Err(e) = write_netstring(&mut send, &msg.envelope.payload).await {
                            eprintln!("endor: iroh peer {conn_handle} write error: {e}");
                            return;
                        }
                    }
                    // Drain any queued messages.
                    for msg in inbox.drain() {
                        if msg.envelope.verb == "deliver" {
                            if let Err(e) = write_netstring(&mut send, &msg.envelope.payload).await
                            {
                                eprintln!("endor: iroh peer {conn_handle} write error: {e}");
                                return;
                            }
                        }
                    }
                }
                None => return,
            }
        }
    });
}

/// Deliver a `disconnect` envelope to the manager and unregister the handle.
fn disconnect(sup: &Arc<Supervisor>, conn_handle: Handle, daemon_handle: Handle) {
    sup.deliver(Message {
        from: conn_handle,
        to: daemon_handle,
        envelope: Envelope {
            handle: conn_handle,
            verb: "disconnect".to_string(),
            payload: Vec::new(),
            nonce: 0,
        },
        response_tx: None,
    });
    sup.unregister(conn_handle);
}

/// Deliver an `error` envelope to the manager (used when binding fails).
fn deliver_error(sup: &Arc<Supervisor>, reply_to: Handle, nonce: i64, message: String) {
    eprintln!("endor: {message}");
    sup.deliver(Message {
        from: 0,
        to: reply_to,
        envelope: Envelope {
            handle: 0,
            verb: "error".to_string(),
            payload: message.into_bytes(),
            nonce,
        },
        response_tx: None,
    });
}

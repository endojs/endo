//! Integration test for the supervisor's iroh network device.
//!
//! Drives the real `endo::iroh_net::start_iroh_listener` against a live
//! dialing peer (built from the `endo_iroh` transport, exactly what a remote
//! Endo daemon uses) and asserts the full byte bridge:
//!
//!   manager  ──listen-iroh──▶ supervisor ──binds iroh, replies listening-iroh
//!   peer dials the published address
//!   supervisor ──iroh-connect──▶ manager (new peer session)
//!   peer frame ──▶ supervisor ──deliver──▶ manager
//!   manager ──deliver──▶ supervisor ──netstring──▶ peer
//!
//! This exercises everything on the Rust side of the integration. The XS
//! manager half (which turns `iroh-connect`/`deliver` into a greeter-backed
//! CapTP session) is plain JS mirroring the existing Unix-client session
//! path.
//!
//! Opt-in via `ENDO_IROH_INTEGRATION=1` (it binds real QUIC sockets), like
//! the `endo_iroh` crate's own integration test. Building this test also
//! requires the XS engine (`xsnap`) to be buildable.
//!
//! Run with:
//!
//! ```text
//! ENDO_IROH_INTEGRATION=1 cargo test -p endo --test iroh_supervisor -- --nocapture
//! ```

use std::sync::Arc;
use std::time::Duration;

use endo::supervisor::{start_routing, RoutingCallbacks, Supervisor};
use endo::types::{Envelope, Message};
use endo_iroh::transport::IrohTransport;

fn gated() -> bool {
    std::env::var("ENDO_IROH_INTEGRATION").as_deref() == Ok("1")
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn supervisor_bridges_an_iroh_peer() {
    if !gated() {
        eprintln!("skipping: set ENDO_IROH_INTEGRATION=1 to run");
        return;
    }

    // Local mode so the listener binds without relay/discovery and publishes
    // a same-host-dialable direct address.
    std::env::set_var("ENDO_IROH_LOCAL", "1");

    // Stand up a supervisor with its routing loop and no-op control hooks.
    let (sup, outbox_rx) = Supervisor::new();
    start_routing(
        &sup,
        outbox_rx,
        RoutingCallbacks {
            on_control: Box::new(|_msg| {}),
            on_resume: Box::new(|_sup, _handle, _suspended, _msg| {}),
        },
    );

    // Play the role of the manager: register a handle and read what the
    // supervisor bridges to it.
    let manager_handle = sup.alloc_handle();
    let mut manager_inbox = sup.register(manager_handle, None);

    // A 64-hex NodeNumber; the supervisor derives the iroh identity from it.
    let node_hex = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    endo::iroh_net::start_iroh_listener(
        Arc::clone(&sup),
        manager_handle,
        manager_handle,
        42,
        node_hex.to_string(),
    );

    // 1. listening-iroh carries the published address.
    let listening = recv(&mut manager_inbox, "listening-iroh").await;
    assert_eq!(listening.envelope.verb, "listening-iroh");
    let address = String::from_utf8(listening.envelope.payload).expect("utf8 address");
    eprintln!("supervisor listening at {address}");
    assert!(address.starts_with("iroh+captp0:///"));

    // 2. A peer dials the published address (this is what a remote daemon does).
    let peer = IrohTransport::bind_local([0x5a; 32])
        .await
        .expect("bind peer");
    let mut peer_session = tokio::time::timeout(Duration::from_secs(20), peer.connect(&address))
        .await
        .expect("dial did not time out")
        .expect("dial");

    // Peer sends the first frame (the CapTP hello, here just opaque bytes).
    peer_session
        .write_frame(b"hello from the peer")
        .await
        .expect("peer write");

    // 3. The supervisor announces the connection to the manager …
    let connect = recv(&mut manager_inbox, "iroh-connect").await;
    assert_eq!(connect.envelope.verb, "iroh-connect");
    let conn_handle = connect.envelope.handle;

    // 4. … and bridges the peer's frame as a deliver envelope.
    let delivered = recv(&mut manager_inbox, "deliver").await;
    assert_eq!(delivered.envelope.verb, "deliver");
    assert_eq!(delivered.envelope.payload, b"hello from the peer");

    // 5. The manager replies; the supervisor frames it back to the peer.
    sup.deliver(Message {
        from: manager_handle,
        to: conn_handle,
        envelope: Envelope {
            handle: conn_handle,
            verb: "deliver".to_string(),
            payload: b"hello from the supervisor".to_vec(),
            nonce: 0,
        },
        response_tx: None,
    });
    let reply = peer_session
        .read_frame()
        .await
        .expect("peer read")
        .expect("reply, not EOF");
    assert_eq!(&reply, b"hello from the supervisor");

    sup.stop();
}

/// Receive from the manager inbox until a message with the expected verb
/// arrives (skipping any unrelated bookkeeping envelopes), with a timeout.
async fn recv(inbox: &mut endo::mailbox::MailboxReceiver, expected_verb: &str) -> Message {
    let deadline = Duration::from_secs(25);
    tokio::time::timeout(deadline, async {
        loop {
            let msg = inbox.recv().await.expect("inbox open");
            if msg.envelope.verb == expected_verb {
                return msg;
            }
            eprintln!(
                "  (skipping {} while waiting for {expected_verb})",
                msg.envelope.verb
            );
        }
    })
    .await
    .unwrap_or_else(|_| panic!("timed out waiting for {expected_verb}"))
}

//! Integration test: stand up two real iroh nodes in one process and drive a
//! netstring round-trip over the same transport the daemon uses.
//!
//! Opt-in via `ENDO_IROH_INTEGRATION=1`, mirroring the Node.js
//! `iroh-network.test.js`. It binds real QUIC sockets, so it is unsuitable
//! for unattended CI in a restricted sandbox (which can report placeholder
//! addresses and blocks iroh's discovery endpoints); the pure logic it
//! exercises is also covered by the unit tests in `src/`.
//!
//! Run with:
//!
//! ```text
//! ENDO_IROH_INTEGRATION=1 cargo test -p endo_iroh --test integration -- --nocapture
//! ```

use std::time::Duration;

use endo_iroh::transport::IrohTransport;

fn gated() -> bool {
    std::env::var("ENDO_IROH_INTEGRATION").as_deref() == Ok("1")
}

/// Two distinct 32-byte seeds.
fn seed(byte: u8) -> [u8; 32] {
    [byte; 32]
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn netstring_round_trip_over_iroh() {
    if !gated() {
        eprintln!("skipping: set ENDO_IROH_INTEGRATION=1 to run");
        return;
    }

    // Minimal preset: reachable on the same host via direct-address hints,
    // without needing relay/discovery egress.
    let server = IrohTransport::bind_local(seed(0xA1))
        .await
        .expect("bind server");
    let client = IrohTransport::bind_local(seed(0xB2))
        .await
        .expect("bind client");

    // Publish private addresses so the loopback hint is dialable on one host.
    let server_address = server.address(true);
    eprintln!("server address: {server_address}");
    assert!(server_address.starts_with("iroh+captp0:///"));

    let server_task = tokio::spawn(async move {
        let mut session = server
            .accept()
            .await
            .expect("endpoint open")
            .expect("accept session");
        let frame = session
            .read_frame()
            .await
            .expect("read frame")
            .expect("frame, not EOF");
        // Echo it straight back.
        session.write_frame(&frame).await.expect("echo frame");
        // Give the client time to read the echo before we drop the endpoint.
        tokio::time::sleep(Duration::from_millis(200)).await;
        frame
    });

    let connect = tokio::time::timeout(Duration::from_secs(20), client.connect(&server_address))
        .await
        .expect("connect did not time out")
        .expect("connect");
    let mut session = connect;

    let payload = b"hello over iroh netstring";
    session.write_frame(payload).await.expect("write frame");
    let reply = session
        .read_frame()
        .await
        .expect("read reply")
        .expect("reply, not EOF");
    assert_eq!(&reply, payload);

    let received = server_task.await.expect("server task");
    assert_eq!(&received, payload);
}

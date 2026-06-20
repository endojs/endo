//! `endo-iroh` — a tiny transport-layer harness for manually verifying that
//! the Rust iroh transport cross-connects with the Node.js Endo iroh
//! transport.
//!
//! It speaks the same ALPN, address scheme, and netstring framing as the
//! daemon transport, but it does *not* run CapTP — it just frames bytes — so
//! it proves the transport plumbing (iroh QUIC + ALPN + netstring) end to
//! end, not the full CapTP handshake.
//!
//! Usage:
//!
//! ```text
//!   endo-iroh listen [--local]            # print our address, echo frames
//!   endo-iroh dial <iroh+captp0://…> [msg]  # send one frame, print the reply
//! ```
//!
//! `--local` binds without relay/discovery (minimal preset) for same-host
//! tests. By default the n0 preset is used, so `listen` is dialable by node
//! id alone across networks (given outbound access to iroh's relay and
//! discovery services).

use std::process::ExitCode;

use endo_iroh::transport::IrohTransport;

fn usage() -> ExitCode {
    eprintln!("usage:");
    eprintln!("  endo-iroh listen [--local]");
    eprintln!("  endo-iroh dial <iroh+captp0://…> [message] [--local]");
    ExitCode::from(2)
}

fn main() -> ExitCode {
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("endo-iroh: tokio runtime: {e}");
            return ExitCode::FAILURE;
        }
    };
    runtime.block_on(async_main())
}

async fn async_main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let local = args.iter().any(|a| a == "--local");
    let positional: Vec<&String> = args.iter().filter(|a| !a.starts_with("--")).collect();

    let command = match positional.first() {
        Some(c) => c.as_str(),
        None => return usage(),
    };

    // A random key is fine for this harness; the daemon derives its key from
    // the NodeNumber instead.
    let secret = random_secret();

    let transport = if local {
        IrohTransport::bind_local(secret).await
    } else {
        IrohTransport::bind(secret).await
    };
    let transport = match transport {
        Ok(t) => t,
        Err(e) => {
            eprintln!("endo-iroh: {e}");
            return ExitCode::FAILURE;
        }
    };

    match command {
        "listen" => {
            // Publish private addresses too, so `--local` runs on one host are
            // dialable via the printed direct-address hints.
            println!("{}", transport.address(true));
            eprintln!("endo-iroh: listening as node {}", transport.node_id());
            loop {
                match transport.accept().await {
                    None => return ExitCode::SUCCESS,
                    Some(Err(e)) => eprintln!("endo-iroh: inbound error: {e}"),
                    Some(Ok(mut session)) => {
                        eprintln!("endo-iroh: accepted {}", session.remote_node_id());
                        tokio::spawn(async move {
                            while let Ok(Some(frame)) = session.read_frame().await {
                                eprintln!(
                                    "endo-iroh: recv {} bytes: {}",
                                    frame.len(),
                                    String::from_utf8_lossy(&frame),
                                );
                                if session.write_frame(&frame).await.is_err() {
                                    break;
                                }
                            }
                        });
                    }
                }
            }
        }
        "dial" => {
            let address = match positional.get(1) {
                Some(a) => a.as_str(),
                None => return usage(),
            };
            let message = positional
                .get(2)
                .map(|s| s.as_str())
                .unwrap_or("ping from endo-iroh");
            let mut session = match transport.connect(address).await {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("endo-iroh: {e}");
                    return ExitCode::FAILURE;
                }
            };
            eprintln!("endo-iroh: connected to {}", session.remote_node_id());
            if let Err(e) = session.write_frame(message.as_bytes()).await {
                eprintln!("endo-iroh: write: {e}");
                return ExitCode::FAILURE;
            }
            match session.read_frame().await {
                Ok(Some(reply)) => {
                    println!("{}", String::from_utf8_lossy(&reply));
                    ExitCode::SUCCESS
                }
                Ok(None) => {
                    eprintln!("endo-iroh: peer closed without replying");
                    ExitCode::FAILURE
                }
                Err(e) => {
                    eprintln!("endo-iroh: read: {e}");
                    ExitCode::FAILURE
                }
            }
        }
        _ => usage(),
    }
}

/// 32 random bytes, seeded from the OS via `getrandom` semantics provided by
/// the standard library's `RandomState` is not suitable; instead mix a few
/// entropy sources. This harness only needs an ephemeral identity.
fn random_secret() -> [u8; 32] {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    use std::time::{SystemTime, UNIX_EPOCH};

    let mut seed = [0u8; 32];
    let mut fill = |offset: usize, value: u64| {
        let bytes = value.to_le_bytes();
        for (i, b) in bytes.iter().enumerate() {
            if offset + i < seed.len() {
                seed[offset + i] = *b;
            }
        }
    };
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    fill(0, nanos);
    fill(8, std::process::id() as u64);
    // RandomState is randomly seeded per process; hash distinct keys to pull
    // independent words out of it.
    let state = RandomState::new();
    for (chunk, key) in (16..32).step_by(8).zip(0u64..) {
        let mut hasher = state.build_hasher();
        hasher.write_u64(key ^ nanos);
        fill(chunk, hasher.finish());
    }
    seed
}

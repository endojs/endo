use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use std::sync::mpsc as std_mpsc;

use xsnap::envelope;

// ---------------------------------------------------------------
// Channel transport: envelope round-trip (no XS machine)
//
// Measures the overhead of encoding an envelope, pushing it through
// an std::mpsc channel, and decoding on the other side. This is
// the "shared" platform transport path.
// ---------------------------------------------------------------

fn bench_channel_envelope_round_trip(c: &mut Criterion) {
    let mut group = c.benchmark_group("channel_transport");

    for payload_size in [0, 100, 1024, 65536] {
        let label = format!("{payload_size}B");
        group.bench_with_input(
            BenchmarkId::new("round_trip", &label),
            &payload_size,
            |b, &size| {
                let (tx_a2b, rx_a2b) = std_mpsc::channel::<Vec<u8>>();
                let (tx_b2a, rx_b2a) = std_mpsc::channel::<Vec<u8>>();

                let env = envelope::Envelope {
                    handle: 42,
                    verb: "deliver".to_string(),
                    payload: vec![0xABu8; size],
                    nonce: 1,
                };

                // Spawn an echo thread: decode → re-encode → send back.
                let echo = std::thread::spawn(move || {
                    loop {
                        match rx_a2b.recv() {
                            Ok(bytes) => {
                                // Just echo the raw bytes back (skip decode/encode
                                // to isolate channel overhead).
                                if tx_b2a.send(bytes).is_err() {
                                    return;
                                }
                            }
                            Err(_) => return,
                        }
                    }
                });

                b.iter(|| {
                    let encoded = envelope::encode_envelope(&env);
                    tx_a2b.send(encoded).unwrap();
                    let reply = rx_b2a.recv().unwrap();
                    let _ = black_box(envelope::decode_envelope(&reply).unwrap());
                });

                drop(tx_a2b);
                echo.join().unwrap();
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------
// Channel transport with decode+encode on echo side
//
// This is the full path: encode → channel → decode → re-encode →
// channel → decode. Closer to what a real worker bridge does.
// ---------------------------------------------------------------

fn bench_channel_full_bridge(c: &mut Criterion) {
    let mut group = c.benchmark_group("channel_bridge");

    for payload_size in [0, 100, 1024] {
        let label = format!("{payload_size}B");
        group.bench_with_input(
            BenchmarkId::new("full_round_trip", &label),
            &payload_size,
            |b, &size| {
                let (tx_a2b, rx_a2b) = std_mpsc::channel::<Vec<u8>>();
                let (tx_b2a, rx_b2a) = std_mpsc::channel::<Vec<u8>>();

                let echo = std::thread::spawn(move || {
                    loop {
                        match rx_a2b.recv() {
                            Ok(bytes) => {
                                // Full decode + re-encode (simulates worker processing).
                                let env = match envelope::decode_envelope(&bytes) {
                                    Ok(e) => e,
                                    Err(_) => return,
                                };
                                let reply = envelope::encode_envelope(&env);
                                if tx_b2a.send(reply).is_err() {
                                    return;
                                }
                            }
                            Err(_) => return,
                        }
                    }
                });

                let env = envelope::Envelope {
                    handle: 42,
                    verb: "deliver".to_string(),
                    payload: vec![0xABu8; size],
                    nonce: 1,
                };

                b.iter(|| {
                    let encoded = envelope::encode_envelope(&env);
                    tx_a2b.send(encoded).unwrap();
                    let reply = rx_b2a.recv().unwrap();
                    let _ = black_box(envelope::decode_envelope(&reply).unwrap());
                });

                drop(tx_a2b);
                echo.join().unwrap();
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------
// Pipe transport: envelope round-trip (fd pair)
//
// Measures the overhead of writing a CBOR-framed envelope through
// an OS pipe and reading it back. This is the "separate" platform
// transport path.
// ---------------------------------------------------------------

fn bench_pipe_envelope_round_trip(c: &mut Criterion) {
    let mut group = c.benchmark_group("pipe_transport");

    for payload_size in [0, 100, 1024, 65536] {
        let label = format!("{payload_size}B");
        group.bench_with_input(
            BenchmarkId::new("round_trip", &label),
            &payload_size,
            |b, &size| {
                // Create two pipe pairs: A→B and B→A.
                let (a2b_r, a2b_w) = os_pipe::pipe().unwrap();
                let (b2a_r, b2a_w) = os_pipe::pipe().unwrap();

                let echo = std::thread::spawn(move || {
                    let mut reader = std::io::BufReader::new(a2b_r);
                    let mut writer = std::io::BufWriter::new(b2a_w);
                    loop {
                        match endo::codec::read_frame(&mut reader) {
                            Ok(Some(data)) => {
                                if endo::codec::write_frame(&mut writer, &data).is_err() {
                                    return;
                                }
                            }
                            _ => return,
                        }
                    }
                });

                let env = envelope::Envelope {
                    handle: 42,
                    verb: "deliver".to_string(),
                    payload: vec![0xABu8; size],
                    nonce: 1,
                };

                let mut writer = std::io::BufWriter::new(a2b_w);
                let mut reader = std::io::BufReader::new(b2a_r);

                b.iter(|| {
                    let encoded = envelope::encode_envelope(&env);
                    endo::codec::write_frame(&mut writer, &encoded).unwrap();
                    let reply = endo::codec::read_frame(&mut reader).unwrap().unwrap();
                    let _ = black_box(envelope::decode_envelope(&reply).unwrap());
                });

                drop(writer);
                echo.join().unwrap();
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------
// Throughput: channel vs pipe at sustained load
//
// Send N envelopes as fast as possible, measure total time.
// ---------------------------------------------------------------

fn bench_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("throughput");
    group.sample_size(20);

    let payload = vec![0xABu8; 256];
    let n = 10_000u64;

    // Channel throughput.
    group.bench_function("channel_10k_256B", |b| {
        b.iter(|| {
            let (tx_a2b, rx_a2b) = std_mpsc::channel::<Vec<u8>>();
            let (tx_b2a, rx_b2a) = std_mpsc::channel::<Vec<u8>>();

            let echo = std::thread::spawn(move || {
                let mut count = 0u64;
                loop {
                    match rx_a2b.recv() {
                        Ok(bytes) => {
                            if tx_b2a.send(bytes).is_err() {
                                return count;
                            }
                            count += 1;
                        }
                        Err(_) => return count,
                    }
                }
            });

            let env = envelope::Envelope {
                handle: 42,
                verb: "deliver".to_string(),
                payload: payload.clone(),
                nonce: 1,
            };

            for _ in 0..n {
                let encoded = envelope::encode_envelope(&env);
                tx_a2b.send(encoded).unwrap();
                let _ = rx_b2a.recv().unwrap();
            }

            drop(tx_a2b);
            let _ = echo.join().unwrap();
        })
    });

    // Pipe throughput.
    group.bench_function("pipe_10k_256B", |b| {
        b.iter(|| {
            let (a2b_r, a2b_w) = os_pipe::pipe().unwrap();
            let (b2a_r, b2a_w) = os_pipe::pipe().unwrap();

            let echo = std::thread::spawn(move || {
                let mut reader = std::io::BufReader::new(a2b_r);
                let mut writer = std::io::BufWriter::new(b2a_w);
                loop {
                    match endo::codec::read_frame(&mut reader) {
                        Ok(Some(data)) => {
                            if endo::codec::write_frame(&mut writer, &data).is_err() {
                                return;
                            }
                        }
                        _ => return,
                    }
                }
            });

            let env = envelope::Envelope {
                handle: 42,
                verb: "deliver".to_string(),
                payload: payload.clone(),
                nonce: 1,
            };

            let mut writer = std::io::BufWriter::new(a2b_w);
            let mut reader = std::io::BufReader::new(b2a_r);

            for _ in 0..n {
                let encoded = envelope::encode_envelope(&env);
                endo::codec::write_frame(&mut writer, &encoded).unwrap();
                let _ = endo::codec::read_frame(&mut reader).unwrap().unwrap();
            }

            drop(writer);
            echo.join().unwrap();
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_channel_envelope_round_trip,
    bench_channel_full_bridge,
    bench_pipe_envelope_round_trip,
    bench_throughput,
);
criterion_main!(benches);

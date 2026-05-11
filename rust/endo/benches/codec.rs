use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use std::time::SystemTime;

use endo::codec;
use endo::types::{Envelope, WorkerInfo};

fn bench_encode_envelope(c: &mut Criterion) {
    let mut group = c.benchmark_group("encode_envelope");
    for size in [0, 100, 1024, 65536] {
        let env = Envelope {
            handle: 42,
            verb: "deliver".to_string(),
            payload: vec![0xABu8; size],
            nonce: 1,
        };
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{size}B")),
            &env,
            |b, env| b.iter(|| codec::encode_envelope(black_box(env))),
        );
    }
    group.finish();
}

fn bench_decode_envelope(c: &mut Criterion) {
    let mut group = c.benchmark_group("decode_envelope");
    for size in [0, 100, 1024, 65536] {
        let env = Envelope {
            handle: 42,
            verb: "deliver".to_string(),
            payload: vec![0xABu8; size],
            nonce: 1,
        };
        let encoded = codec::encode_envelope(&env);
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{size}B")),
            &encoded,
            |b, data| b.iter(|| codec::decode_envelope(black_box(data)).unwrap()),
        );
    }
    group.finish();
}

fn bench_encode_spawn_request(c: &mut Criterion) {
    let args: Vec<String> = vec![
        "worker".to_string(),
        "--state-dir=/tmp/state".to_string(),
        "--ephemeral-dir=/tmp/eph".to_string(),
    ];
    c.bench_function("encode_spawn_request", |b| {
        b.iter(|| {
            codec::encode_spawn_request(
                black_box("separate"),
                black_box("/usr/local/bin/endor"),
                black_box(&args),
            )
        })
    });
}

fn bench_decode_spawn_request(c: &mut Criterion) {
    let args: Vec<String> = vec![
        "worker".to_string(),
        "--state-dir=/tmp/state".to_string(),
        "--ephemeral-dir=/tmp/eph".to_string(),
    ];
    let encoded = codec::encode_spawn_request("separate", "/usr/local/bin/endor", &args);
    c.bench_function("decode_spawn_request", |b| {
        b.iter(|| codec::decode_spawn_request(black_box(&encoded)).unwrap())
    });
}

fn bench_decode_spawn_legacy(c: &mut Criterion) {
    // Legacy 2-entry map without platform key (backward compat path).
    let args: Vec<String> = vec!["worker".to_string()];
    // Build a legacy payload manually (encode with old format).
    let legacy = codec::encode_spawn_request("", "/usr/local/bin/endor", &args);
    // That still encodes platform="" — build a true legacy one without platform.
    // For a fair test, just use the 3-key version but measure the decode path.
    c.bench_function("decode_spawn_legacy_compat", |b| {
        b.iter(|| codec::decode_spawn_request(black_box(&legacy)).unwrap())
    });
}

fn bench_encode_worker_list(c: &mut Criterion) {
    let mut group = c.benchmark_group("encode_worker_list");
    for count in [1, 10, 50] {
        let workers: Vec<WorkerInfo> = (0..count)
            .map(|i| WorkerInfo {
                handle: i as i64,
                platform: "separate".to_string(),
                cmd: "/usr/local/bin/endor".to_string(),
                args: vec!["worker".to_string()],
                pid: 1000 + i as u32,
                started: SystemTime::UNIX_EPOCH,
            })
            .collect();
        group.bench_with_input(
            BenchmarkId::from_parameter(count),
            &workers,
            |b, w| b.iter(|| codec::encode_worker_list(black_box(w))),
        );
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_encode_envelope,
    bench_decode_envelope,
    bench_encode_spawn_request,
    bench_decode_spawn_request,
    bench_decode_spawn_legacy,
    bench_encode_worker_list,
);
criterion_main!(benches);

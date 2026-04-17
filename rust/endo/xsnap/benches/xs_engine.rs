use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use std::sync::Once;

use xsnap::{Machine, DEFAULT_CREATION, SNAPSHOT_SIGNATURE};

static INIT: Once = Once::new();

fn setup() {
    INIT.call_once(|| {
        xsnap::initialize_shared_cluster();
    });
}

fn new_machine() -> Machine {
    setup();
    Machine::new(&DEFAULT_CREATION, "bench").expect("failed to create machine")
}

// ---------------------------------------------------------------
// Machine creation
// ---------------------------------------------------------------

fn bench_machine_create_destroy(c: &mut Criterion) {
    setup();
    c.bench_function("machine_create_destroy", |b| {
        b.iter(|| {
            let m = Machine::new(&DEFAULT_CREATION, "bench")
                .expect("create failed");
            drop(black_box(m));
        })
    });
}

// ---------------------------------------------------------------
// Eval latency
// ---------------------------------------------------------------

fn bench_eval(c: &mut Criterion) {
    let mut group = c.benchmark_group("eval");

    // Trivial expression — measures call overhead.
    let m = new_machine();
    group.bench_function("1+1", |b| {
        b.iter(|| {
            let _ = black_box(m.eval("1+1"));
        })
    });
    drop(m);

    // Small computation.
    let m = new_machine();
    group.bench_function("loop_100", |b| {
        b.iter(|| {
            let _ = black_box(m.eval("var s=0; for(var i=0;i<100;i++) s+=i; s"));
        })
    });
    drop(m);

    // String concatenation (allocation pressure).
    let m = new_machine();
    group.bench_function("string_concat_100", |b| {
        b.iter(|| {
            let _ = black_box(m.eval("var s=''; for(var i=0;i<100;i++) s+='x'; s.length"));
        })
    });
    drop(m);

    // Object allocation.
    let m = new_machine();
    group.bench_function("object_create_100", |b| {
        b.iter(|| {
            let _ = black_box(m.eval(
                "var a=[]; for(var i=0;i<100;i++) a.push({x:i,y:i*2}); a.length",
            ));
        })
    });
    drop(m);

    // Larger expression — 1 KB source.
    let m = new_machine();
    let big_expr = format!(
        "var r=0; {}; r",
        (0..200).map(|i| format!("r+={i}")).collect::<Vec<_>>().join("; ")
    );
    group.bench_function("sum_200_terms", |b| {
        b.iter(|| {
            let _ = black_box(m.eval(&big_expr));
        })
    });
    drop(m);

    group.finish();
}

// ---------------------------------------------------------------
// Promise job drain
// ---------------------------------------------------------------

fn bench_promise_jobs(c: &mut Criterion) {
    let m = new_machine();
    // Enqueue a chain of 10 resolved promises.
    m.eval("function chainPromises(n) { \
        var p = Promise.resolve(0); \
        for (var i = 0; i < n; i++) p = p.then(function(v) { return v + 1; }); \
        return p; \
    }").unwrap();

    c.bench_function("promise_chain_10_drain", |b| {
        b.iter(|| {
            m.eval("chainPromises(10)").unwrap();
            m.run_promise_jobs();
        })
    });
}

// ---------------------------------------------------------------
// Snapshot: suspend + resume
// ---------------------------------------------------------------

fn bench_suspend_resume(c: &mut Criterion) {
    let mut group = c.benchmark_group("suspend_resume");

    // Empty machine (minimal heap).
    let m = new_machine();
    group.bench_function("empty_suspend", |b| {
        b.iter(|| {
            let data = m.suspend(SNAPSHOT_SIGNATURE).expect("suspend");
            black_box(&data);
        })
    });
    // Resume from that snapshot.
    let data = m.suspend(SNAPSHOT_SIGNATURE).expect("suspend");
    group.bench_function("empty_resume", |b| {
        b.iter(|| {
            let restored = Machine::resume(black_box(&data), "bench-resume")
                .expect("resume");
            drop(black_box(restored));
        })
    });
    drop(m);

    // Machine with ~10 KB of state.
    let m = new_machine();
    m.eval("var data = []; for (var i = 0; i < 500; i++) data.push({idx: i, val: 'item-' + i});")
        .unwrap();
    group.bench_function("10k_state_suspend", |b| {
        b.iter(|| {
            let data = m.suspend(SNAPSHOT_SIGNATURE).expect("suspend");
            black_box(&data);
        })
    });
    let data = m.suspend(SNAPSHOT_SIGNATURE).expect("suspend");
    let snap_size = data.snapshot.len();
    group.bench_function("10k_state_resume", |b| {
        b.iter(|| {
            let restored = Machine::resume(black_box(&data), "bench-resume")
                .expect("resume");
            drop(black_box(restored));
        })
    });
    drop(m);
    eprintln!("  [info] 10k state snapshot size: {} bytes", snap_size);

    // Machine with ~100 KB of state.
    let m = new_machine();
    m.eval("var data = []; for (var i = 0; i < 5000; i++) data.push({idx: i, val: 'item-' + i, nested: {a: i, b: i*2}});")
        .unwrap();
    group.bench_function("100k_state_suspend", |b| {
        b.iter(|| {
            let data = m.suspend(SNAPSHOT_SIGNATURE).expect("suspend");
            black_box(&data);
        })
    });
    let data = m.suspend(SNAPSHOT_SIGNATURE).expect("suspend");
    let snap_size = data.snapshot.len();
    group.bench_function("100k_state_resume", |b| {
        b.iter(|| {
            let restored = Machine::resume(black_box(&data), "bench-resume")
                .expect("resume");
            drop(black_box(restored));
        })
    });
    drop(m);
    eprintln!("  [info] 100k state snapshot size: {} bytes", snap_size);

    group.finish();
}

// ---------------------------------------------------------------
// Suspend to CAS (file-streaming)
// ---------------------------------------------------------------

fn bench_suspend_to_cas(c: &mut Criterion) {
    let tmp = tempfile::tempdir().unwrap();
    let cas_dir = tmp.path().join("store-sha256");

    let m = new_machine();
    m.eval("var data = []; for (var i = 0; i < 500; i++) data.push({idx: i, val: 'item-' + i});")
        .unwrap();

    c.bench_function("suspend_to_cas_10k", |b| {
        b.iter(|| {
            let hash = m
                .suspend_to_cas(SNAPSHOT_SIGNATURE, &cas_dir)
                .expect("suspend_to_cas");
            black_box(hash);
        })
    });

    // Resume from CAS.
    let hash = m
        .suspend_to_cas(SNAPSHOT_SIGNATURE, &cas_dir)
        .expect("suspend_to_cas");
    let mut callbacks = Vec::new();
    c.bench_function("resume_from_cas_10k", |b| {
        b.iter(|| {
            let restored = Machine::resume_from_cas(
                &cas_dir,
                black_box(&hash),
                "bench-cas-resume",
                SNAPSHOT_SIGNATURE,
                &mut callbacks,
            )
            .expect("resume_from_cas");
            drop(black_box(restored));
        })
    });
}

// ---------------------------------------------------------------
// Garbage collection
// ---------------------------------------------------------------

fn bench_gc(c: &mut Criterion) {
    let m = new_machine();
    m.eval("var data = []; for (var i = 0; i < 1000; i++) data.push({x: i}); data = null;")
        .unwrap();

    c.bench_function("collect_garbage", |b| {
        b.iter(|| {
            m.collect_garbage();
        })
    });
}

criterion_group!(
    benches,
    bench_machine_create_destroy,
    bench_eval,
    bench_promise_jobs,
    bench_suspend_resume,
    bench_suspend_to_cas,
    bench_gc,
);
criterion_main!(benches);

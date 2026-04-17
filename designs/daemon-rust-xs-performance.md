# Rust+XS Daemon Performance: Bugs, Fixes, and Benchmark Results

| | |
|---|---|
| **Created** | 2026-04-16 |
| **Updated** | 2026-04-17 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Active |

## Summary

This document captures the findings from an apples-to-apples
performance comparison between the Node.js daemon and the Rust+XS
daemon.
Two classes of bug were found and fixed:

1. **XS host function argument access** — an off-by-one in every
   host callback's frame offset silently read wrong stack slots.
2. **Reactive pump sleep** — a `thread::sleep(1ms)` in the XS
   event loop added milliseconds of latency to every CapTP
   round-trip.

After both fixes, the Rust+XS daemon is competitive with the
Node.js daemon on most operations and faster on cold eval and
worker recycling.

## XS Stack Frame Layout (64-bit LE)

The XS engine stores function arguments on a stack-frame-relative
layout.
Understanding this is critical for writing correct host callbacks
in Rust.

```
txSlot layout (64-bit LE): 32 bytes per slot
  bytes 0-7:   next pointer
  bytes 8:     kind (1 byte)
  bytes 9:     flag (1 byte)
  bytes 10-11: ID   (signed 16-bit) — stores argc for frame slots
  bytes 12-31: value union (various types)

Argument access:
  mxArgv(i) = the->frame - 1 - i
  First arg (i=0): frame.sub(1)
  Second arg (i=1): frame.sub(2)

Argc:
  mxArgc = the->frame->ID
  Read as: *(frame_as_bytes.add(10) as *const i16)

Result:
  xsResult = *(frame + 1)
  Write as: *(*the).frame.add(1) = (*the).scratch
```

### The off-by-one bug

All Rust host functions used `frame.sub(2 + index)` to access
argument `index`.
The correct offset is `frame.sub(1 + index)`.
The extra `+1` came from a misreading of the XS macros (confusing
`mxArgv` with `mxThis`).

Files fixed (every `frame.sub(2)` → `frame.sub(1)`, etc.):
- `xsnap/src/worker_io.rs` — `arg_str`, `host_issue_command`,
  `host_send_raw_frame`, `host_import_archive`,
  `host_base64_encode`, `host_decode_utf8`
- `xsnap/src/powers/fs.rs` — `arg_bytes`, `arg_dir_token`,
  `resolve_dir`, all direct frame access
- `xsnap/src/powers/crypto.rs` — handle slot and data slot access
- `xsnap/src/powers/sqlite.rs` — 8 occurrences
- `xsnap/src/powers/process.rs` — `host_join_path` argc reading
- `xsnap/src/lib.rs` — test host functions

### Special case: argc in host_join_path

`host_join_path` needs the argument count to support variadic
calls.
After the frame offset fix, the old approach of calling
`fxToInteger(the, frame.sub(1))` now reads argv[0] instead of
argc.
The fix reads the frame slot's ID field directly:

```rust
let frame_bytes = (*the).frame as *const u8;
let argc = *(frame_bytes.add(10) as *const i16) as usize;
```

## XS Block-Scoping Bug with eval + try/catch

When bundle code is wrapped in `try { <code> } catch(e) {}`,
`const` declarations become block-scoped to the try block.
XS does not retain these bindings for async continuations after
`await`, causing `ReferenceError` for any `const` declared inside
the try block that is referenced after an `await`.

Workaround: use `eval(jsonString)` to inject code, or inline
values at the usage site rather than referencing module-scope
`const` bindings across `await` boundaries.

This affects `daemon_bootstrap.js` — the CBOR helper functions
(`cborAppendHead`, `cborAppendText`) had to be inlined at the
call site in `main()` because `main()` awaits before using them.

## Reactive Pump Loop

The XS event loop in `lib.rs` (the "reactive pump") is the core
of both the manager and worker main loops.
Getting this right is essential for performance and correctness.

### Architecture

```
'outer: loop {
    // 1. Block for next envelope (recv_raw_envelope — blocking)
    // 2. handle_envelope — dispatch to JS
    // 3. Reactive pump (inner loop):
    //    a. Drain promise jobs until quiescent
    //    b. Drain inbound envelopes (non-blocking try_recv)
    //    c. If envelopes arrived, go to (a)
    //    d. If fxHasPendingJobs still set, go to (a)
    //    e. Break — truly idle
    // 4. Check __shouldTerminate()
}
```

### Critical insight: fxHasPendingJobs is check-and-reset

```c
// xsnap-platform.c
static int gHasPendingJobs = 0;

void fxQueuePromiseJobs(txMachine* the) {
    the->promiseJobs = 1;
    gHasPendingJobs = 1;  // Set when ANY promise resolves
}

int fxHasPendingJobs(void) {
    int result = gHasPendingJobs;
    gHasPendingJobs = 0;  // RESET on read
    return result;
}
```

`fxHasPendingJobs()` returns 1 if any promise was queued since
the last call, then **clears the flag**.
It is not a count; it is a one-shot latch.

`fxRunPromiseJobs` moves all pending jobs to a running list and
executes them.
Executing a job may resolve further promises (microtask chaining),
which calls `fxQueuePromiseJobs` and sets the flag again.
A single `fxRunPromiseJobs` call only drains the jobs that were
pending at call time — newly queued jobs require another call.

### Why sleep(1ms) was wrong

The original pump loop called `fxRunPromiseJobs` once, checked
`fxHasPendingJobs`, and if the flag was set, slept 1ms before
retrying.
This was wrong for two reasons:

1. **Performance**: every CapTP round-trip through the manager
   paid at least 1ms of dead time per pump iteration.
   Multi-step operations (provideWorker, evaluate) accumulated
   many milliseconds of sleep.
2. **Correctness**: the sleep was a workaround for the fact that
   one `fxRunPromiseJobs` call doesn't drain microtask chains.
   The right fix is to loop `fxRunPromiseJobs` until
   `fxHasPendingJobs` returns 0.

### Why blocking recv was wrong (first fix attempt)

Replacing sleep with a blocking `recv_raw_envelope()` caused a
deadlock.
After `fxRunPromiseJobs`, `fxHasPendingJobs` returns 1 because
jobs were queued during execution.
Those jobs don't need external input — they just need another
`fxRunPromiseJobs` turn.
But the code blocked on recv, waiting for an envelope that would
never come because the JS hadn't progressed far enough to send
the outbound message (e.g., `listen-path`) that would trigger
the response.

### Correct pump loop (current implementation)

```rust
loop {
    // Drain promise jobs until no new jobs are queued.
    loop {
        fxRunPromiseJobs(machine.raw);
        if fxHasPendingJobs() == 0 { break; }
    }

    // Drain inbound envelopes (non-blocking).
    let mut got_envelope = false;
    loop {
        match try_recv_raw_envelope() {
            Ok(Some(data)) => {
                got_envelope = true;
                handle_envelope(&machine, &data);
            }
            Ok(None) => break,
            Err(_) => break 'outer,
        }
    }

    // Envelopes may have triggered new promise jobs.
    if got_envelope { continue; }

    // sendRawFrame (called during promise execution) may have
    // queued new jobs without producing inbound envelopes yet.
    if fxHasPendingJobs() != 0 { continue; }

    // Truly idle.
    break;
}
```

This has zero sleep, zero polling, and correctly handles:
- Microtask chains (multiple `fxRunPromiseJobs` turns)
- Inbound envelopes arriving during JS execution
- Outbound messages triggering new promise resolution

The outer loop then blocks on `recv_raw_envelope()` for the next
inbound envelope, which is the only point where the thread sleeps
(waiting on a channel or pipe read).

## Message Bus Architecture

```
Client (Node.js)
  │ Unix socket (netstring-framed CBOR envelopes)
  ▼
Rust supervisor (tokio async)
  │ tokio::sync::mpsc (unbounded) — "outbox"
  ▼
Routing loop (tokio::spawn)
  │ Dispatches by handle: 0=control, N=worker inbox
  ▼
Worker inbox (tokio::sync::mpsc unbounded)
  │
  ├─ Subprocess workers (pipe transport):
  │    fd 3 (supervisor→worker), fd 4 (worker→supervisor)
  │    CBOR envelope frames, length-prefixed
  │
  └─ In-process XS manager (channel transport):
       Inbound bridge: tokio task reads inbox → std::sync::mpsc
       Outbound bridge: spawn_blocking reads std::sync::mpsc
         → supervisor.deliver()
       XS thread: blocks on std::sync::mpsc recv
```

### Protocol layers

- **Outer**: CBOR envelope — 4-element array
  `[handle: uint, verb: text, payload: bytes, nonce: uint]`
- **Inner payload for CapTP**: JSON-encoded CapTP messages
  (`JSON.stringify` → `TextEncoder.encode` on send;
   `TextDecoder.decode` → `JSON.parse` on receive)
- **Inner payload for control**: CBOR maps
  (e.g., spawn: `{platform, command, args}`;
   listen-path: `{path}`)

Both requests and responses use the same encoding — there is no
asymmetry between directions.

## Benchmark Results

### Before fixes (with 1ms sleep)

| Operation         | Node.js | Rust+XS | Rust+Node |
|-------------------|---------|---------|-----------|
| ping              |  0.3ms  |  5.8ms  |   5.4ms   |
| provideWorker     |  5.3ms  | 54.0ms  |  55.6ms   |
| eval_cold         | 100.6ms | 80.6ms  | 132.6ms   |
| eval_warm         |  2.0ms  | 44.7ms  |  43.7ms   |
| eval_string_result|  1.6ms  | 45.9ms  |  45.9ms   |
| list              |  0.4ms  |  8.6ms  |   8.7ms   |
| storeValue_lookup |  0.8ms  | 47.9ms  |  49.0ms   |
| cancel_worker     |  3.9ms  | 90.8ms  |  92.4ms   |
| cancel_reprovision| 173.0ms | 260.5ms | 349.4ms   |

The Rust+XS and Rust+Node columns being nearly identical
confirmed the bottleneck was in the manager's message bus, not
in the worker platform.

### After fixes (no sleep, correct promise draining)

Run 2026-04-17 on the current working copy:

| Operation         | Node.js | Rust+XS | Rust+Node | Speedup |
|-------------------|---------|---------|-----------|---------|
| ping              |  0.3ms  |  0.6ms  |   0.6ms   |   9.7x  |
| provideWorker     |  4.3ms  |  6.5ms  |   6.2ms   |   8.3x  |
| eval_cold         | 89.3ms  | 49.1ms  | 101.0ms   |   1.6x  |
| eval_warm         |  1.7ms  |  2.5ms  |   3.0ms   |  17.9x  |
| eval_string_result|  1.8ms  |  3.9ms  |   3.5ms   |  11.8x  |
| list              |  0.4ms  |  1.1ms  |   1.0ms   |   7.8x  |
| storeValue_lookup |  1.0ms  |  1.8ms  |   2.2ms   |  26.6x  |
| cancel_worker     |  3.9ms  |  8.0ms  |  16.0ms   |  11.4x  |
| cancel_reprovision| 175.7ms | 100.7ms | 177.8ms   |   2.6x  |

Speedup column is Rust+XS before/after (comparing the "before
fixes" table above against these numbers).

### Analysis

- **eval_cold** (49ms vs 89ms) and **cancel_reprovision**
  (101ms vs 176ms) are significantly faster on Rust+XS than
  Node.js — the XS engine starts up faster than Node.js
  workers, and the Rust supervisor has lower process management
  overhead.
- **eval_warm** (2.5ms vs 1.7ms) and **storeValue_lookup**
  (1.8ms vs 1.0ms) show the Rust+XS daemon is within 1.5-2x
  of Node.js on warm-path operations.
  The gap is the inherent cost of the supervisor routing +
  channel bridges + CBOR/JSON encode/decode vs Node.js's
  in-process CapTP.
- **ping** (0.6ms vs 0.3ms) represents the baseline round-trip
  overhead of the Rust message bus — 2x of Node.js.
- The Rust+Node column isolates supervisor overhead from worker
  overhead — it uses Node.js subprocess workers with the Rust
  supervisor.
  The similarity between Rust+XS and Rust+Node on ping, list,
  and storeValue_lookup confirms the bottleneck is in the
  supervisor routing path, not in the worker platform.
- **cancel_worker** (8.0ms Rust+XS vs 16.0ms Rust+Node) shows
  that XS subprocess workers shut down faster than Node.js
  subprocess workers.

## Remaining Optimization Opportunities

### 1. JSON encode/decode in CapTP payload

The CapTP payload is `JSON.stringify` → `TextEncoder.encode` on
send and `TextDecoder.decode` → `JSON.parse` on receive.
This is O(n) serialization on every message.
A binary CapTP encoding (e.g., CBOR for the CapTP layer too)
would eliminate this overhead.

### 2. Channel bridge scheduling latency

The in-process XS manager communicates with the supervisor through
two bridge tasks:
- Inbound: `tokio::spawn` async task reads from supervisor inbox,
  pushes to `std::sync::mpsc`
- Outbound: `tokio::task::spawn_blocking` reads from
  `std::sync::mpsc`, calls `supervisor.deliver()`

Each direction involves a task switch.
A more direct integration (e.g., the supervisor routing loop
directly pushing to the machine's channel) could eliminate one
hop.

### 3. Worker spawn latency

`provideWorker` on Rust+XS (7.6ms) is 2x slower than Node.js
(3.9ms).
The XS worker must bootstrap SES + the worker bundle before it
can respond.
Pre-warming a worker pool or using snapshots for worker
initialization could close this gap.

### 4. String info cache

The XS `mxStringInfoCacheLength` is set to 4 (in
`rust/endo/xsnap/build.rs:147`).
This caches string operation metadata.
Increasing it may help workloads with many distinct strings.

## Running the Benchmarks

```bash
# Build the Rust daemon
cargo build -p endo --release

# Run all three variants (Node.js, Rust+XS, Rust+Node)
node packages/daemon/test/bench-daemon.js

# Run only Node.js variant
node packages/daemon/test/bench-daemon.js --node-only

# Run only Rust variants
node packages/daemon/test/bench-daemon.js --rust-only

# Override endor binary location
ENDO_BIN=/path/to/endor node packages/daemon/test/bench-daemon.js
```

The benchmark script (`packages/daemon/test/bench-daemon.js`)
starts a fresh daemon per variant, runs identical workloads, and
prints a comparison table.

## Key Files

| File | Role |
|------|------|
| `rust/endo/xsnap/src/lib.rs` | XS machine, reactive pump loop |
| `rust/endo/xsnap/src/worker_io.rs` | Host function helpers, transport trait |
| `rust/endo/xsnap/src/powers/*.rs` | Host function implementations |
| `rust/endo/xsnap/xsnap-platform.c` | XS platform layer (fxHasPendingJobs, fxQueuePromiseJobs) |
| `rust/endo/src/inproc.rs` | In-process XS manager bridge |
| `rust/endo/src/supervisor.rs` | Message routing |
| `rust/endo/src/endo.rs` | Daemon entry, control message handlers |
| `rust/endo/xsnap/src/daemon_bootstrap.js` | Bundled JS daemon manager (~36k lines) |
| `packages/daemon/src/envelope.js` | CBOR envelope codec (JS) |
| `packages/daemon/src/connection.js` | CapTP message serialization (JSON) |
| `packages/daemon/test/bench-daemon.js` | Benchmark harness |

## Working Copy Inventory

All changes below are uncommitted on `worktree/endo-daemon-rust`
as of 2026-04-16.
They span three major efforts documented in separate design docs.
This section serves as a map so the next agent can orient quickly.

### Related design documents

| Document | Covers |
|----------|--------|
| [daemon-endor-architecture](daemon-endor-architecture.md) | Overall Rust daemon architecture, supervisor, routing, control verbs, worker platforms, engine dispatch |
| [daemon-xs-worker-snapshot](daemon-xs-worker-snapshot.md) | XS heap snapshot FFI, suspend/resume protocol, CAS storage |
| [daemon-rust-xs-performance](daemon-rust-xs-performance.md) | This document — benchmarks, bug fixes, reactive pump |

### 1. XS host function argument fix (bug fix)

**Root cause:** every Rust host callback used `frame.sub(2 + i)`
instead of `frame.sub(1 + i)` to access argument `i`.

**Files changed:**

| File | What changed |
|------|-------------|
| `xsnap/src/worker_io.rs` | `arg_str` offset; 5 direct `frame.sub` sites |
| `xsnap/src/powers/fs.rs` | `arg_bytes`, `arg_dir_token`, `resolve_dir`, all direct access |
| `xsnap/src/powers/crypto.rs` | 4 handle/data slot accesses |
| `xsnap/src/powers/sqlite.rs` | 8 occurrences |
| `xsnap/src/powers/process.rs` | `host_join_path` argc reading (frame ID field) |
| `xsnap/src/lib.rs` | 2 test host functions |

**Status:** complete, tested via daemon startup + benchmarks.

### 2. Reactive pump loop fix (performance)

**Root cause:** `std::thread::sleep(Duration::from_millis(1))`
in the XS event loop.

**File:** `xsnap/src/lib.rs` lines 1296-1358

**What changed:** replaced sleep with a three-phase drain loop
that calls `fxRunPromiseJobs` until `fxHasPendingJobs` returns 0
(check-and-reset semantics), drains inbound envelopes via
non-blocking `try_recv`, and only breaks when both are exhausted.
See "Reactive Pump Loop" section above for full details.

**Status:** complete, benchmarked (7-18x improvement).

### 3. Worker platform refactoring (feature)

**Design doc:** [daemon-endor-architecture](daemon-endor-architecture.md)

The spawn payload now carries a `platform` field and the Rust
daemon dispatches based on it.
Partially implements the plan in
`~/.claude/plans/splendid-coalescing-adleman.md`.

| File | What changed |
|------|-------------|
| `src/types.rs` | `WorkerInfo` gained `platform: String` field |
| `src/codec.rs` | `decode_spawn_request` returns `(platform, cmd, args)`; `encode_spawn_request` takes platform; `decode_listen_path_request` and `decode_suspend_request` added; CBOR map encoding; 4 unit tests |
| `src/engine.rs` | `Engine::Process` → `Engine::Separate{platform}` + `Engine::Shared`; `engine_for_spawn_request` dispatches on platform string; unit tests |
| `src/endo.rs` | `handle_control_message` takes `cas_dir`; `listen` verb → `listen-path` (CBOR payload); `listening` → `listening-path`; spawn dispatches `Engine::Shared` to `inproc::spawn_shared_worker`; `suspend`/`suspended` control verbs; `handle_resume` function; `wire_worker_tasks` gains `init_verb`/`init_payload` params |
| `src/inproc.rs` | `spawn_shared_worker` added (thin wrapper around `spawn_inproc_xs_peer`) |
| `src/proc.rs` | `spawn_process` takes `platform` param; `wire_worker_tasks` takes `init_verb`/`init_payload` |
| `src/supervisor.rs` | `SuspendedWorker` struct; `mark_suspended`/`is_suspended`/`take_suspended`; `RoutingCallbacks` struct with `on_control`/`on_resume`; `start_routing` accepts callbacks; routing detects suspended handles; `workers_write` accessor; platform in `workers_snapshot` |
| `src/socket.rs` | Minor (4 lines) |
| `xsnap/src/daemon_bootstrap.js` | `kind` → `platform` rename (~15 sites); `defaultPlatform` from env var; `encodeSpawnPayload` takes platform; `makeWorker` resolves platform to command/args; `listen` → `listen-path` with CBOR payload; `listening` → `listening-path` |

**Status:** Platform dispatch working for `"separate"` and
`"node"`.
`"shared"` engine resolves to `Engine::Shared` and calls
`spawn_shared_worker`, but has not been integration-tested
end-to-end yet.

**Remaining (from the plan):**
- Integration test for shared (in-process) workers.
- Platform-aware resume (currently `handle_resume` always uses
  in-process restore; need to branch on `info.platform` for
  `"separate"`/`"node"` workers that resume as child processes).
- Machine runner thread pool (currently shared workers get their
  own `std::thread` via `spawn_inproc_xs_peer`).

### 4. XS heap snapshots and suspend/resume (feature)

**Design doc:** [daemon-xs-worker-snapshot](daemon-xs-worker-snapshot.md)

| File | What changed |
|------|-------------|
| `xsnap/src/ffi.rs` | `XsSnapshot` struct, `XsSnapshotReadFn`/`XsSnapshotWriteFn` types, `fxWriteSnapshot`/`fxReadSnapshot`/`fx_harden` FFI declarations |
| `xsnap/src/lib.rs` | `Machine::write_snapshot`/`from_snapshot` (in-memory); `Machine::write_snapshot_to_file`/`from_snapshot_file` (streaming); `Machine::suspend`/`resume`; `Machine::suspend_to_cas`/`resume_from_cas` (CAS integration); `SuspendData` struct; `worker_snapshot_callbacks`; `SnapshotError` type; `handle_suspend` in worker event loop; `run_xs_worker_inproc` entry point; `InitResult::Restore` handling; 9 unit tests |
| `xsnap/src/worker_io.rs` | `InitResult` enum (`Init`/`Restore`); both transport impls updated; `init_handshake` returns `InitResult` |
| `xsnap/xsnap-platform.c` | `fxCollectHostCallbacks` function for snapshot callback discovery |
| `xsnap/src/powers/modules.rs` | `CALLBACKS` const for snapshot table |
| `xsnap/src/powers/process.rs` | `CALLBACKS` const for snapshot table |
| `xsnap/src/powers/crypto.rs` | (offset fixes only) |
| `xsnap/src/powers/fs.rs` | (offset fixes only) |
| `xsnap/src/powers/sqlite.rs` | (offset fixes only) |

**Status:** Phase 1 (Rust snapshot FFI) complete.
Phase 2 (supervisor suspend/resume) done except for integration
test and platform-aware resume branching.
See the snapshot design doc for phase details.

### 5. Benchmark harness (new file)

**File:** `packages/daemon/test/bench-daemon.js`

Three-variant benchmark (Node.js, Rust+XS, Rust+Node workers)
with N-column comparison table.
See "Running the Benchmarks" section above.

### 6. CESU-8 encoding (bug fix)

**File:** `xsnap/src/worker_io.rs` (`arg_str`, `set_result_string`)

XS stores strings in CESU-8 (surrogate pairs for supplementary
characters).
`arg_str` now decodes CESU-8 → UTF-8; `set_result_string`
encodes UTF-8 → CESU-8 via `crate::cesu8`.
Without this, emoji and other supplementary characters corrupted
string values crossing the JS/Rust boundary.

### 7. XS block-scoping workaround (bug fix)

**File:** `xsnap/src/daemon_bootstrap.js` (listen-path encoding)

Inlined CBOR encoding at the usage site in `main()` to avoid
referencing module-scope `const` bindings across `await`
boundaries.
See "XS Block-Scoping Bug" section above.

### 8. Miscellaneous

| File | What |
|------|------|
| `Cargo.lock` | Dependency updates (344 lines) |
| `rust/endo/Cargo.toml` | New dependencies for snapshot/bench support |
| `xsnap/Cargo.toml` | New dependencies |
| `designs/README.md` | Added new design doc entries |
| `designs/daemon-endo-rust-sqlite.md` | Status updates |
| `rust/endo/benches/codec.rs` | Criterion benchmark for codec (untracked) |
| `rust/endo/xsnap/benches/transport.rs` | Criterion benchmark for transport (untracked) |
| `rust/endo/xsnap/benches/xs_engine.rs` | Criterion benchmark for XS engine (untracked) |

## Next Steps

Ordered by impact:

1. **Platform-aware resume** — `handle_resume` in `endo.rs`
   currently always uses in-process channel transport.
   It should branch on `info.platform`: `"shared"` uses
   channel transport (current path); `"separate"` and `"node"`
   should re-spawn the original command/args as a child process
   with a `"restore"` init envelope.

2. **Integration test for suspend/resume** — full round-trip
   through the supervisor: send `"suspend"` control verb →
   worker snapshots to CAS → supervisor marks suspended →
   send message to suspended handle → supervisor resumes →
   restored worker responds correctly.

3. **Integration test for shared workers** — spawn a worker
   with `platform: "shared"`, send an envelope, verify
   response.

4. **Further performance optimization** — the 2-3x gap on
   warm operations may be reducible by:
   - Eliminating the JSON layer in CapTP payloads (use CBOR
     end-to-end).
   - Shortcutting the bridge for control messages (supervisor
     routing loop directly pushes to the machine channel for
     in-process peers, avoiding the tokio task hop).
   - Worker snapshot-based warm start (snapshot a freshly
     bootstrapped worker, restore from snapshot instead of
     re-bootstrapping on each spawn).

5. **Machine runner thread pool** — shared workers currently
   each get their own `std::thread`.
   The design doc describes a cooperative event loop where
   multiple machines share a runner thread.
   This is an optimization, not a correctness issue.

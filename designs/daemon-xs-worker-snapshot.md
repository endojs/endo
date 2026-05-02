# XS Worker Heap Snapshots

| | |
|---|---|
| **Created** | 2026-04-15 |
| **Author** | Kris Kowal (prompted) |
| **Updated** | 2026-04-15 |
| **Status** | In Progress |

## Motivation

Long-running Endo workers — agents, daemons-within-daemons,
persistent monitors — consume memory and supervisor slots even
when idle.
Today the only way to stop a worker is to cancel it, losing all
in-heap state.
Restarting requires re-evaluating the formula from scratch and
replaying any setup the guest performed.

XS has a built-in heap snapshot mechanism (`fxWriteSnapshot` /
`fxReadSnapshot`) that serializes the entire JS heap — objects,
closures, promise state, module bindings — into a compact binary
format.
A snapshot can be written to disk, the worker terminated, and
later a new machine can be created from the snapshot with the
heap in the exact state it was at snapshot time.

This enables **suspend/resume** for workers: suspend an idle
worker by snapshotting its heap and dropping the machine, then
transparently resume it when a message arrives.
The worker's CapTP session is never torn down from the
manager's perspective — it just sees latency.

### Use cases

- **Suspend idle agents.** An LLM agent that runs periodically
  can be suspended between runs, freeing memory and supervisor
  slots.
  It resumes transparently when a new message arrives.
- **Checkpoint long computations.** A worker performing a
  multi-step pipeline can checkpoint its state, allowing restart
  from the checkpoint on crash.

### Out of scope (future work)

- **Auto-suspend on idle timeout or memory pressure.**
  A future heuristic could trigger suspend automatically.
- **Fork workers via snapshot.**
  Restoring a snapshot multiple times would require forking the
  CapTP session, which is complex.
- **Distribute suspended workers across daemon instances.**
  CAS-stored snapshots could enable worker migration.
- **Time-travel debugging via periodic checkpoints.**
- **Snapshot formulas.**
  Snapshots are not user-visible formulas.
  They are an internal implementation detail of the worker
  lifecycle, stored in the CAS as opaque blobs.

## Background: XS Snapshot Mechanics

### What a snapshot captures

An XS snapshot is a complete image of the JS machine's heap:

- All slot heaps (objects, arrays, closures, scope chains)
- All chunk blocks (strings, ArrayBuffers, BigInts)
- The stack (but only preserved slots, not mid-call frames)
- The key/name/symbol tables
- Promise job queue state

The snapshot does **not** capture:

- Host function pointers (replaced with callback table indices)
- Host context pointers (`the->context`)
- Platform state (timers, I/O handles, file descriptors)
- Debug state

### Callback table binding

XS callbacks (host functions) are pointers to native code.
Snapshots replace these with indices into a callback array.
The array must have the same callbacks in the same order when
reading a snapshot as when writing it.

A **signature** string identifies the callback table version.
If the signature doesn't match, `fxReadSnapshot` fails.

The XS snapshot writer maintains a built-in table of ~497+
standard-library callbacks (`gxCallbacks` in `xsSnapshot.c`).
Platform-registered callbacks (from `define_function` or
`fxBuildHosts`) must be provided in a separate user-supplied
`callbacks` array.

### Constraints

1. `fxWriteSnapshot` must be called **outside** of XS callbacks
   and outside `xsBeginHost`/`xsEndHost` blocks.
   The machine must be quiescent — no running JS, no pending
   host entries.

2. The snapshot is bound to the XS version, architecture
   (32/64-bit, endianness), and callback table layout.

3. The worker must be idle: no pending CapTP calls, no
   outstanding promises from remote objects.

## Design

### Suspend/resume model

The snapshot is an **internal implementation detail** of the
worker lifecycle, not a user-visible formula.
From the manager's perspective, it has an open CapTP session
to a worker.
The worker may be suspended (no machine, snapshot in CAS) or
live (machine running).
The transition is transparent.

```
                    ┌─────────┐
     suspend()      │         │  message arrives
  ┌────────────────►│Suspended├──────────────────┐
  │  snapshot→CAS   │         │  CAS→restore      │
  │                 └─────────┘                    ▼
┌─┴──┐                                         ┌─────┐
│Live│◄────────────────────────────────────────│Live │
└────┘         resumed, message delivered       └─────┘
```

### `suspend()` on the worker controller

The supervisor exposes a `"suspend"` control verb.
When the manager (or any authorized peer) sends a suspend
request for a worker handle:

1. Supervisor sends `"suspend"` envelope to the worker.
   The payload is the CAS directory path (UTF-8).
2. Worker streams the snapshot to a temp file in the CAS
   directory via `Machine::suspend_to_cas()`, computing
   SHA-256 on the fly.
   The snapshot is never buffered in memory.
3. Worker renames the temp file to `{cas_dir}/{sha256_hex}`.
4. Worker sends `"suspended"` envelope back to the supervisor
   carrying only the SHA-256 hex digest (not the bytes).
5. Supervisor records the CAS hash as an **ephemeral GC
   root** and marks the handle as suspended.
   The inbox is removed; the worker thread exits.
6. Supervisor responds to the original requester with
   `"suspended"` confirmation.

If the worker is not idle (pending promises, mid-callback),
the suspend fails and the supervisor responds with an error.

### Transparent resume on message

When a message arrives for a suspended handle:

1. Supervisor detects the handle is suspended.
2. Spawns a new worker thread with a `"restore"` init
   envelope whose payload is the CAS file path (UTF-8).
3. The worker's startup path branches on the init verb:
   `"init"` for normal bootstrap, `"restore"` for file
   restore.
4. Worker opens the CAS file and streams the snapshot
   into `Machine::from_snapshot_file()` — the full snapshot
   is never buffered in memory.
5. The buffered message (and any subsequent ones) is
   delivered.
6. Supervisor removes the CAS ephemeral GC root.
   (CAS GC is not yet implemented, but the bookkeeping is
   set up correctly for when it arrives.)

### CAS storage

Snapshot blobs are stored in the content-addressable store
by SHA-256.
The Rust supervisor writes to the same directory layout as the
JS daemon's content store:
`{statePath}/store-sha256/{hex-digest}`.

The snapshot's SHA-256 hash is held as an ephemeral GC root
for as long as the worker is suspended.
When the worker resumes (or is cancelled), the root is
released.

### Envelope protocol

#### `suspend` (supervisor → worker)

| Field | Value |
|-------|-------|
| handle | 0 (control) |
| verb | `"suspend"` |
| payload | CAS directory path (UTF-8) |
| nonce | request nonce |

Tells the worker to quiesce and stream its snapshot to the
CAS directory.

#### `suspended` (worker → supervisor)

| Field | Value |
|-------|-------|
| handle | 0 (control) |
| verb | `"suspended"` |
| payload | SHA-256 hex digest (UTF-8) |
| nonce | matching nonce |

Worker's response after streaming the snapshot to CAS.
The worker exits after sending this.

#### `suspend-error` (worker → supervisor)

| Field | Value |
|-------|-------|
| handle | 0 (control) |
| verb | `"suspend-error"` |
| payload | error message (UTF-8) |
| nonce | matching nonce |

Worker cannot suspend (not idle, snapshot write failed).

#### `restore` (supervisor → worker, init variant)

| Field | Value |
|-------|-------|
| handle | parent handle |
| verb | `"restore"` |
| payload | CAS file path (UTF-8) |
| nonce | 0 |

Sent as the init envelope to a new worker thread to indicate
it should stream-restore from the CAS file rather than
bootstrap normally.

### Callback table management

The worker's host functions (registered via `define_function`)
must be in the snapshot callback table.
The table is append-only: new functions are added at the end,
existing indices never change.

For suspend/resume of the same worker, the callback table is
identical (same binary, same registration order).
Cross-version compatibility requires a signature change when
the table changes.

## Implementation phases

### Phase 1: Rust snapshot FFI and Machine API **(complete)**

1. `XsSnapshot` struct in `ffi.rs`. **(done)**
2. `fxWriteSnapshot` and `fxReadSnapshot` FFI declarations.
   **(done)**
3. `Machine::write_snapshot()` with in-memory buffer.
   **(done)**
4. `Machine::from_snapshot()`. **(done)**
5. `SnapshotError` type. **(done)**
6. **Tests:** 6 round-trip tests, all passing:
   - `snapshot_round_trip_integer`
   - `snapshot_round_trip_string`
   - `snapshot_round_trip_object`
   - `snapshot_round_trip_closure`
   - `snapshot_signature_mismatch_fails`
   - `snapshot_with_host_function`

#### Resolved: unknown callback table

The initial implementation used a prebuilt `libxs.a` compiled
from a different XS version than the snapshot code's built-in
`gxCallbacks` table.
Compiling XS from source (`c/moddable/xs/sources/`) resolved
the mismatch.

### Phase 2: Supervisor suspend/resume **(in progress)**

1. `SuspendedWorker` struct in `supervisor.rs` — tracks
   suspended handles with snapshot bytes, SHA-256 hash, and
   worker info. **(done)**
2. `mark_suspended()`, `is_suspended()`, `take_suspended()`
   methods on `Supervisor`. **(done)**
3. `RoutingCallbacks` with `on_resume` — `route_message`
   detects suspended handles and delegates to a resume
   callback. **(done)**
4. Handle `"suspend"` control verb in `endo.rs` — forwards
   to target worker. **(done)**
5. Handle `"suspended"` control verb in `endo.rs` — computes
   SHA-256, calls `mark_suspended`. **(done)**
6. Handle `"suspend"` envelope in the worker event loop
   (`lib.rs`) — `handle_suspend()` writes snapshot, sends
   bytes via `"suspended"` envelope, returns
   `EnvelopeAction::Suspend` to exit the loop. **(done)**
7. `Machine::suspend()` / `Machine::resume()` convenience
   API. **(done)**
8. `SuspendData` struct bundling snapshot + callbacks +
   signature. **(done)**
9. `worker_snapshot_callbacks()` — deterministic callback
   table for snapshot read/write. **(done)**
10. `InitResult::Restore` variant in `worker_io.rs` — worker
    startup branches on init verb. **(done)**
11. `run_xs_worker_inproc()` entry point for in-process
    workers (fresh and restored). **(done)**
12. `handle_resume()` in `endo.rs` — re-registers handle,
    builds channel transport, seeds "restore" init + pending
    message, spawns bridges and machine thread. **(done)**
13. **Tests:** 3 suspend/resume unit tests passing:
    - `suspend_resume_preserves_state`
    - `suspend_resume_with_host_function`
    - `suspend_resume_multiple_cycles`

#### Remaining

- Integration test: full supervisor round-trip (suspend via
  control verb → worker streams snapshot to CAS → worker
  exits → message triggers resume → restored worker has
  correct JS state).
- Ephemeral GC root bookkeeping for CAS-stored snapshots.

### Phase 3: Future enhancements

- Auto-suspend on idle timeout.
- CAS GC integration (ephemeral roots).
- Filesystem CAS matching the JS daemon's directory layout.
- Cross-version snapshot compatibility.

## Design decisions

1. **Snapshot is an internal implementation detail.**
   No snapshot formulas, no user-visible snapshot objects.
   The manager sees a continuous CapTP session.

2. **Suspend only when idle.**
   The worker must have no pending CapTP calls or outstanding
   promises.
   This avoids the CapTP reconnection problem entirely.

3. **Transparent resume on message.**
   The supervisor adapter detects messages to suspended
   handles and restores the worker before delivery.
   The manager doesn't need to know about suspension.

4. **CAS storage with ephemeral GC roots.**
   Snapshot blobs go into the content store.
   An ephemeral GC root prevents collection while the worker
   is suspended.
   CAS GC is not yet implemented, but the bookkeeping is
   correct.

5. **Streaming snapshot to CAS, not in-memory.**
   The worker streams snapshot chunks directly to a temp file
   in the CAS directory, computing SHA-256 on the fly.
   Only the hash transits the envelope bus.
   On resume, the worker streams from the CAS file.
   The full snapshot is never buffered in memory.

6. **Callback table is append-only.**
   New host functions are always appended.
   The signature changes when the table changes.

## Prompt

> Please design (in designs/) a feature for capturing a snapshot
> of a worker and restoring a worker from a snapshot.  This will
> not likely not be directly usable to the daemon because
> restoring a snapshot requires the host process to restore the
> state of any connectivity through captp to live objects, which
> have likely been disincarnated, and the daemon deliberately
> restarts workers from durable persistence to avoid dealing with
> severence over live captp connections.  But, that might not be
> the case and it might be reasonable to obligate the worker to
> sense and recover from loss of ephemeral connectivity and
> procede from the latest incarnation of any capabilities it
> received for which there are locators.  As such, a snapshot
> would need to produce a formula that retains the dependent
> formulas as well as the xsnap version needed to run the
> program.  After completing the design, hazard guesses for any
> open questions and make a preliminary implementation and tests.
> Run until tests pass or an impasse in the design is met.  The
> purpose of this feature would be to put some kinds of long
> running workflows to sleep and restoring them from heap state
> instead of durable persistence when possible.

### Revised scope (discussion 2026-04-15)

The design was revised based on discussion:
- Snapshots are not formulas — they are internal to worker
  lifecycle.
- `suspend()` on the worker controller drops a snapshot into the
  CAS and resumes transparently when a message arrives.
- Forking workers (restoring a snapshot multiple times) requires
  forking CapTP sessions — out of scope.
- Time-travel debugging via snapshots — out of scope.
- Auto-suspend on idle/memory pressure — future work.
- CAS GC not yet implemented; ephemeral roots are bookkeeping
  for future integration.

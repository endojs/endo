# Endor: Rust Daemon Architecture

| | |
|---|---|
| **Created** | 2026-04-16 |
| **Updated** | 2026-04-16 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Active |

## Overview

`endor` is the unified Rust binary for the Endo daemon.
It replaces the Node.js-only daemon with a native supervisor
that routes messages between workers running on multiple
platforms: XS separate (child process), XS shared
(in-process), and Node.js (child process).
The manager (initial peer) always runs in the same process
as the supervisor message bus; additional workers may run
on any supported platform.
The binary serves multiple roles via subcommands: daemon,
worker, and standalone archive runner.

The implementation lives in two crates:

- **`endo`** (`rust/endo/`) — Daemon process: supervisor,
  routing, process management, socket listener.
- **`xsnap`** (`rust/endo/xsnap/`) — XS engine bindings:
  machine lifecycle, host powers, envelope dispatch, snapshot
  I/O.

## Binary entry point

`rust/endo/src/bin/endor.rs` dispatches subcommands:

| Subcommand | Role |
|---|---|
| `endor daemon` | Foreground daemon (capability bus) |
| `endor start` | Spawn detached daemon |
| `endor stop` | Graceful shutdown via SIGINT |
| `endor ping` | Liveness check |
| `endor worker [-e xs]` | Supervised XS worker child |
| `endor run [-e xs] <archive>` | Standalone archive runner |

The `-e <engine>` flag selects the execution engine for the
`worker` and `run` subcommands (currently only XS is wired).
Worker platform selection for daemon-spawned workers is
handled by the `spawn` control verb, not command-line flags
(see Worker platforms).
The daemon spawns a tokio runtime with configurable worker
threads (`ENDO_WORKER_THREADS`, default 4).

## Endo crate modules

| Module | Responsibility |
|---|---|
| `supervisor` | Handle allocation, inbox routing, suspend/resume state |
| `endo` | Daemon lifecycle, manager hosting, control verb dispatch |
| `inproc` | Shared (in-process) XS peers on machine runner threads |
| `proc` | Separate (child process) spawning with fd 3/4 pipes |
| `socket` | Unix socket listener, netstring client bridging |
| `codec` | CBOR frame/envelope encoding and decoding |
| `engine` | Worker platform resolution and spawn dispatch |
| `mailbox` | Async-safe message queue (tokio mpsc) |
| `paths` | XDG / macOS path resolution |
| `pidfile` | PID file management |
| `types` | Handle, Envelope, Message, WorkerInfo |
| `error` | EndoError enum |

## Core types

```
Handle = i64
  0 = daemon (capability bus, control messages)
  1+ = allocated sequentially by the supervisor

Envelope { handle, verb, payload, nonce }
  CBOR 4-element array on the wire: [i64, text, bytes, i64]

Message { from, to, envelope, response_tx }
  Internal routing wrapper — adds sender/receiver handles
  and an optional oneshot channel for sync responses.

WorkerInfo { handle, platform, cmd, args, pid, started }
  Metadata for a registered worker.
  `platform` is "separate", "shared", or "node".
```

## Supervisor

The supervisor (`supervisor.rs`) is the central routing hub.
One instance per daemon, wrapped in `Arc<Supervisor>`.

### State

- **Inboxes** — `RwLock<HashMap<Handle, Mailbox>>`
  Per-handle async message queues (tokio unbounded mpsc).
- **Workers** — `RwLock<HashMap<Handle, WorkerInfo>>`
  Metadata for registered workers.
- **Parents** — `RwLock<HashMap<Handle, Handle>>`
  Ownership hierarchy for blocking-call authorization.
- **Suspended** — `RwLock<HashMap<Handle, SuspendedWorker>>`
  Workers whose XS machine has been dropped; snapshot stored
  in CAS.
  Contains only the SHA-256 hash and CAS directory path, not
  the snapshot bytes.
- **Pending syncs** — `Mutex<HashMap<(Handle, i64), Handle>>`
  Nonce-tracked synchronous calls; maps (caller, nonce) to
  callee.
- **Outbox** — `Mutex<Option<Mailbox>>`
  Single output queue consumed by the routing task.

### Routing loop

`start_routing(sup, outbox_rx, callbacks)` spawns a tokio
task that continuously polls the outbox and routes each
message:

1. **Control** (to=0) — delegate to `on_control` callback.
2. **Suspended target** — delegate to `on_resume` callback,
   which restores the worker and delivers the pending message.
3. **Sync call** (nonce > 0, from ≠ 0) — check
   `can_block(caller, callee)` via the parent chain.
   If not authorized, drop the message silently.
   Otherwise record in `pending_syncs`.
4. **Normal delivery** — look up inbox, deliver.

### Blocking-call authorization

A caller can block on a callee only if the callee is an
ancestor of the caller in the parent tree (or the callee is
handle 0).
This prevents deadlocks: a parent can call into a child
synchronously, but a child cannot block its parent.

## Daemon lifecycle

`Endo::start()`:
1. Resolve paths (XDG / macOS conventions, env overrides).
2. Create state, ephemeral, cache directories.
3. Write PID file.
4. Create supervisor and outbox receiver.

`Endo::serve()`:
1. Install supervisor routing with control and resume
   callbacks.
2. Host the manager:
   - **InProcessXs** (default) — machine runner thread,
     channel transport.
   - **NodeChild** (`ENDO_MANAGER_NODE=1`) — Node.js child
     process, fd 3/4 pipes.
3. Wait for the Unix socket to become connectable (10 s
   timeout).
4. Block until SIGINT, SIGTERM, or manager exit.

`Endo::stop()`:
1. Signal supervisor to close outbox (drain routing task).
2. Wait up to 5 s for the routing task.
3. Remove PID file.

## Control verbs

The daemon handles these control verbs (to=0):

| Verb | Payload | Response | Description |
|---|---|---|---|
| `ready` | — | — | Manager startup acknowledgement |
| `listen-path` | CBOR `{path}` | `listening-path` | Bind Unix socket listener |
| `spawn` | CBOR `{platform, ...}` | `spawned` + handle | Spawn worker (see Worker platforms) |
| `list` | — | `workers` + list | Enumerate registered workers |
| `suspend` | CBOR `{handle}` | forwarded to worker | Initiate worker suspension |
| `suspended` | SHA-256 hex | — | Worker confirms snapshot written to CAS |

## Manager hosting

The manager is the first peer spawned by the daemon and
always runs in the same process as the supervisor message
bus — on a machine runner thread with a channel transport.
This is a hard requirement, not a platform preference:
the manager must be co-resident with the supervisor so that
bootstrap completes without depending on an external process
and so that the daemon binary is self-contained.
A Node.js child process mode exists only for legacy
compatibility (`ENDO_MANAGER_NODE=1`).

Unlike worker platforms, the manager's hosting mode is not
caller-selectable — it is a daemon configuration choice.

### In-process XS (`inproc.rs`)

`spawn_inproc_xs_manager`:
1. Set env vars (`ENDO_SOCK_PATH`, `ENDO_STATE_PATH`, etc.).
2. Delegate to `spawn_shared_xs_peer` with the manager
   bootstrap bundle and a shutdown notify.
3. Manager is placed on a machine runner thread.
4. Manager exit triggers daemon shutdown via `Notify`.

### Node.js child (`proc.rs`)

`spawn_node_daemon` (legacy, `ENDO_MANAGER_NODE=1`):
1. Spawn Node.js with args: script path, sock path, state
   path, ephemeral path, cache path.
2. Wire fd 3/4 for envelope I/O via `spawn_with_pipes`.
3. Async read/write tasks bridge supervisor ↔ child.
4. Child exit triggers daemon shutdown.

## Worker platforms

The daemon supports multiple worker platforms, selected by the
`platform` field in the spawn payload.
The manager JS sends a spawn request with its desired platform;
the Rust daemon resolves and dispatches it.

### Spawn payload

```
CBOR map {
  "platform": text,    // "separate" | "shared" | "node"
  "command":  text,    // (separate/node only) executable
  "args":     [text],  // (separate/node only) arguments
}
```

When `platform` is omitted, the daemon treats it as
`"separate"` for backward compatibility.

### Platform resolution (`engine.rs`)

| Requested | Resolved to | Condition |
|---|---|---|
| `"separate"` (default) | XS child process | Always available |
| `"shared"` | XS in supervisor process | XS linked into binary |
| `"shared"` | XS child process (downgrade) | XS not linked (graceful fallback) |
| `"node"` | Node.js child process | `NODE_BIN` env or `node` on PATH |
| `"node"` | Error | No Node.js binary found |

**Separate** is the default and preferred mode.
Each worker runs in its own OS process, providing fault
isolation: a crash or OOM in one worker cannot take down
other workers or the supervisor.
The manager JS selects the executable via `ENDO_WORKER_BIN`
(defaults to `endor worker`).

**Shared** runs an XS machine inside the supervisor process,
sharing its thread pool.
XS `Machine` is `!Send + !Sync`, so each machine is pinned
to a single OS thread for its lifetime — but the daemon
does not create a new thread per machine.
Instead, the daemon maintains a pool of **machine runner
threads** (one per CPU core by default, configurable via
`ENDO_MACHINE_THREADS`).
Each runner thread hosts an event loop that drives one or
more XS machines cooperatively:

```
loop {
    for machine in ready_machines:
        envelope = try_recv(machine.inbox)
        if envelope:
            dispatch(machine, envelope)
            run_promise_jobs(machine)
    park until any inbox has data
}
```

Machines yield at envelope boundaries — the JS execution
within a single `dispatch` + `run_promise_jobs` cycle runs
to completion before the runner moves to the next machine.
This is cooperative, not preemptive: a long-running JS
computation blocks all machines on the same runner thread.

The manager always runs on a machine runner thread.
When additional shared workers are spawned, they are assigned
to runner threads round-robin (or by least-loaded
heuristic).

Advantages over separate workers:
- No process-spawn overhead.
- No pipe I/O serialization — envelopes pass through
  in-memory channels.
- Lower per-worker memory footprint (shared address space,
  no duplicate XS runtime image).

Trade-offs:
- No fault isolation — a crash or OOM in any shared machine
  takes down the supervisor and all co-resident machines.
- Cooperative scheduling — a CPU-bound JS computation
  starves sibling machines on the same runner thread.

If the binary was built without XS support (e.g., a
separate-only distribution), the daemon transparently
downgrades to a child process.
The caller should not rely on shared semantics for
correctness — it is a performance hint.

**Node** spawns a Node.js child process using the binary at
`NODE_BIN` (env var) or `node` (PATH lookup).
This is required for unconfined caplets that depend on
Node.js APIs.
If no Node.js binary is available, the spawn fails with an
error response — there is no silent downgrade, because
Node.js caplets would not function in XS.

### Engine enum

```rust
enum Engine {
    /// XS child process with fd 3/4 pipes.
    Separate { command: String, args: Vec<String> },
    /// XS machine on a shared runner thread in the
    /// supervisor process.
    Shared {
        bootstrap: &'static str,
        creation: &'static XsCreation,
        label: &'static str,
    },
}
```

`engine_for_spawn_request()` maps the spawn payload's
`platform` field to an `Engine` variant, applying the
resolution rules above.

### Separate spawning (`proc.rs`)

`spawn_process`:
1. Allocate handle.
2. `spawn_with_pipes` creates two OS pipes, `pre_exec` dups
   them to fds 3 (write) and 4 (read) in the child.
3. `wire_worker_tasks` sends init envelope, then spawns:
   - **Read task**: async read from fd 4 → decode envelope →
     `sup.deliver()`.
   - **Write task**: inbox → encode envelope → async write to
     fd 3.
   - **Wait task**: await child exit → deliver `"exited"` to
     parent → unregister.
4. Set parent relationship for blocking-call authorization.

### Shared spawning (`inproc.rs`)

`spawn_shared_xs_peer`:
1. Allocate handle, register inbox.
2. Select a runner thread (round-robin or least-loaded).
3. Send a `RunMachine` request to the runner, carrying:
   - The machine's inbox receiver.
   - Bootstrap bundle and creation parameters.
   - Pre-seeded `"init"` envelope with parent handle.
4. The runner thread creates the `Machine`, bootstraps it,
   and adds it to its local event loop.
5. Worker exit unregisters handle; does **not** trigger
   daemon shutdown (unlike the manager).

### Machine runner threads

The daemon spawns a fixed pool of runner threads at startup
(`ENDO_MACHINE_THREADS`, default = number of CPUs).
Each runner thread:

1. Owns a set of XS `Machine` instances (pinned, `!Send`).
2. Runs a blocking event loop that polls all machine inboxes
   (via `std::sync::mpsc`).
3. Dispatches envelopes to the target machine, runs promise
   jobs, flushes outbound frames.
4. Accepts new machines via a control channel from the tokio
   side.

The tokio async runtime and the machine runner pool are
separate: tokio handles I/O (pipes, sockets, signals) and
the supervisor routing loop, while runner threads handle
synchronous XS execution.
Bridges between the two are the same
inbox → channel / channel → `sup.deliver()` pattern used
today, except multiple machines share each runner thread.

Both separate and shared workers speak byte-identical
CBOR envelopes.
The supervisor routing layer is transport-agnostic.

### JavaScript interface implications

Platform selection flows through several layers of the
manager JS before reaching the Rust daemon's spawn verb.

#### Worker formula

The persisted worker formula gains a `platform` field:

```js
/** @typedef {'separate' | 'shared' | 'node'} WorkerPlatform */

/** @typedef {object} WorkerFormula
 *  @property {'worker'} type
 *  @property {string} [label]
 *  @property {WorkerPlatform} [platform]
 *  @property {string[]} [trustedShims]
 */
```

When `platform` is absent the daemon defaults to
`"separate"`.
Existing formulas without the field continue to work
unchanged.

The previous `kind: 'locked' | 'node'` field is superseded.
`'locked'` maps to `"separate"` (or `"shared"` when
explicitly requested); `'node'` maps to `"node"`.

#### `provideWorker`

`provideWorker(petNamePath)` currently creates a default
worker with no platform preference.
It gains an optional second argument:

```js
provideWorker(
  petNamePath,
  { platform: 'shared' }  // optional
)
```

The options record is validated by the interface guard:

```js
const WorkerOptionsShape = M.splitRecord(
  {},
  { platform: M.or(
      M.literal('separate'),
      M.literal('shared'),
      M.literal('node'),
    ),
  },
);

// In HostInterface:
provideWorker: M.call(NameOrPathShape)
  .optional(WorkerOptionsShape)
  .returns(M.promise()),
```

When the option is provided, the formulated worker formula
includes the `platform` field.
When omitted, the formula has no `platform` and the daemon
defaults to `"separate"`.

#### `MakeCapletOptionsShape`

`makeUnconfined` and `makeBundle` accept options that
control worker creation when a new worker is needed.
The options record gains `workerPlatform`:

```js
const MakeCapletOptionsShape = M.splitRecord(
  {},
  {
    powersName: NameShape,
    resultName: NameOrPathShape,
    env: EnvShape,
    workerTrustedShims: M.arrayOf(M.string()),
    workerPlatform: M.or(
      M.literal('separate'),
      M.literal('shared'),
      M.literal('node'),
    ),
  },
);
```

When `workerPlatform` is `'node'`, the caplet is formulated
with a Node.js worker regardless of the default.
When `workerPlatform` is `'shared'`, the formula requests
an in-process XS worker (with graceful downgrade).
When absent, the default (`"separate"`) applies.

#### `makeWorker` (control powers)

The internal `makeWorker` function — which sends the `spawn`
control verb to the Rust daemon — receives the resolved
platform from the formula.
It constructs the spawn payload accordingly:

- **`"separate"`**: Uses `ENDO_WORKER_BIN` to determine
  command and args.
  Sends `{platform: "separate", command, args}`.
- **`"shared"`**: Sends `{platform: "shared"}`.
  No command or args — the daemon uses the built-in XS
  worker bootstrap and creation parameters.
- **`"node"`**: Uses `ENDO_NODE_WORKER_BIN` or `NODE_BIN`
  to determine command and args.
  Sends `{platform: "node", command, args}`.

This moves the platform-dispatch decision from the manager
JS (where it currently lives as `kind`-based command
selection) into the Rust daemon, which has direct knowledge
of what platforms are available.

#### `encodeSpawnPayload`

The CBOR encoder for spawn payloads adds the `platform`
key:

```js
const encodeSpawnPayload = (platform, command, args) => {
  // CBOR map with 3 entries:
  //   "platform": text
  //   "command":  text
  //   "args":     [text]
  // For "shared", command/args are omitted (map size = 1).
};
```

#### `defaultWorkerKind` → `defaultPlatform`

The daemon bootstrap currently accepts
`defaultWorkerKind = 'node'` to control the default
platform for workers created without an explicit kind.
This parameter is renamed to `defaultPlatform` and accepts
the new platform values:

```js
defaultPlatform = 'separate'  // was defaultWorkerKind = 'node'
```

When running under the Rust supervisor, `defaultPlatform`
is `'separate'`.
The legacy Node.js daemon (if still used) would set
`defaultPlatform = 'node'`.

#### Summary of renames

| Old | New | Notes |
|---|---|---|
| `kind: 'locked'` | `platform: 'separate'` | Default; XS child process |
| `kind: 'locked'` | `platform: 'shared'` | Explicit request for in-process |
| `kind: 'node'` | `platform: 'node'` | Node.js child process |
| `defaultWorkerKind` | `defaultPlatform` | Bootstrap parameter |
| `workerKind` | `workerPlatform` | Caplet options field |

## Client bridging (`socket.rs`)

`start_socket_listener`:
1. Bind `UnixListener` on the socket path.
2. For each connection: allocate handle, register inbox.
3. Send `"connect"` envelope to daemon.
4. **Read task**: read netstring frame from client → wrap as
   `"deliver"` envelope → `sup.deliver()`.
5. **Write task**: inbox → extract `"deliver"` payload → write
   netstring to client.

Netstring codec: `<length>:<data>,` (e.g., `13:hello world!,`).

## Wire format

The envelope wire format is CBOR throughout.

**Frame**: CBOR byte-string wrapping an encoded envelope
(max 16 MiB).

**Envelope**: 4-element CBOR array:
`[handle: int, verb: text, payload: bytes, nonce: int]`.

Nonce semantics:
- 0 = fire-and-forget.
- Positive = synchronous call (response carries same nonce).

Control verb payloads are CBOR maps (`listen-path`, `spawn`,
`suspend`).
Legacy exception: none remaining — all control verbs now use
CBOR.

## Suspend / resume

Workers can be suspended to free memory while preserving
their JS heap state.
The snapshot is streamed to the content-addressable store
(CAS) and restored on demand.
See `designs/daemon-xs-worker-snapshot.md` for the full
design.

### Suspend flow

1. Daemon sends `"suspend"` to worker with CAS dir path.
2. Worker calls `Machine::suspend_to_cas()`:
   - Opens temp file in CAS directory.
   - Streams XS snapshot chunks via `fxWriteSnapshot`
     callback, computing SHA-256 on the fly.
   - Renames temp file to `{cas_dir}/{sha256}`.
3. Worker sends `"suspended"` with SHA-256 hex digest.
4. Daemon records `(sha256, cas_dir)` in `SuspendedWorker`,
   removes inbox.
   Worker thread exits.

### Resume flow

1. Message arrives for a suspended handle.
2. `route_message` calls `on_resume`.
3. `handle_resume` re-registers the handle, creates channel
   transport, pre-seeds `"restore"` init with CAS file path,
   spawns machine thread.
4. Worker calls `Machine::from_snapshot_file()`, streaming
   from disk.
5. Pending message delivered after restore.

The full snapshot never resides in memory — it streams
through the XS write/read callbacks directly to/from disk.

## xsnap crate

### Machine API

`Machine` wraps `xsMachine*` with RAII drop.
Not `Send` or `Sync` — each worker gets its own machine on a
dedicated thread.

| Method | Description |
|---|---|
| `new(creation, name)` | Create fresh machine |
| `eval(source)` | Evaluate JS, return `JsValue` |
| `run_promise_jobs()` | Drain microtask queue once |
| `quiesce()` | Drain until no pending jobs |
| `run_loop()` | Full event loop (promises + timers) |
| `define_function(name, cb, argc)` | Register host function |
| `register_powers(ptr)` | Install fs/crypto/module/sqlite callbacks |
| `register_worker_io()` | Install envelope I/O callbacks |
| `write_snapshot(sig, cbs)` | In-memory snapshot |
| `from_snapshot(data, name, sig, cbs)` | Restore from bytes |
| `suspend_to_cas(sig, cas_dir)` | Stream snapshot to CAS |
| `resume_from_cas(dir, hash, name, sig, cbs)` | Stream restore from CAS |

### Unified runner

`run_xs_program(program, creation, label, transport)` encodes
the four modes:

| Program | Transport | Mode |
|---|---|---|
| Bundle | Some | Supervised peer (worker or manager) |
| Archive | Some | Supervised archive (future) |
| Archive | None | Standalone (`endor run`) |
| Bundle | None | Standalone bundle |

Bootstrap sequence (fresh machine):
1. Ensure XS shared cluster initialized.
2. Install transport, init handshake.
3. Create machine (or restore from snapshot file).
4. Register worker I/O host functions.
5. Set machine context pointer for host powers.
6. Eval host aliases, native TextEncoder/Decoder.
7. Bootstrap SES (polyfills → lockdown →
   HandledPromise shim).
8. Install native Base64 binding.
9. Eval program (bundle IIFE or compartment-map archive).

Restored machines skip steps 4 and 6–9 — the snapshot
already contains all globals.
Only the context pointer (step 5) is re-established.

### Supervised main loop

```
loop {
    frame = transport.recv_raw_envelope()  // block
    handle_envelope(machine, frame)        // dispatch to JS
    loop {                                 // reactive pump
        run_promise_jobs()
        drain non-blocking envelopes
        flush debug outbound
        if no pending jobs: break
        yield 1 ms
    }
    if __shouldTerminate(): break
}
```

`handle_envelope` intercepts control verbs (`debug-attach`,
`debug-detach`, `debug`, `suspend`) before dispatching to
the JS `handleCommand(Uint8Array)` global.

### Transport abstraction

`WorkerTransport` trait (Send):

| Method | Description |
|---|---|
| `init_handshake()` | Consume init envelope → `InitResult` |
| `recv_raw_envelope()` | Blocking receive |
| `try_recv_raw_envelope()` | Non-blocking receive |
| `send_raw_frame(data)` | Send raw CBOR bytes |
| `send_frame(payload)` | Wrap in deliver envelope |
| `daemon_handle()` | Parent handle from init |

Two implementations:
- **PipeTransport** — fd 3 (write) / fd 4 (read), used by
  child-process workers.
- **ChannelTransport** — `std::sync::mpsc`, used by
  in-process workers.
  Pre-seeded init (no handshake roundtrip).

Both speak byte-identical CBOR.
The supervisor is transport-agnostic.

### Host powers

Registered via `Machine::register_powers()`.
The `HostPowers` struct (stored in the machine context
pointer) holds cap-std directory capabilities and
pre-populated module sources.

| Module | Functions | Description |
|---|---|---|
| `fs` | 19 | File I/O: read, write, readDir, mkdir, remove, rename, exists, isDir, symlink, etc. |
| `crypto` | 8 | SHA-256 (streaming), random, Ed25519 keygen/sign |
| `modules` | 2 | Dynamic import hook, specifier resolution |
| `process` | 4 | getPid, getEnv, joinPath, realPath |
| `sqlite` | 9 | Database open/close, prepare/run/get/all/columns/finalize |
| `debug` | — | Debug protocol I/O buffers (not registered as host functions) |

Worker I/O adds 13 host functions: recvFrame, sendFrame,
getDaemonHandle, issueCommand, sendRawFrame, importArchive,
trace, getPendingEnvelope, encode/decodeUtf8,
base64Encode/Decode, debugPoll.

### Embedded JS bundles

Five JavaScript files included via `include_str!()`:

| File | Purpose |
|---|---|
| `polyfills.js` | harden, assert, TextEncoder stubs |
| `host_aliases.js` | `globalThis.host*` → unprefixed names |
| `ses_boot.js` | SES lockdown + HandledPromise shim |
| `worker_bootstrap.js` | Worker: bus-xs-core + single CapTP session |
| `daemon_bootstrap.js` | Manager: multiplexed CapTP sessions |

### CESU-8

XS stores strings in CESU-8 (surrogate-pair encoding for
supplementary characters).
`cesu8.rs` provides encode/decode between UTF-8 and CESU-8.
Fast path: if no 4-byte UTF-8 sequences, CESU-8 == UTF-8.

### Archive support

`archive.rs` loads `@endo/compartment-mapper` zip archives:
parses `compartment-map.json`, loads module sources by
compartment, creates XS Compartments, and imports the entry
module.

### Build system

`build.rs` compiles XS from C source
(`c/moddable/xs/sources/`) with these key flags:

- `mxSnapshot` — Enable snapshot read/write.
- `mxCESU8` — Internal CESU-8 strings.
- `mxCanonicalNaN` — Deterministic NaN bit patterns.
- `mxLockdown`, `mxMetering` — SES lockdown support.
- `mxDebug` — Debugger (gated by cargo feature `debug`).
- `mxStringInfoCacheLength=4` — LRU cache for string
  indexing.

Falls back to prebuilt `libxs.a` if sources are absent.

## Path resolution

`paths.rs` resolves daemon paths using environment variables
or platform defaults:

| Path | Env override | macOS default | Linux default |
|---|---|---|---|
| State | `ENDO_STATE_PATH` | ~/Library/Application Support/Endo | $XDG_STATE_HOME/endo |
| Ephemeral | `ENDO_EPHEMERAL_STATE_PATH` | (same as state) | $XDG_RUNTIME_DIR/endo |
| Socket | `ENDO_SOCK_PATH` | {ephemeral}/captp0.sock | {ephemeral}/captp0.sock |
| Cache | `ENDO_CACHE_PATH` | ~/Library/Caches/Endo | $XDG_CACHE_HOME/endo |

## Dependencies

### endo crate

| Dependency | Purpose |
|---|---|
| `libc` | Process management (pre_exec, pipe) |
| `tokio` | Async runtime, signals, process, I/O |
| `xsnap` | XS engine bindings (path dependency) |

### xsnap crate

| Dependency | Purpose |
|---|---|
| `cap-std`, `cap-tempfile` | Capability-safe filesystem |
| `sha2` | SHA-256 for snapshots and crypto powers |
| `rand` | Random number generation |
| `ed25519-dalek` | Ed25519 signatures |
| `hex` | Hex encoding |
| `zip` | Archive (compartment-map) loading |
| `serde`, `serde_json` | JSON for SQLite FFI layer |
| `base64` | Base64 codec |
| `rusqlite` (bundled) | SQLite database |
| `cc` (build) | C compiler driver for XS |

## Related designs

| Design | Relationship |
|---|---|
| [daemon-capability-bus](daemon-capability-bus.md) | Protocol specification that endor implements |
| [daemon-xs-worker-snapshot](daemon-xs-worker-snapshot.md) | Suspend/resume feature design |
| [daemon-xs-worker-debugger](daemon-xs-worker-debugger.md) | XS debugger protocol |
| [daemon-endo-rust-sqlite](daemon-endo-rust-sqlite.md) | SQLite host function design |

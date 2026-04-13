# Capability Bus: The Endo Daemon as Message Router

| | |
|---|---|
| **Created** | 2026-02-25 |
| **Updated** | 2026-04-11 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## Status

The capability bus protocol and its daemon implementations are
functional. The Go daemon (`endo-daemon-go`) and Rust daemon
(`endor`) both pass the full daemon test suite with parity to the
Node.js-only path. The Rust daemon and the native Rust/XS worker
live in the same binary: `endor` dispatches to daemon, manager child,
worker, or standalone archive runner by subcommand.

### Terminology

In this document, the **daemon** is the long-running top-level
process that owns the PID file and Unix socket, routes envelopes
between its children, and enforces the sync-call spawn tree — the
daemon *is* the capability bus. It runs no JavaScript itself.

The **manager** is the privileged child of the daemon that
bootstraps the pet-name store, formula graph, host agent, and CapTP
multiplexer. Historically this role was played exclusively by the
Node.js script `bus-daemon-node.js`; today it can also be played by
an XS-hosted bundle running inside `endor manager -e xs`. The name
"manager" reflects that this child *manages* the pet-name and
formula graph state on behalf of the daemon and its workers.

Key files:
- `packages/daemon/src/bus-daemon-node.js` — Node.js manager entry
  point (the "bus" prefix refers to the capability bus protocol
  these files participate in, not to a child named "bus")
- `packages/daemon/src/bus-daemon-node-powers.js` — manager powers
  (worker spawning, envelope demux)
- `packages/daemon/src/bus-daemon-rust-xs.js` — XS manager bootstrap
  (runs inside the Rust `endor manager` binary)
- `packages/daemon/src/bus-worker-node.js` — Node.js worker entry point
- `packages/daemon/src/bus-worker-node-powers.js` — worker powers
  (envelope reader/writer)
- `packages/daemon/src/bus-worker-xs.js` — XS worker bootstrap
- `packages/daemon/src/envelope.js` — CBOR envelope codec
- `go/endo/` — Go daemon implementation
- `rust/endo/` — Rust daemon implementation (crate `endo`, binary `endor`)
- `rust/endo/xsnap/` — xsnap library (Rust bindings for XS)

The bus modules were originally duplicated per daemon language
(`daemon-go.js`, `daemon-rust.js`, etc.) and have been unified into a
single `bus-` prefixed set, since the capability bus protocol is
language-agnostic. The `bus-` file prefix denotes participation in
the protocol, not a role; the daemon *is* the bus, and these files
describe the wire format that the manager, workers, and the daemon
all speak.

## What is the Problem Being Solved?

The Endo daemon is currently a Node.js process that supervises Node.js
worker processes. This architecture couples the supervisor to Node.js
for both control and I/O. As the daemon grows to serve more diverse
workloads — web extensions, native plugins, AI agent sandboxes — the
supervisor itself becomes a bottleneck and a liability: Node.js is
single-threaded, its process management is limited, and it cannot easily
provide OS-level isolation primitives.

An external supervisor process provides:

1. **Process supervision with OS-level control**: Managing a tree of
   heterogeneous subprocesses with proper signal handling and resource
   limits.
2. **A message-passing substrate**: A handle-based envelope protocol
   can route messages between peers without requiring all workers to be
   Node.js processes.
3. **A path to richer platform services**: The supervisor can
   progressively assume I/O responsibilities (filesystem, networking,
   crypto) currently handled by Node.js, offering them as "syscalls" to
   confined workers.
4. **Decoupling from Node.js runtime concerns**: SES lockdown, V8
   quirks, and npm dependency management stay inside workers where they
   belong — not in the supervisor.

The key constraint is **incrementalism**: the existing Node.js daemon
must continue to work unmodified under `endo start`. The bus supervisor
is an alternative that hosts the daemon as a subprocess and manages all
workers as peers.

### Current architecture

```
endo (CLI) ──► node daemon ──►* node worker
```

### Target architecture (this design)

```
                         ┌─► node manager  (or xs manager)
endo (CLI) ──► daemon ───┤
                         └─►* worker (node or xs)
```

All workers are children of the daemon (the capability bus), not of
the manager. The manager requests worker creation through the
envelope protocol; the daemon spawns them as peer subprocesses and
routes messages between manager and workers.

### Future architecture (out of scope)

```
endo (CLI) ─┐
daemon ──────┼─► node manager
              ├─►* node worker
              ├─►* xs worker
              ├─►* wasm worker
              └─► platform I/O (fs, net, crypto)
```

## Description of the Design

### Relationship to the existing daemon

The bus does **not** replace the Endo formula-graph runtime. That
runtime's architecture already anticipates multiple platform backends
through its `-node.js` / `-node-powers.js` module convention. The bus
introduces a new platform pair, where the role formerly played by the
in-process "daemon" JS is now played by a manager child subprocess:

| Platform | Manager entry | Powers module | Worker entry | Worker powers |
|----------|--------------|---------------|-------------|---------------|
| Node.js (in-process) | `daemon-node.js` | `daemon-node-powers.js` | `worker-node.js` | `worker-node-powers.js` |
| Bus (Node manager) | `bus-daemon-node.js` | `bus-daemon-node-powers.js` | `bus-worker-node.js` | `bus-worker-node-powers.js` |
| Bus (XS manager) | `bus-daemon-rust-xs.js` | — | `bus-worker-xs.js` | — |

`bus-daemon-node.js` and `bus-daemon-node-powers.js` are derivatives of
their `-node` counterparts and implement the manager role over the
capability bus. The key difference is in `makeWorker`: instead of
calling `child_process.fork()` to spawn a child, the manager sends a
`spawn` request to the daemon over the envelope protocol. The daemon
creates the worker as a peer subprocess and routes messages between
manager and worker.

Similarly, `bus-worker-node.js` and `bus-worker-node-powers.js` are
derivatives of their `-node` worker counterparts, with the
communication channel adapted for the envelope protocol on fd 3/4
rather than Node.js IPC.

`bus-worker-xs.js` is a separate worker implementation that runs
inside the XS JavaScript engine embedded in a Rust binary. The Rust
binary is the unified `endor` executable, invoked as `endor worker`
(XS is the default engine). It uses `issueCommand`/`hostImportArchive`
host functions instead of Node.js APIs.

Over time, the bus powers modules progressively replace Node.js API
calls with "syscalls" — messages sent to the parent daemon — shrinking
the Node.js surface area.

### The daemon command

The daemon is a standalone binary (Go or Rust). It is **not** part of
the `packages/cli` command surface initially, but is designed so that
the CLI could delegate to it in the future.

```
endor start [--sock <path>] [--state <path>]
endor stop  [--sock <path>]
endor ping  [--sock <path>]
```

`start` performs the following:

1. Resolve state and socket paths (default: `~/.local/state/endo/`).
2. Spawn the manager child as a subprocess with the envelope protocol
   on fd 3/4 (Node.js manager by default, XS manager with
   `ENDO_MANAGER_XS=1`).
3. Begin accepting connections on the Unix socket (or delegate socket
   listening to the manager initially).
4. Enter the daemon message loop.

### Subprocess protocol

All subprocesses — manager and workers alike — communicate with the
daemon using the same envelope protocol on fd 3/4.

#### Pipe layout

| fd | Direction | Purpose |
|----|-----------|---------|
| 0  | inherited | stdin (unused, closed) |
| 1  | inherited | stdout → daemon log capture |
| 2  | inherited | stderr → daemon log capture |
| 3  | child → parent | CBOR-framed envelopes from subprocess |
| 4  | parent → child | CBOR-framed envelopes to subprocess |

#### Envelope format

Each envelope is a CBOR array:

```
[handle: uint, verb: text, payload: bytes, nonce: uint]
```

- **handle**: Identifies the target (outgoing) or sender (incoming).
- **verb**: Operation name (e.g., `"init"`, `"spawn"`, `"deliver"`).
- **payload**: CBOR-encoded operation-specific data.
- **nonce**: 0 for fire-and-forget; >0 for request/response correlation.

#### Startup sequence

1. Daemon spawns the manager child with
   `ExtraFiles = [fd3_write, fd4_read]`.
2. Daemon sends an init envelope:
   `[managerHandle, "init", empty, 0]` where `managerHandle` is the
   manager's assigned handle.
3. The manager (`bus-daemon-node.js` for Node, or `bus-daemon-rust-xs.js`
   for XS) reads the init envelope, extracts configuration, and begins
   normal manager startup using `bus-daemon-node-powers.js` (or the
   XS-side equivalent).
4. The manager signals readiness: `[0, "ready", empty, 0]`.

### Handle topology

The daemon assigns handles to each subprocess it manages. All
subprocesses are direct children of the daemon:

| Handle | Entity | Notes |
|--------|--------|-------|
| 0 | Daemon (control plane) | Always handle 0 |
| 1 | Manager child | First subprocess |
| 2+ | Workers | Spawned by the daemon on manager request |

### Worker spawning

When the manager needs a worker, it sends a spawn request to the
daemon rather than forking a child process itself:

```
manager ──[0, "spawn", {command, args}, rid]──► daemon
daemon spawns subprocess with fd 3/4 pipes
daemon ──[N, "init", empty, 0]──► worker(N)
daemon ──[1, "spawned", N, rid]──► manager
```

After spawning, the manager and worker communicate through the
daemon's message router:

```
manager ──[N, "deliver", payload, 0]──► daemon ──[1, "deliver", payload, 0]──► worker(N)
worker(N) ──[1, "deliver", payload, 0]──► daemon ──[N, "deliver", payload, 0]──► manager
```

The daemon performs **handle rewriting** on forwarded messages: when
the manager (handle 1) sends to worker N, the daemon delivers the
message to worker N with the handle field rewritten to 1 (the
manager's handle). When worker N sends to handle 1 (the manager), the
daemon delivers to the manager with the handle field rewritten to N.
This allows both sides to identify their counterpart without an
explicit sender field.

### Bridging CapTP over the envelope protocol

The existing manager-worker communication uses CapTP (Capability
Transfer Protocol) over netstring-framed pipes. Under the bus, this
CapTP traffic is carried inside envelope payloads:

1. The manager establishes a CapTP session for each worker, as the
   in-process daemon did previously.
2. Instead of reading/writing netstring frames on raw pipes,
   `bus-daemon-node-powers.js` wraps CapTP frames in envelopes:
   `[workerHandle, "deliver", frameBytes, 0]`.
3. `bus-worker-node-powers.js` unwraps envelopes back into CapTP frames
   for the worker's CapTP layer.

This encapsulation is transparent to the CapTP layer — it sees the
same reader/writer interface. The envelope framing adds the handle
routing needed for the daemon to deliver messages to the correct
subprocess.

### The bus-*.js modules

#### bus-daemon-node.js

Entry point for the Node.js manager child. Responsibilities:

1. Establish the envelope reader/writer on fd 3/4.
2. Read the init envelope to obtain the assigned handle.
3. Construct `bus-daemon-node-powers` with the envelope channel.
4. Call into `daemon.js` (the shared core) with the bus-specific powers.
5. Signal readiness to the daemon.

```js
// bus-daemon-node.js (sketch) — the Node.js manager child
import { makeDaemonicBusPowers } from './bus-daemon-node-powers.js';
import { makeDaemon } from './daemon.js';

const powers = makeDaemonicBusPowers({ config, ... });
const daemon = await makeDaemon(powers, ...);

await sendEnvelope(0, 'ready');
```

#### bus-daemon-node-powers.js

Factory for manager capabilities when running under the daemon.
A derivative of `daemon-node-powers.js` with these changes:

- **`makeWorker`**: Instead of `child_process.fork()`, sends a
  `[0, "spawn", {command, args}, rid]` envelope to the daemon and
  awaits a `"spawned"` response with the worker's handle. Then
  establishes a CapTP session over envelope-framed messages to that
  handle.
- **Envelope channel**: A reader/writer pair connected to fd 3/4 for
  daemon communication. The reader demultiplexes incoming envelopes
  by handle, dispatching worker messages to the appropriate CapTP
  session and control messages to the manager's control facet.
- **Syscall stubs** (future): Functions like `readFile`, `writeFile`,
  `listen` that initially delegate to Node.js but can be individually
  replaced with daemon calls.

#### bus-worker-node.js

Entry point for Node.js workers spawned by the daemon. A derivative
of `worker-node.js` with the communication channel adapted:

- Reads the init envelope from fd 4 to learn its handle.
- Establishes a CapTP session with `bus-worker-node-powers.js`
  reader/writer that wrap the envelope protocol.
- The rest of the worker lifecycle (loading guest modules, evaluating
  code) is unchanged.

#### bus-worker-node-powers.js

Minimal powers for workers under the daemon. A derivative of
`worker-node-powers.js`:

- Provides a reader/writer pair backed by the envelope protocol on
  fd 3/4 rather than raw Node.js pipe streams.
- CapTP frames are wrapped in
  `[managerHandle, "deliver", frameBytes, 0]` envelopes for sending and
  unwrapped from incoming envelopes for receiving.

#### bus-daemon-rust-xs.js

XS manager bootstrap. Despite the "daemon" in its file name (kept
for symmetry with `bus-daemon-node.js`), this module implements the
**manager** role, not the daemon. It runs inside the unified `endor`
binary invoked as `endor manager -e xs` and uses `issueCommand`
plus host powers in place of Node.js APIs. Bundled at build time via
`scripts/bundle-bus-daemon-rust-xs.mjs` into
`rust/endo/xsnap/src/daemon_bootstrap.js`, which the xsnap library
embeds as `MANAGER_BOOTSTRAP`.

#### bus-worker-xs.js

Worker bootstrap for the XS JavaScript engine. Runs inside the Rust
`endor` binary (as `endor worker`) rather than Node.js:

- Uses `issueCommand` (synchronous host function) instead of
  `writeFrameToStream` for sending CapTP messages.
- Uses `hostImportArchive` to load compartment-map archives natively
  in XS.
- Bundled at build time via
  `scripts/bundle-bus-worker-xs.mjs`.

### CBOR framing

The envelope protocol uses CBOR rather than netstring-framed JSON:

- **CBOR** is a binary format with well-defined byte string support,
  making it suitable for passing binary payloads without base64
  encoding.
- **Framing**: Each frame is a CBOR byte string (major type 2) wrapping
  the inner CBOR envelope array.

### Deadlock prevention

The daemon inherits the deadlock prevention strategy from the
`endo-engo` prototype:

- The daemon maintains a **spawn tree** recording parent-child
  relationships (logical, not OS-level — all processes are OS-level
  children of the daemon).
- **Synchronous calls** (nonce > 0) are only permitted from child to
  ancestor in the logical tree or to the control plane (handle 0).
- The `canBlock(caller, callee)` check prevents cycles.
- **Asynchronous messages** (nonce = 0) are always permitted.

In this architecture, the logical spawn tree is:
daemon → manager → workers.
Workers can synchronously call the manager or the daemon. The manager
can synchronously call the daemon. Sibling workers cannot
synchronously call each other (they use asynchronous messages via the
manager's CapTP layer).

## Incremental Implementation Plan

### Phase 0: Scaffold daemon

**Goal**: Minimal binary that spawns the manager child as a subprocess
and passes through its stdio.

**Status**: **Complete** (Go and Rust implementations).

### Phase 1: Envelope protocol and manager entry point

**Goal**: Establish bidirectional communication between the daemon
and the manager child over fd 3/4.

**Status**: **Complete**.

### Phase 2: Worker spawning through the daemon

**Goal**: All workers are spawned by the daemon as peers of the
manager.

**Status**: **Complete**.

### Phase 3: Native XS worker

**Goal**: Replace the Node.js worker process with a native Rust/XS
binary for confined workloads.

**Status**: **Complete** (functional, passing test suite).

### Phase 4: First syscall — logging

**Goal**: Demonstrate the syscall pattern by moving worker logging
through the daemon.

1. Define a `log` verb: `[0, "log", {level, message}, 0]`.
2. Workers send log messages to handle 0 instead of writing to stderr.
3. Daemon collects logs, writes them to per-worker log files and/or
   a unified log with structured metadata.

### Phase 5: Progressive syscall migration

**Goal**: Replace Node.js I/O in the bus powers modules with daemon
syscalls, one capability at a time.

Candidates for migration, in suggested order:

| Syscall | Replaces | Rationale |
|---------|----------|-----------|
| `fs.read` / `fs.write` | `node:fs` | Most impactful; enables daemon-side caching and access control |
| `net.listen` / `net.connect` | `node:net` | Enables daemon-side socket management |
| `crypto.random` / `crypto.hash` | `node:crypto` | Small surface, easy to verify |

Each syscall follows the pattern:

1. Define the verb and payload schema.
2. Implement the handler in the daemon.
3. Replace the Node.js call in the bus powers module with an envelope
   send.
4. Test that the manager functions identically.

This phase is unbounded — it proceeds as far as is useful without
requiring completion.

## Security Considerations

### Subprocess isolation

The daemon can apply OS-level sandboxing to workers it spawns
directly:

- The daemon controls the process configuration for each subprocess.
- On macOS, `sandbox-exec` profiles can restrict file and network
  access.
- On Linux, namespaces and seccomp filters can confine workers.
- Workers that obtain all I/O through daemon syscalls can be fully
  confined — they need no direct access to the filesystem or network.

### Handle authority

Handles are unforgeable within the envelope protocol: a worker can
only address handles that the daemon has explicitly routed to it.
This provides a capability discipline at the daemon level that
complements CapTP's object-capability discipline within the
JavaScript layer.

### Trust boundary

The manager child remains a trusted component — it runs the full
formula graph and manages CapTP connections. The daemon trusts the
manager in the same way that the original single-process
architecture trusted the in-process daemon code. The new trust
boundary is between the daemon and directly-spawned workers: the
daemon can enforce restrictions that the manager cannot (OS-level
sandboxing, resource limits, handle-based access control).

## Test Plan

- Manager boots via `bus-daemon-node.js` under the daemon.
- `endo ping`, `endo eval '1+1'`, and `endo mkhost` work as before.
- Init and ready envelopes are exchanged.
- `endo eval '1+1'` works with workers spawned by the daemon.
- Workers appear as children of the daemon (not of the manager)
  in `ps`.
- Killing the daemon terminates both the manager and all workers.
- Multiple concurrent workers are correctly multiplexed.
- The full `endo.test.js` suite passes with both Go and Rust
  daemons.

## Upgrade Considerations

### Compatibility with the endo CLI

The daemon does not modify the `endo` CLI. Users set `ENDO_BIN` to
use the new daemon. The Unix socket is at the same path, so all
`endo` commands work against a daemon-managed manager.

### State format

The daemon does not change the manager's state format. The formula
graph, pet stores, and keypairs are managed by the manager (Node.js
or XS) as the in-process daemon did before.

### Rollback

Because the daemon wraps the existing formula runtime without
modifying it, rolling back is trivial: stop the daemon-managed
manager and start a legacy in-process daemon directly with
`endo start`. No state migration is needed. The `-node` modules
remain alongside the `bus-` modules and continue to work
independently.

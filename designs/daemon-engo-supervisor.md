# Engo: Go Supervisor for Endo Daemon

| | |
|---|---|
| **Date** | 2026-02-25 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The Endo daemon is currently a Node.js process that supervises Node.js worker
processes. This architecture couples the supervisor to Node.js for both control
and I/O. As the daemon grows to serve more diverse workloads — web extensions,
native plugins, AI agent sandboxes — the supervisor itself becomes a bottleneck
and a liability: Node.js is single-threaded, its process management is limited,
and it cannot easily provide OS-level isolation primitives.

A Go supervisor process ("engo") would provide:

1. **Process supervision with OS-level control**: Go's `os/exec` and goroutine
   model are well-suited for managing a tree of heterogeneous subprocesses.
2. **A message-passing substrate**: A handle-based envelope protocol (proven in
   the `endo-engo` prototype) can route messages between peers without requiring
   all workers to be Node.js processes.
3. **A path to richer platform services**: The supervisor can progressively
   assume I/O responsibilities (filesystem, networking, crypto) currently
   handled by Node.js, offering them as "syscalls" to confined workers.
4. **Decoupling from Node.js runtime concerns**: SES lockdown, V8 quirks, and
   npm dependency management stay inside workers where they belong — not in the
   supervisor.

The key constraint is **incrementalism**: the existing Node.js daemon must
continue to work unmodified under `endo start`. Engo is an alternative
supervisor that hosts the daemon as a subprocess and manages all workers as
peers.

### Current architecture

```
endo (CLI) ──► node daemon ──►* node worker
```

### Target architecture (this design)

```
                          ┌─► node daemon
endo (CLI) ──► engo (Go) ─┤
                          └─►* node worker
```

All workers are children of engo, not of the Node.js daemon. The daemon
requests worker creation through the envelope protocol; engo spawns them as
peer subprocesses and routes messages between daemon and workers.

### Future architecture (out of scope)

```
endo (CLI) ─┐
engo (Go) ──┼─► node daemon
             ├─►* node worker
             ├─►* go worker
             ├─►* wasm worker
             └─► platform I/O (fs, net, crypto)
```

## Description of the Design

### Relationship to the existing daemon

Engo does **not** replace the Endo daemon. The Endo daemon's architecture
already anticipates multiple platform backends through its `-node.js` /
`-node-powers.js` module convention. Engo introduces a new platform pair:

| Platform | Daemon entry | Powers module | Worker entry | Worker powers |
|----------|-------------|---------------|-------------|---------------|
| Node.js  | `daemon-node.js` | `daemon-node-powers.js` | `worker-node.js` | `worker-node-powers.js` |
| Go (engo) | `daemon-go.js` | `daemon-go-powers.js` | `worker-go.js` | `worker-go-powers.js` |
| Web (future) | `daemon-web.js` | `daemon-web-powers.js` | — | — |

Initially, `daemon-go.js` and `daemon-go-powers.js` will be near-copies of
their `-node` counterparts. The key difference is in `makeWorker`: instead
of calling `child_process.fork()` to spawn a child, it sends a `spawn`
request to the Go supervisor over the envelope protocol. Engo creates the
worker as a peer subprocess and routes messages between daemon and worker.

Similarly, `worker-go.js` and `worker-go-powers.js` are initially near-copies
of their `-node` worker counterparts, with the communication channel adapted
for the envelope protocol on fd 3/4 rather than Node.js IPC.

Over time, the `-go` powers modules progressively replace Node.js API calls
with "syscalls" — messages sent to the parent Go supervisor — shrinking the
Node.js surface area.

### The engo command

Engo is a standalone Go binary. It is **not** part of the `packages/cli`
command surface initially, but is designed so that the CLI could delegate to it
in the future.

```
engo start [--sock <path>] [--state <path>]
engo stop [--sock <path>]
engo ping [--sock <path>]
```

`engo start` performs the following:

1. Resolve state and socket paths (default: `~/.local/state/endo/`).
2. Spawn the Node.js daemon as a subprocess with the envelope protocol on
   fd 3/4.
3. Begin accepting connections on the Unix socket (or delegate socket
   listening to the Node.js daemon initially).
4. Enter the supervisor message loop.

### Subprocess protocol

Engo reuses the subprocess worker protocol from the `endo-engo` prototype.
All subprocesses — daemon and workers alike — communicate with engo using the
same envelope protocol on fd 3/4.

#### Pipe layout

| fd | Direction | Purpose |
|----|-----------|---------|
| 0  | inherited | stdin (unused, closed) |
| 1  | inherited | stdout → supervisor log capture |
| 2  | inherited | stderr → supervisor log capture |
| 3  | child → parent | CBOR-framed envelopes from subprocess |
| 4  | parent → child | CBOR-framed envelopes to subprocess |

#### Envelope format

Each envelope is a CBOR array:

```
[handle: uint, verb: text, payload: bytes, requestID: uint]
```

- **handle**: Identifies the target (outgoing) or sender (incoming).
- **verb**: Operation name (e.g., `"init"`, `"spawn"`, `"resolve"`, `"log"`).
- **payload**: CBOR-encoded operation-specific data.
- **requestID**: 0 for fire-and-forget; >0 for request/response correlation.

#### Startup sequence

1. Engo spawns the Node.js daemon with `ExtraFiles = [fd3_write, fd4_read]`.
2. Engo sends an init envelope: `[daemonHandle, "init", config, 0]` where
   `config` includes state paths and the daemon's assigned handle.
3. The Node.js daemon (`daemon-go.js`) reads the init envelope, extracts
   configuration, and begins normal daemon startup using `daemon-go-powers.js`.
4. The daemon signals readiness: `[0, "ready", {}, 0]`.

### Handle topology

Engo assigns handles to each subprocess it manages. All subprocesses are
direct children of engo:

| Handle | Entity | Notes |
|--------|--------|-------|
| 0 | Engo supervisor (control plane) | Always handle 0 |
| 1 | Node.js daemon | First subprocess |
| 2+ | Node.js workers | Spawned by engo on daemon request |

### Worker spawning

When the daemon needs a worker, it sends a spawn request to the supervisor
rather than forking a child process itself:

```
daemon ──[0, "spawn", {command, args, env}, rid]──► engo
engo spawns subprocess with fd 3/4 pipes
engo ──[0, "init", {handle: N}, 0]──► worker(N)
worker(N) ──[0, "ready", {}, 0]──► engo
engo ──[1, "spawned", {handle: N}, rid]──► daemon
```

After spawning, the daemon and worker communicate through engo's message
router:

```
daemon ──[N, verb, payload, rid]──► engo ──[1, verb, payload, rid]──► worker(N)
worker(N) ──[1, verb, payload, rid]──► engo ──[N, verb, payload, rid]──► daemon
```

Engo performs **handle rewriting** on forwarded messages: when the daemon
(handle 1) sends to worker N, engo delivers the message to worker N with the
handle field rewritten to 1 (the daemon's handle). When worker N sends to
handle 1 (the daemon), engo delivers to the daemon with the handle field
rewritten to N. This allows both sides to identify their counterpart without
an explicit sender field.

### Bridging CapTP over the envelope protocol

The existing daemon-worker communication uses CapTP (Capability Transfer
Protocol) over netstring-framed pipes. Under engo, this CapTP traffic is
carried inside envelope payloads:

1. The daemon establishes a CapTP session for each worker, as it does today.
2. Instead of reading/writing netstring frames on raw pipes,
   `daemon-go-powers.js` wraps CapTP frames in envelopes:
   `[workerHandle, "captp", frameBytes, 0]`.
3. `worker-go-powers.js` unwraps envelopes back into CapTP frames for the
   worker's CapTP layer.

This encapsulation is transparent to the CapTP layer — it sees the same
reader/writer interface. The envelope framing adds the handle routing needed
for engo to deliver messages to the correct subprocess.

### The -go.js and -go-powers.js modules

#### daemon-go.js

Entry point for the Node.js daemon when running under engo. Responsibilities:

1. Establish the envelope reader/writer on fd 3/4.
2. Read the init envelope to obtain configuration.
3. Construct `daemon-go-powers` with the envelope channel.
4. Call into `daemon.js` (the shared core) with the go-specific powers.
5. Signal readiness to the supervisor.

```js
// daemon-go.js (sketch)
import { makeEnvelopeReader, makeEnvelopeWriter } from './envelope.js';
import { makeDaemonGoPowers } from './daemon-go-powers.js';
import { makeDaemon } from './daemon.js';

const reader = makeEnvelopeReader(fs.createReadStream(null, { fd: 4 }));
const writer = makeEnvelopeWriter(fs.createWriteStream(null, { fd: 3 }));

const initEnvelope = await reader.next();
const config = decodeInit(initEnvelope);

const powers = makeDaemonGoPowers(config, { reader, writer });
const daemon = await makeDaemon(powers, ...);

writer.write([0, 'ready', {}, 0]);
```

#### daemon-go-powers.js

Factory for daemon capabilities when running under engo. A derivative of
`daemon-node-powers.js` with these changes:

- **`makeWorker`**: Instead of `child_process.fork()`, sends a
  `[0, "spawn", {command, args, env}, rid]` envelope to engo and awaits a
  `"spawned"` response with the worker's handle. Then establishes a CapTP
  session over envelope-framed messages to that handle.
- **Envelope channel**: A reader/writer pair connected to fd 3/4 for
  supervisor communication. The reader demultiplexes incoming envelopes by
  handle, dispatching worker messages to the appropriate CapTP session and
  control messages to the daemon's supervisor facet.
- **Syscall stubs** (future): Functions like `readFile`, `writeFile`,
  `listen` that initially delegate to Node.js but can be individually replaced
  with supervisor calls.

#### worker-go.js

Entry point for Node.js workers spawned by engo. A derivative of
`worker-node.js` with the communication channel adapted:

- Reads the init envelope from fd 4 to learn its handle.
- Establishes a CapTP session with `worker-go-powers.js` reader/writer that
  wrap the envelope protocol.
- The rest of the worker lifecycle (loading guest modules, evaluating code)
  is unchanged.

#### worker-go-powers.js

Minimal powers for workers under engo. A derivative of
`worker-node-powers.js`:

- Provides a reader/writer pair backed by the envelope protocol on fd 3/4
  rather than raw Node.js pipe streams.
- CapTP frames are wrapped in `[daemonHandle, "captp", frameBytes, 0]`
  envelopes for sending and unwrapped from incoming envelopes for receiving.

### CBOR framing

The envelope protocol uses CBOR rather than netstring-framed JSON:

- **CBOR** is a binary format with well-defined byte string support, making it
  suitable for passing binary payloads without base64 encoding.
- **Framing**: Each frame is length-prefixed (4-byte big-endian length prefix
  followed by CBOR bytes), matching the `endo-engo` prototype.

The Node.js side uses a CBOR library (e.g., `cbor-x` or `@ipld/dag-cbor`).
The Go side uses `fxamacker/cbor/v2`.

### Deadlock prevention

The Go supervisor inherits the deadlock prevention strategy from the
`endo-engo` prototype:

- The supervisor maintains a **spawn tree** recording parent-child
  relationships (logical, not OS-level — all processes are OS-level children
  of engo).
- **Synchronous calls** (requestID > 0) are only permitted from child to
  ancestor in the logical tree or to the control plane (handle 0).
- The `canBlock(caller, callee)` check prevents cycles.
- **Asynchronous messages** (requestID = 0) are always permitted.

In this architecture, the logical spawn tree is: engo → daemon → workers.
Workers can synchronously call the daemon or engo. The daemon can
synchronously call engo. Sibling workers cannot synchronously call each other
(they use asynchronous messages via the daemon's CapTP layer).

## Incremental Implementation Plan

### Phase 0: Scaffold engo

**Goal**: Minimal Go binary that spawns the Node.js daemon as a subprocess
and passes through its stdio.

1. Create `packages/engo/` with a Go module.
2. Implement `engo start` that:
   - Resolves state/socket paths using the same conventions as `@endo/where`.
   - Spawns `node packages/daemon/src/daemon-node.js` (unmodified) as a
     subprocess with inherited stdio.
   - Waits for the daemon socket to appear, then prints "ready".
3. Implement `engo stop` and `engo ping` as thin wrappers.

**Validation**: `engo start` produces a working daemon reachable by
`endo ping`. Workers are still spawned by the Node.js daemon directly.

**No changes to packages/daemon.**

### Phase 1: Envelope protocol and daemon-go entry point

**Goal**: Establish bidirectional communication between engo and the Node.js
daemon over fd 3/4.

1. Implement CBOR envelope codec in Go (adapt from `endo-engo` prototype).
2. Add fd 3/4 pipes to the daemon subprocess spawn in engo.
3. Create `daemon-go.js` and `daemon-go-powers.js` as derivatives of their
   `-node` counterparts, adding envelope reader/writer on fd 3/4, init
   handling, and ready signaling.
4. `daemon-go-powers.js` still uses `child_process.fork()` for workers.
5. Update `engo start` to spawn `daemon-go.js` instead of `daemon-node.js`.

**Validation**: `engo start` boots the daemon via the envelope protocol.
`endo ping` works. The envelope channel carries init and ready but workers
are still daemon children.

### Phase 2: Worker spawning through engo

**Goal**: All workers are spawned by engo as peers of the daemon.

1. Port the supervisor message router from `endo-engo` prototype (handle
   table, per-worker goroutines, handle rewriting).
2. Implement `spawn` verb handler in engo.
3. Create `worker-go.js` and `worker-go-powers.js` as derivatives of their
   `-node` counterparts, using the envelope protocol on fd 3/4.
4. Replace `child_process.fork()` in `daemon-go-powers.js` with envelope
   spawn requests. The `makeWorker` function sends `[0, "spawn", ...]` to
   engo, receives a handle, and establishes CapTP over envelope-framed
   messages to that handle.
5. Implement envelope demultiplexing in `daemon-go-powers.js`: incoming
   envelopes are dispatched to the appropriate per-worker CapTP session based
   on handle.

**Validation**: `endo eval '1+1'` works with workers as children of engo.
`ps` shows workers as siblings of the daemon under engo. Killing engo
terminates both the daemon and all workers.

### Phase 3: First syscall — logging

**Goal**: Demonstrate the syscall pattern by moving worker logging through
the supervisor.

1. Define a `log` verb: `[0, "log", {level, message}, 0]`.
2. Workers send log messages to handle 0 instead of writing to stderr.
3. Engo collects logs, writes them to per-worker log files and/or a unified
   log with structured metadata.

**Validation**: Worker logs appear in engo's structured log output with
worker identification. No log data is lost compared to stderr.

### Phase 4: Progressive syscall migration

**Goal**: Replace Node.js I/O in the `-go-powers.js` modules with supervisor
syscalls, one capability at a time.

Candidates for migration, in suggested order:

| Syscall | Replaces | Rationale |
|---------|----------|-----------|
| `fs.read` / `fs.write` | `node:fs` | Most impactful; enables Go-side caching and access control |
| `net.listen` / `net.connect` | `node:net` | Enables Go-side socket management |
| `crypto.random` / `crypto.hash` | `node:crypto` | Small surface, easy to verify |

Each syscall follows the pattern:

1. Define the verb and payload schema.
2. Implement the handler in Go.
3. Replace the Node.js call in the `-go-powers.js` module with an envelope
   send.
4. Test that the daemon functions identically.

This phase is unbounded — it proceeds as far as is useful without requiring
completion.

## Security Considerations

### Subprocess isolation

Engo's value proposition includes the ability to apply OS-level sandboxing to
workers it spawns directly. This is out of scope for the initial phases but
the architecture supports it:

- Engo controls the `exec.Cmd` configuration for each subprocess.
- On macOS, `sandbox-exec` profiles can restrict file and network access.
- On Linux, namespaces and seccomp filters can confine workers.
- Workers that obtain all I/O through supervisor syscalls can be fully
  confined — they need no direct access to the filesystem or network.

### Handle authority

Handles are unforgeable within the envelope protocol: a worker can only
address handles that the supervisor has explicitly routed to it. This provides
a capability discipline at the supervisor level that complements CapTP's
object-capability discipline within the JavaScript layer.

### Trust boundary

The Node.js daemon remains a trusted component — it runs the full formula
graph and manages CapTP connections. Engo trusts the daemon in the same way
that the current architecture trusts the daemon process. The new trust
boundary is between engo and directly-spawned workers: engo can enforce
restrictions that the Node.js daemon cannot (OS-level sandboxing, resource
limits, handle-based access control).

## Test Plan

### Phase 0

- `engo start` spawns a daemon reachable by `endo ping`.
- `engo stop` terminates the daemon.
- `engo start` with an already-running daemon detects it and exits gracefully.

### Phase 1

- Daemon boots via `daemon-go.js` under engo.
- `endo ping`, `endo eval '1+1'`, and `endo mkhost` work as before.
- Init and ready envelopes are exchanged (verified by engo debug log).

### Phase 2

- `endo eval '1+1'` works with workers spawned by engo.
- Workers appear as children of engo (not of the Node.js daemon) in `ps`.
- Killing engo terminates both the daemon and all workers.
- Multiple concurrent workers are correctly multiplexed.

### Phase 3

- Worker logs are captured by engo with worker identification metadata.
- No log data is lost compared to the current stderr-based approach.

## Upgrade Considerations

### Compatibility with the endo CLI

Engo does not modify the `endo` CLI. Users can run `engo start` instead of
`endo start` to use the Go supervisor. The daemon's Unix socket is at the
same path, so all `endo` commands work against an engo-managed daemon.

In the future, the CLI could detect engo's presence and delegate to it, or
engo could subsume the CLI's daemon management commands.

### State format

Engo does not change the daemon's state format. The formula graph, pet stores,
and keypairs are managed by the Node.js daemon as before. Engo's own state
(if any) would be stored in a separate location (e.g.,
`~/.local/state/endo/engo/`).

### Rollback

Because engo wraps the existing daemon without modifying it, rolling back is
trivial: stop the engo-managed daemon and start one directly with
`endo start`. No state migration is needed. The `-node` modules remain
alongside the `-go` modules and continue to work independently.

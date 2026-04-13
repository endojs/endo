# Endo Daemon Binary Specification

A language-agnostic specification for implementing Endo daemon supervisor
binaries. This document describes the contract between the supervisor binary
(e.g. `endo-daemon-go`, or the Rust-native `endor`), the Node.js daemon
subprocess, and the test harness.

On the Rust side, the daemon is a single binary named `endor` that
dispatches to its role by subcommand. The daemon *is* the capability bus:
it routes envelopes between its children. The same executable also hosts
the supervised child modes (`manager`, `worker`, `run`) so that the daemon
can self-exec its manager child via `std::env::current_exe()` instead of
looking up a sibling binary.

## Overview

The Endo daemon architecture separates **supervision and message routing**
from **capability management**. The daemon (the capability bus) manages
process lifecycles and routes envelopes between its children. A manager
child handles CapTP connections, the formula graph, the pet-name store,
and persistence — it is the "root" capability process, even though it is
*a* child of the daemon, not the daemon itself. They communicate over a
CBOR-framed envelope protocol on inherited file descriptors. The legacy
Node.js daemon plays the manager role when an XS manager child is not
enabled.

```
┌──────────────────────────────────────────────────┐
│         Daemon (the capability bus)              │
│  (process lifecycle, message routing, PID file)  │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │              Manager Child               │    │
│  │  (CapTP, formula graph, Unix socket,     │    │
│  │   pet-name store) — Node.js or XS        │    │
│  │  fd 3: child writes → daemon reads       │    │
│  │  fd 4: child reads  ← daemon writes      │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Worker 1 │  │ Worker 2 │  │ Worker N │        │
│  │ fd 3/4   │  │ fd 3/4   │  │ fd 3/4   │        │
│  └──────────┘  └──────────┘  └──────────┘        │
└──────────────────────────────────────────────────┘
```

## 1. CLI Interface

The daemon binary MUST support these subcommands:

| Command  | Description |
|----------|-------------|
| `daemon` | Run the daemon (capability bus) in foreground |
| `start`  | Spawn the daemon in a detached session |
| `stop`   | Gracefully stop a running daemon |
| `ping`   | Verify daemon responsiveness |

The unified Rust `endor` binary additionally supports child-facing
subcommands. These are invoked by the daemon via self-exec
(`current_exe()`); they are not meant to be run directly by end users,
but the vocabulary is documented for completeness:

| Command   | Description |
|-----------|-------------|
| `manager` | Run as the supervised manager child (pet-name store, formula graph, CapTP multiplexer) |
| `worker`  | Run as a supervised worker child |
| `run`     | Load and execute a compartment-map archive standalone |

Every child-facing subcommand accepts an optional `-e <engine>` /
`--engine=<engine>` flag that selects which engine runs in the
subprocess. XS is the default, so `endor manager` and `endor manager -e xs`
are equivalent. A future `-e wasm` slots in additively without
changing the subcommand vocabulary.

For the top-level `daemon` subcommand, `-e <engine>` selects the
default engine the daemon uses when spawning its manager and worker
children. `endor daemon` is therefore equivalent to
`endor daemon -e xs` today.

### Terminology

The **daemon** is the capability bus — the long-running process that
owns the PID file and the Unix socket, routes envelopes between its
children, and enforces the sync-call spawn tree. It does not itself
run any JavaScript.

The **manager** is the privileged child process that bootstraps the
pet-name store, the formula graph, the host agent, and the CapTP
multiplexer. Historically this role was played exclusively by the
Node.js daemon script (`bus-daemon-node.js`); today it can also be
played by an XS-hosted bundle running inside `endor manager -e xs`.

Previously, two separate Rust binaries collided on the `daemon` verb:
`endo-daemon-rust daemon` ran the daemon, while `endo-rust-xs daemon`
ran the XS-hosted manager child. The child was renamed to
`endor manager` so that `daemon` unambiguously refers to the
top-level endo daemon and `manager` names the specialized child.

### 1.1 `daemon` Command

Runs the supervisor in the foreground. Reads configuration from environment
variables (see §2). Starts the Node.js daemon subprocess, waits for the Unix
socket to accept connections, then blocks until shutdown.

### 1.2 `start` Command

Spawns the supervisor as a detached background process using the double-fork
technique (see §13). Polls until the daemon socket is accepting connections or
a timeout (10 seconds) expires.

### 1.3 `stop` Command

Reads the PID file, sends `SIGINT` to the recorded process. The Node.js daemon
owns the PID file after startup (see §4.3), so `SIGINT` targets the Node.js
process, which cascades shutdown through the supervisor.

### 1.4 `ping` Command

Connects to the Unix socket and immediately disconnects. Exits 0 on success.

## 2. Configuration

All configuration is passed via environment variables. When `ENDO_STATE_PATH`
is set, the supervisor MUST use environment variables for all paths. Otherwise,
platform-appropriate defaults apply.

| Variable | Description | Default (Linux) |
|----------|-------------|-----------------|
| `ENDO_STATE_PATH` | Durable state directory | `~/.local/state/endo` |
| `ENDO_EPHEMERAL_STATE_PATH` | Ephemeral state (PID files) | `/tmp/endo-$USER` |
| `ENDO_SOCK_PATH` | Unix domain socket path | `/tmp/endo-$USER/captp0.sock` |
| `ENDO_CACHE_PATH` | Cache directory | `~/.cache/endo` |
| `ENDO_DAEMON_PATH` | Path to Node.js daemon script | (required) |
| `ENDO_NODE_PATH` | Path to Node.js executable | `node` via `$PATH` |
| `ENDO_MANAGER_XS` | If set, run the manager child as an XS subprocess instead of the legacy Node.js daemon | unset |
| `ENDO_XS_BIN` | Optional override for the XS manager binary. When unset, `endor` self-execs via `current_exe()`. | unset |
| `ENDO_TRACE` | Enable trace logging | unset |

### 2.1 Derived Paths

| Path | Location |
|------|----------|
| Log file | `$ENDO_STATE_PATH/endo.log` |
| PID file | `$ENDO_EPHEMERAL_STATE_PATH/endo.pid` |
| Root file | `$ENDO_STATE_PATH/root` |
| Formula storage | `$ENDO_STATE_PATH/formulas/{head}/{tail}.json` |

## 3. Startup Sequence

1. **Resolve paths** from environment variables or platform defaults.
2. **Set umask** to `0077`. The daemon stores per-user state and should not
   create files accessible to other users.
3. **Create directories**: `statePath`, `ephemeralStatePath`, `cachePath`, and
   the parent of `sockPath`. Use mode `0o700`.
4. **Set working directory** to `statePath`. The daemon has a hard dependency
   on this directory, so using it as the working directory simplifies relative
   path handling without risk of holding an unrelated mount busy.
5. **Open log file**: Open `$ENDO_STATE_PATH/endo.log` for append. Redirect
   stdout and stderr to this file descriptor (see §14).
6. **Install SIGHUP handler** to reopen the log file (see §12).
7. **Write PID file**: Write `"{pid}\n"` to `$ENDO_EPHEMERAL_STATE_PATH/endo.pid`.
8. **Start the message router** (supervisor internal).
9. **Spawn the Node.js daemon** subprocess (see §4).
10. **Wait for socket**: Poll `sockPath` until it accepts TCP connections
    (50ms intervals, 10-second timeout).
11. **Wait for root file**: Poll `$ENDO_STATE_PATH/root` until it exists
    (50ms intervals, 10-second timeout). The Node.js daemon writes this after
    the socket is listening and the host agent is initialized.
12. **Block** until context is cancelled (SIGINT/SIGTERM).

## 4. Subprocess Management

### 4.1 Spawning the Manager Child

The daemon spawns the (Node.js or XS) manager child with:

- **Command**: `$ENDO_NODE_PATH $ENDO_DAEMON_PATH <sockPath> <statePath> <ephemeralStatePath> <cachePath>`
- **stdout/stderr**: Redirected to the log file.
- **Extra file descriptors**:
  - `ExtraFiles[0]` → fd 3 in child: child writes envelopes to supervisor
  - `ExtraFiles[1]` → fd 4 in child: child reads envelopes from supervisor
- **Environment**: Inherited from supervisor (includes all `ENDO_*` variables).

After spawning, the daemon MUST:
1. Close the child-side pipe ends in the parent process.
2. Allocate a handle for the manager (typically handle 1).
3. Send an `init` envelope to the manager (see §5.3).
4. Start read/write goroutines for the envelope protocol.

### 4.2 Spawning Workers

Workers are spawned on request from the Node.js daemon via `spawn` envelopes
(see §5.3). The supervisor:

1. Allocates a new handle for the worker.
2. Creates pipe pairs for fd 3/4.
3. Spawns `<command> <args...>` with the pipe ends as `ExtraFiles`.
4. Sends an `init` envelope to the worker with its assigned handle.
5. Starts read/write/wait goroutines.
6. Responds with a `spawned` envelope containing the worker's handle.

Workers inherit stdout/stderr from the supervisor process (which points to
the log file, see §14).

### 4.3 PID File Ownership Transfer

The manager child overwrites `endo.pid` with its own PID after startup. This
is intentional: the manager owns the Unix socket and workers, so
`SIGINT` to the PID file target kills the process that matters. The daemon
detects the manager's exit and cascades shutdown.

## 5. Envelope Protocol

Communication between supervisor, daemon, and workers uses CBOR-framed
envelopes over inherited file descriptors.

### 5.1 Pipe Layout

For every subprocess (daemon or worker):
- **fd 3**: Child writes to supervisor (child → parent)
- **fd 4**: Child reads from supervisor (parent → child)

### 5.2 Frame Encoding

Each envelope is wrapped in a CBOR byte string (major type 2):

```
┌─────────────────────────────────────────┐
│ CBOR byte string header (major 2, len)  │
│ ┌─────────────────────────────────────┐ │
│ │ Envelope (CBOR array, see §5.3)    │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

The outer framing uses standard CBOR byte string encoding:
- `0x40..0x57` for payloads 0–23 bytes
- `0x58 <1-byte len>` for 24–255 bytes
- `0x59 <2-byte len>` for 256–65535 bytes
- `0x5a <4-byte len>` for larger payloads

### 5.3 Envelope Structure

An envelope is a CBOR array of 3 or 4 elements:

```cbor
[handle, verb, payload, nonce?]
```

| Field | CBOR Type | Description |
|-------|-----------|-------------|
| `handle` | unsigned int | Target/source handle. 0 = supervisor control plane. |
| `verb` | text string | Operation type (see below). |
| `payload` | byte string | Verb-specific data. May be empty (`0x40`). |
| `nonce` | unsigned int | Optional. >0 for request/response matching. 0 or absent for fire-and-forget. |

### 5.4 Verbs

#### `init` (supervisor → child)

Sent immediately after spawning a subprocess. The `handle` field contains
the child's assigned handle.

```
handle: <assigned handle>
verb: "init"
payload: empty
nonce: 0
```

#### `ready` (daemon → supervisor)

Sent by the Node.js daemon after the Unix socket is listening and the root
file is written. Addressed to handle 0 (control plane).

```
handle: 0
verb: "ready"
payload: empty
nonce: 0
```

#### `spawn` (daemon → supervisor)

Requests the supervisor to spawn a new worker subprocess.

```
handle: 0
verb: "spawn"
payload: CBOR map {"command": text, "args": [text...]}
nonce: >0 (for response matching)
```

#### `spawned` (supervisor → daemon)

Response to a `spawn` request.

```
handle: <daemon handle>
verb: "spawned"
payload: CBOR unsigned int (worker handle)
nonce: <matching request nonce>
```

#### `error` (supervisor → daemon)

Error response to a `spawn` request.

```
handle: <daemon handle>
verb: "error"
payload: UTF-8 error message bytes
nonce: <matching request nonce>
```

#### `deliver` (daemon ↔ worker, routed by supervisor)

CapTP message encapsulated in an envelope. The supervisor routes these between
the daemon and workers using handle rewriting. The payload contains the raw
CapTP message bytes (no netstring framing — the envelope protocol already
provides framing via §5.2).

```
handle: <target handle>
verb: "deliver"
payload: raw CapTP message bytes
nonce: 0
```

When routing `deliver` envelopes, the supervisor rewrites the `handle` field
to the sender's handle, so the recipient knows who sent the message.

#### `despawn` (daemon → supervisor)

Requests the supervisor to forcibly terminate a worker. The supervisor sends
SIGTERM to the worker, waits up to the grace period (see §7), then sends
SIGKILL if the worker is still alive. After the worker exits, the supervisor
sends an `exited` envelope as usual.

```
handle: 0
verb: "despawn"
payload: CBOR unsigned int (worker handle)
nonce: >0 (for response matching)
```

The supervisor responds with an `exited` envelope for the despawned worker
once the process has terminated. If the handle does not refer to a live
worker, the supervisor responds with an `error` envelope.

#### `exited` (supervisor → daemon)

Notification that a worker process has exited.

```
handle: <exited worker handle>
verb: "exited"
payload: empty
nonce: 0
```

#### `list` (daemon → supervisor)

Requests a list of all registered workers.

```
handle: 0
verb: "list"
payload: empty
nonce: 0
```

#### `workers` (supervisor → daemon)

Response to a `list` request. Payload is a CBOR array of worker metadata maps.

## 6. Handle-Based Message Routing

The supervisor maintains:

- **Handle counter**: Monotonically increasing. Handle 0 is reserved for the
  supervisor control plane.
- **Inbox map**: Per-handle message queues (mailboxes).
- **Worker metadata**: Command, args, PID, start time per handle.
- **Parent map**: Records which handle spawned which, for sync-call validation.

### 6.1 Message Delivery

Messages are delivered to the target handle's inbox. If the target is handle 0,
the message is dispatched to the control plane handler. Otherwise, it is
enqueued in the target's mailbox for the write goroutine to send.

### 6.2 Sync-Call Validation

To prevent deadlocks, synchronous calls (nonce > 0) are only allowed:
- To ancestors in the spawn tree (a worker may sync-call its parent).
- To handle 0 (the control plane).

## 7. Shutdown Sequence

1. Receive SIGINT or SIGTERM.
2. Cancel the supervisor context.
3. Wait for the Node.js daemon to exit (it detects the pipe close).
4. Send SIGTERM to each worker. Wait up to 5 seconds for graceful exit.
5. Send SIGKILL to any workers still alive after the grace period.
6. Remove the PID file.

The Go supervisor owns the full worker termination lifecycle, including the
grace-period-then-SIGKILL escalation. The JS daemon's `forceCancelled`
parameter in the Go control powers is intentionally unused — the JS side
only requests graceful cancellation via CapTP, and the supervisor handles
escalation internally.

If the Node.js daemon exits first (e.g., crash or `terminate()` via CapTP),
the supervisor detects the exit and initiates shutdown.

## 8. Filesystem Layout

After startup, the daemon creates this directory structure:

```
$ENDO_STATE_PATH/
├── endo.log          # Daemon log (append-only)
├── root              # Agent formula identifier (written after ready)
├── .nonce            # Root formula nonce (created by persistence init)
└── formulas/
    └── {head}/       # First 2 hex chars of formula number
        └── {tail}.json  # Remaining hex chars, JSON formula data

$ENDO_EPHEMERAL_STATE_PATH/
├── endo.pid          # Daemon PID (overwritten by Node.js daemon)
└── worker/
    └── {workerId}/
        ├── worker.pid
        └── worker.log

$ENDO_SOCK_PATH        # Unix domain socket for CapTP
```

### 8.1 Root File Format

Plain text containing a formula identifier followed by a newline:

```
{formulaNumber}:{nodeNumber}\n
```

Where `formulaNumber` and `nodeNumber` are each 64-character lowercase hex
strings (SHA-256 hash and Ed25519 public key respectively).

### 8.2 PID File Format

Plain text containing the process ID followed by a newline:

```
{pid}\n
```

## 9. CapTP Connection Protocol

The Unix socket serves CapTP (Capability Transport Protocol) connections:

1. **Transport**: Unix domain socket at `sockPath`.
2. **Framing**: Netstring encoding (length-prefixed with colon delimiter).
3. **Serialization**: JSON with pass-style encoding via `@endo/marshal`.
4. **Protocol**: CapTP via `@endo/captp`.

Each client connection gets its own CapTP session. The bootstrap object
provides access to the daemon's capability graph.

## 10. Test Harness Contract

When invoked by the test harness:

1. The supervisor binary is spawned with `daemon` subcommand.
2. Environment variables provide test-specific paths (no collision with
   system daemon).
3. The harness waits for the socket to accept connections.
4. The harness waits for the root file to exist.
5. The harness connects via CapTP to exercise the daemon.
6. On teardown, the harness sends `terminate()` via CapTP, then kills
   remaining processes via PID files.

### 10.1 Required Environment Variables for Testing

The test harness always sets:
- `ENDO_STATE_PATH`
- `ENDO_EPHEMERAL_STATE_PATH`
- `ENDO_SOCK_PATH`
- `ENDO_CACHE_PATH`
- `ENDO_DAEMON_PATH` (path to `bus-daemon-node.js`)

### 10.2 Socket Path Length

Unix domain socket paths are limited to ~90–108 bytes depending on platform.
The test harness truncates test names to stay within limits. Implementations
SHOULD warn when the socket path exceeds 104 bytes.

## 11. Environment Passing

The supervisor inherits its environment from the parent process. This
environment is passed through to the Node.js daemon and worker subprocesses.
The test harness filters environment to `ENDO_*` and `LOCKDOWN_*` prefixes
before spawning the supervisor.

Workers spawned by the supervisor inherit the supervisor's full environment.
The Node.js daemon may set additional environment variables (like
`ENDO_ADDR` for the APPS gateway) when requesting worker spawns.

## 12. Signal Handling

| Signal  | Behavior |
|---------|----------|
| SIGINT  | Initiate graceful shutdown |
| SIGTERM | Initiate graceful shutdown |
| SIGHUP  | Reopen the log file (see §14) |

The supervisor installs handlers for SIGINT and SIGTERM and cancels the root
context, which cascades to all subprocesses.

The SIGHUP handler closes the current log file descriptor and reopens
`$ENDO_STATE_PATH/endo.log` for append. This supports external log rotation:
a log rotator can rename the current log file and send SIGHUP to cause the
daemon to start writing to a fresh file at the original path. Stdout and
stderr are redirected to the new file descriptor.

## 13. Daemonization (Double Fork)

The `start` command uses the double-fork technique to fully detach the
supervisor from the launching terminal:

1. **First fork**: The parent process forks. The parent exits, returning
   control to the shell. The child is no longer a process group leader.
2. **`setsid()`**: The child calls `setsid()` to become the leader of a new
   session with no controlling terminal.
3. **Second fork**: The session leader forks again. The intermediate process
   exits. The grandchild is in the new session but is not the session leader,
   so it can never acquire a controlling terminal — even by accident.
4. **Grandchild setup**: The grandchild (the actual daemon) closes stdin
   (or redirects from `/dev/null`), sets umask, sets working directory, opens
   the log file, and redirects stdout/stderr as described in §3.

The `start` command's parent process (before the first fork) polls for the
socket and root file to confirm the daemon started successfully before
exiting.

## 14. Log File Management

The supervisor opens `$ENDO_STATE_PATH/endo.log` in append mode and redirects
both stdout and stderr to this file descriptor. All output from the
supervisor, the Node.js daemon subprocess, and workers flows to this log.

Key properties:

- **Append mode**: Multiple writers (supervisor + subprocesses sharing the fd)
  are safe because each `write()` to an `O_APPEND` file descriptor is atomic
  up to `PIPE_BUF` bytes on POSIX systems.
- **Log rotation**: External tools may rename the log file and send SIGHUP to
  the supervisor (see §12). The supervisor reopens the path and redirects
  stdout/stderr to the new descriptor. Subprocesses that inherited the old
  descriptor continue writing to the renamed file until they are restarted.
- **Stderr is unbuffered**: Crash diagnostics appear in the log immediately.
  Stdout may be line-buffered or fully buffered depending on the runtime; for
  Node.js subprocesses, stderr is preferred for diagnostic output.

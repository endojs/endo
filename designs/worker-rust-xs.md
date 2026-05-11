# Rust Worker with XS Engine

| | |
|---|---|
| **Created** | 2026-03-23 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Every Endo worker today is a Node.js process.
The worker imports `@endo/init` to apply the SES shim, which freezes
intrinsics, patches `Compartment` onto the global, and locks down
`eval` — all in JavaScript, on top of V8.
This creates three problems:

1. **The SES shim is a compatibility layer, not a boundary.**
   V8 has no native `Compartment`.
   The shim emulates confinement by rewriting source text and
   controlling the global scope, but it cannot enforce module-level
   isolation at the engine level.
   XS implements `Compartment` and `ModuleSource` natively — guest
   code runs in a compartment that the engine itself enforces.

2. **Every I/O operation crosses a process boundary.**
   Workers communicate with the daemon via CapTP over pipes.
   The daemon calls into Node.js built-in modules (`node:fs`,
   `node:crypto`, `node:net`) for all I/O.
   Under the Go and Rust supervisors, workers still run Node.js —
   the supervisor only mediates spawning and message routing.
   Moving I/O into the supervisor (the previous design direction)
   would make it a bottleneck.

3. **Node.js is a large, complex dependency.**
   It brings V8, libuv, a module loader, an HTTP stack, and a
   package ecosystem.
   For a confined worker whose only job is to run hardened
   JavaScript with capability-mediated I/O, this is excessive.

This design replaces the Node.js worker with a Rust process that
embeds the XS engine and provides I/O capabilities via cap-std,
in-process, without crossing a pipe boundary for every syscall.

## Design

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Rust supervisor                          │
│              (inter-worker routing only)                    │
└──────────┬──────────────────────────┬───────────────────────┘
      fd 3/4                    fd 3/4
┌──────────┴──────────┐  ┌───────────┴───────────────────────┐
│   Node.js daemon    │  │        Rust/XS worker             │
│   (orchestration)   │  │                                   │
│                     │  │  ┌─────────────────────────────┐  │
│                     │  │  │     Host compartment        │  │
│                     │  │  │  (cap-std backed powers)     │  │
│                     │  │  │                             │  │
│                     │  │  │  ┌───────────────────────┐  │  │
│                     │  │  │  │  Guest compartment    │  │  │
│                     │  │  │  │  (user/agent code)    │  │  │
│                     │  │  │  │  No host API access   │  │  │
│                     │  │  │  └───────────────────────┘  │  │
│                     │  │  └─────────────────────────────┘  │
│                     │  │                                   │
│                     │  │  cap-std: fs, crypto, net         │
│                     │  └───────────────────────────────────┘
└─────────────────────┘
```

The Rust supervisor stays thin — it routes envelopes between
workers and the daemon.
The **worker** is where the change happens: instead of a Node.js
process running the SES shim, it is a Rust process that embeds
XS and provides I/O through Rust-native libraries.

The Node.js daemon process remains for orchestration (formula
graph, pet stores, CapTP session management) during the
transition.
Long-term, the daemon itself can move to a Rust/XS process.

### XS Embedding

XS is Moddable's JavaScript engine, written in C.
It provides native `Compartment` and `ModuleSource` as specified
by the TC39 compartment proposal.
Endo already has XS-specific shims in `packages/ses/src-xs/`
that fall through to native behavior when the `xs` package
condition is active.

The Rust worker embeds XS via C bindings:

```
rust worker binary
  └── xs-embed (Rust crate)
        └── libxs (C library, statically linked)
              ├── Compartment (native)
              ├── ModuleSource (native)
              └── Machine (execution context)
```

**`xs-embed`** is a Rust crate wrapping the XS C API:
- `Machine` — XS execution context (the "virtual machine")
- `Slot` — XS value handle
- Host function registration via `xsNewHostFunction`
- Module registration via `xsNewHostModule`
- Compartment creation and endowment injection

The crate uses `bindgen` to generate Rust bindings from the XS
C headers and links `libxs` statically.

### Compartment Model

XS native compartments provide the confinement boundary.
The worker creates two layers:

**Host compartment** — the outer compartment, created by the Rust
worker at startup.
It receives host-provided endowments backed by cap-std:

```
Host compartment endowments:
  FilePowers     → cap-std::fs::Dir handles
  CryptoPowers   → sha2, ed25519-dalek, rand
  NetworkPowers  → cap-net-ext::Pool
  console        → stderr write
  TextEncoder, TextDecoder, URL
  E, Far, makeExo, M (from @endo/captp, @endo/exo, @endo/patterns)
```

The host compartment runs Endo's own modules (`@endo/captp`,
`@endo/far`, `@endo/exo`, `@endo/patterns`, the worker bootstrap)
compiled under the `xs` package condition.

**Guest compartment** — created by the host compartment's worker
bootstrap for each `evaluate`, `makeBundle`, or `makeUnconfined`
call.
It receives only the endowments the daemon explicitly provides:

```
Guest compartment endowments:
  E, Far, makeExo, M
  TextEncoder, TextDecoder, URL
  assert, console
  $id, $cancelled
  ...named values from daemon
```

No `FilePowers`, no `CryptoPowers`, no `NetworkPowers` —
the guest has no host API access.
It can only reach I/O through capabilities passed to it via
CapTP (the `powers` argument to `make(powers, context)`).

This is the same trust architecture as today's SES-based workers,
but enforced by the engine rather than by source rewriting.

### Host Functions: cap-std Backed Powers

Instead of sending envelopes to the daemon for every I/O
operation, the Rust worker provides host functions that call
cap-std directly, in-process.

#### Filesystem (cap-std)

```rust
// Registered as host functions in the host compartment
fn host_read_file(machine: &mut Machine) -> Result<()> {
    let dir_token = machine.arg_string(0)?;
    let path = machine.arg_string(1)?;
    let dir = dirs.get(&dir_token)?;
    let contents = dir.read_to_string(&path)?;
    machine.return_string(&contents);
    Ok(())
}
```

Each `Dir` handle is opened once at worker startup.
The directory tokens (`state`, `ephemeral`, `cache`) scope
filesystem access — the guest code never sees absolute paths
and cannot escape the directory boundary.

#### Crypto (sha2, ed25519-dalek, rand)

```rust
fn host_sha256(machine: &mut Machine) -> Result<()> {
    let data = machine.arg_bytes(0)?;
    let hash = Sha256::digest(&data);
    machine.return_string(&hex::encode(hash));
    Ok(())
}
```

Stateless, in-process.
No IPC overhead for every hash computation.

#### Network (cap-net-ext)

```rust
fn host_serve_port(machine: &mut Machine) -> Result<()> {
    let port = machine.arg_i32(0)?;
    let host = machine.arg_string(1)?;
    let addr: SocketAddr = format!("{}:{}", host, port).parse()?;
    let listener = pool.bind_tcp_listener(&addr)?;
    let lh = listener_handles.insert(listener);
    machine.return_i32(lh);
    Ok(())
}
```

TCP and Unix socket operations backed by `cap-net-ext::Pool`.
The `Pool` restricts which addresses are bindable — the
capability boundary moves from the protocol layer into the
process itself.

### Data Transfer: Minimizing Copies

The previous envelope-based design required:
1. JS serializes request to CBOR
2. CBOR written to pipe
3. Rust reads pipe, deserializes CBOR
4. Rust performs I/O
5. Rust serializes result to CBOR
6. CBOR written to pipe
7. JS reads pipe, deserializes CBOR

With an embedded engine, host functions eliminate all seven
steps — the call is a direct function invocation within the
same process, with XS slot-based argument passing.

For large data (file contents, blob streams), further
optimization is possible:

**ArrayBuffer transfer:** XS supports `ArrayBuffer` with
external backing storage.
A Rust host function can allocate a buffer, perform I/O directly
into it, and return it to JS as an `ArrayBuffer` — zero copy
from I/O to JS value.

**Streaming:** For large files, a host function can return an
async iterator that yields `ArrayBuffer` chunks, each backed by
a Rust-allocated buffer filled directly from cap-std's
`Read` trait.

**Future: SharedArrayBuffer + Atomics.**
If multiple workers need concurrent access to shared data
(e.g., a shared content store), Rust could allocate a shared
memory region and expose it to workers as `SharedArrayBuffer`
with `Atomics` for coordination.
This is explicitly forbidden in guest compartments (SES policy)
but could be used in the host compartment layer for
inter-worker coordination.

### CapTP Integration

Workers communicate with the daemon and other workers via CapTP.
Today, CapTP messages flow over netstring-framed pipes (Node.js)
or envelope-framed pipes (Go/Rust supervisor).

The Rust/XS worker uses the envelope protocol to communicate
with the supervisor, same as today's Rust workers.
The difference is what runs inside:

```
Today (Rust supervisor + Node.js worker):
  Supervisor ←envelope→ Node.js process
                           └── @endo/init (SES shim)
                           └── @endo/captp
                           └── worker.js bootstrap
                           └── guest Compartment (SES-emulated)

New (Rust supervisor + Rust/XS worker):
  Supervisor ←envelope→ Rust process
                           └── XS engine
                           └── @endo/captp (xs condition)
                           └── worker bootstrap (host compartment)
                           └── guest Compartment (XS-native)
```

The envelope reader/writer moves from JS (`worker-rust-powers.js`)
into the Rust host layer.
The Rust side decodes envelopes and dispatches CapTP messages
into the XS machine.
Outbound CapTP messages from XS are encoded as envelopes by
the Rust host and written to fd 3.

### Module Loading

XS uses `ModuleSource` and the compartment's `importHook` /
`moduleMapHook` for module resolution.
Endo's `@endo/compartment-mapper` already supports XS under
the `xs` package condition.

For the Rust/XS worker:

1. **Endo packages** (`@endo/captp`, `@endo/far`, `@endo/exo`,
   `@endo/patterns`, etc.) are pre-compiled into XS bytecode
   archives at build time.
   This eliminates parse-time overhead and ensures module
   availability without a filesystem module loader.

2. **Guest bundles** arrive as `EndoReadable` over CapTP.
   The worker fetches the bundle source, parses it via
   `@endo/import-bundle` (XS-native path), and executes it in
   a guest compartment.

3. **Unconfined modules** are loaded from a filesystem path.
   The host compartment reads the module source via cap-std
   and compiles it as a `ModuleSource`.

### Worker Lifecycle

1. **Startup:** Supervisor spawns the Rust/XS worker binary,
   wires fd 3/4 pipes, sends `init` envelope with handle
   assignment.

2. **Bootstrap:** Rust side initializes XS machine, opens cap-std
   `Dir` handles, registers host functions, loads pre-compiled
   Endo modules into the host compartment, runs worker bootstrap.

3. **Ready:** Worker sends `ready` envelope to supervisor.
   Daemon discovers the worker via the existing `makeWorker` flow.

4. **Evaluate/Bundle/Unconfined:** Daemon sends CapTP messages
   requesting `evaluate(source, ...)`, `makeBundle(readable, ...)`,
   or `makeUnconfined(path, ...)`.
   The host compartment creates a guest compartment and runs the
   code.

5. **Termination:** Daemon sends `terminate()` via CapTP.
   Worker drains pending operations, sends final messages, exits.
   If the worker does not exit within the grace period, the
   supervisor sends SIGKILL.

### Debugging

XS has limited debugging support compared to V8.
This is the primary tradeoff of the XS choice.

**Available:**
- `xsbug` — Moddable's debugger, supports breakpoints, stepping,
  variable inspection.
  Connects via serial or TCP.
- `console` output — routed through the host compartment to stderr.
- Structured error messages — XS provides stack traces.

**Not available:**
- Chrome DevTools Protocol — would require building an adapter.
- Source maps — XS does not consume standard source maps.
  Pre-compiled bytecode archives lose source position info unless
  debug symbols are preserved at build time.

**Mitigation:**
- Build two worker variants: a debug build with `xsbug` support
  and source positions preserved, and a release build with
  pre-compiled bytecode.
- For development, continue using the Node.js worker path —
  the supervisor already supports heterogeneous workers.
  Developers debug on Node.js, deploy on Rust/XS.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-capability-bus](daemon-capability-bus.md) | Supervisor spawns Rust/XS workers via the same envelope protocol. |
| [platform-fs](platform-fs.md) | `@endo/platform` types and interfaces implemented by cap-std host functions. |
| [daemon-capability-filesystem](daemon-capability-filesystem.md) | Cap-std `Dir` handles provide the OS-level enforcement. |

## Implementation Phases

### Phase 1: XS Embedding Crate (L)

- Create `rust/xs-embed/` crate with `bindgen`-generated bindings
  to the XS C API.
- Wrap `Machine`, `Slot`, host function registration, compartment
  creation in safe Rust types.
- Build and statically link `libxs` via a `build.rs` script.
- Test: create a machine, evaluate `1 + 1`, register a host
  function, call it from JS.

### Phase 2: Host Powers (M)

- Add `cap-std`, `cap-net-ext`, `sha2`, `rand`, `ed25519-dalek`
  to the worker crate.
- Implement `FilePowers`, `CryptoPowers`, `NetworkPowers` as
  XS host functions backed by cap-std.
- Register host functions in a host compartment with the correct
  endowments.
- Test: JS in the host compartment can read/write files, compute
  SHA-256, bind a TCP port.

### Phase 3: Endo Module Loading (L)

- Set up XS build pipeline with `xs` package condition to
  compile `@endo/captp`, `@endo/far`, `@endo/exo`,
  `@endo/patterns`, `@endo/pass-style` into XS bytecode archives.
- Implement `importHook` in the host compartment for loading
  pre-compiled modules.
- Implement guest compartment creation with confined endowments.
- Test: host compartment can import `@endo/far`, create a `Far`
  object, pass it to a guest compartment.

### Phase 4: CapTP and Envelope Integration (M)

- Move envelope reader/writer into Rust (reuse existing
  `codec.rs` from the supervisor).
- Bridge envelope CapTP messages into the XS machine:
  Rust decodes envelope → dispatches to `@endo/captp`
  `dispatch` function in XS → outbound messages encoded
  back to envelopes.
- Wire the worker into the supervisor's spawn flow.
- Test: daemon can spawn a Rust/XS worker, send a CapTP
  `evaluate("1 + 1")`, receive the result.

### Phase 5: Worker Bootstrap and Integration (M)

- Port `worker.js` bootstrap logic to run in the XS host
  compartment: `evaluate`, `makeBundle`, `makeUnconfined` methods.
- Wire `daemon-rust-powers.js` to spawn Rust/XS workers
  instead of (or alongside) Node.js workers.
- Integration test: full daemon test with a Rust/XS worker
  running guest code that uses `E()` to call powers.

### Phase 6: Platform Adapter (S)

- Create `packages/platform/src/fs-rust/` adapters that use
  the cap-std host functions.
- Add `"./fs/rust"` conditional export to
  `packages/platform/package.json`.

## Design Decisions

1. **XS over V8 for the embedded engine.**
   XS provides native `Compartment` and `ModuleSource` — the
   confinement boundary is enforced by the engine, not a shim.
   This is the decisive factor.
   V8 is faster (JIT) and has better debugging (DevTools), but
   requires the SES shim for confinement and has a much larger
   binary/memory footprint.
   For confined workers running capability-mediated code, engine
   speed matters less than confinement correctness.

2. **Worker process, not supervisor process.**
   The previous design routed all I/O through the supervisor via
   envelope-based RPC.
   This makes the supervisor a bottleneck — every file read, hash
   computation, and socket operation serializes through a single
   process.
   Moving I/O into the worker keeps the supervisor thin (routing
   only) and eliminates IPC overhead for I/O operations.
   Each worker has its own cap-std handles scoped to its
   directories.

3. **In-process host functions, not IPC.**
   XS host functions are direct C function calls from JS.
   There is no serialization, no pipe I/O, no nonce correlation.
   For a `readFile` call, the path goes from JS string → C
   string → cap-std → C string → JS string, all within one
   process.
   This is orders of magnitude faster than envelope-based RPC
   for high-frequency I/O.

4. **cap-std for capability-based I/O.**
   The Rust worker opens `Dir` handles at startup and provides
   them to JS as directory tokens.
   cap-std rejects path traversal and symlink escapes at the
   syscall level — the worker process itself is confined to its
   assigned directories, independent of any JS-level checks.

5. **Host compartment / guest compartment split.**
   The host compartment has access to I/O host functions.
   The guest compartment does not — it can only reach I/O through
   capabilities passed via CapTP.
   XS enforces this: the guest compartment's global does not
   include the host functions.
   This is the same architecture as today's SES workers, but with
   engine-level enforcement.

6. **Pre-compiled bytecode for Endo modules.**
   XS can compile JavaScript to bytecode at build time.
   This eliminates parse overhead at worker startup and ensures
   module availability without a runtime module loader.
   Debug builds preserve source positions for `xsbug`.

7. **Node.js workers remain for development.**
   The Rust/XS worker is a deployment target.
   During development, the existing Node.js worker with Chrome
   DevTools provides a better debugging experience.
   The supervisor already supports heterogeneous workers — no
   architectural change needed to run both.

8. **SharedArrayBuffer deferred.**
   The host layer could use SharedArrayBuffer + Atomics for
   zero-copy coordination between Rust and JS, or between
   workers.
   This is forbidden in guest compartments (SES policy) but
   technically possible in the host compartment.
   Deferred until profiling shows copy overhead matters.

## Known Gaps

- [ ] XS C API stability — verify that the compartment and
  ModuleSource APIs are stable across XS releases.
- [ ] `@endo/captp` on XS — verify that CapTP's full protocol
  (including HandledPromise) works under the `xs` condition.
- [ ] `xsbug` TCP adapter — evaluate effort to connect `xsbug`
  to the running worker for remote debugging.
- [ ] XS memory model — understand XS's garbage collector
  behavior under sustained worker loads (many compartments
  created and destroyed).
- [ ] Async I/O model — XS has a different event loop model
  than Node.js.
  Host functions that perform async I/O (network accept loops,
  streaming reads) need a Tokio ↔ XS promise bridge.

## Prompt

> I would like to discard this design and try another approach.
> It occurs to me that keeping the supervisor as a thin backbone
> for inter-worker communication is probably correct and that
> making it responsible for all I/O would become a bottleneck.
> This is not the migration path away from Node.js we need.
> Instead, we need a worker process in rust, using the same
> libraries, to provide I/O to an alternative JavaScript engine
> or possibly bindings to multiple engines, including Wasm.
> This would allow us to minimize copies and piping information
> between processes, even possibly using shared array buffers
> and atomics to coordinate between the @endo/platform API and
> the rust runtime environment.
>
> Then, the question becomes a choice of JavaScript engine.
> XS has native compartments and no JIT, so is generally more
> trustworthy, but slow and would require an intervention to be
> debuggable.
> V8 is very well established.
>
> I think we have to try XS simply because of Compartment
> support, as we can use that to hide host APIs from the guest
> program.

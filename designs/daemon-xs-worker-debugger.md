# XS Worker Debugger for Endo Rust

| | |
|---|---|
| **Created** | 2026-04-14 |
| **Updated** | 2026-04-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## Motivation

Endo workers run JavaScript inside XS machines managed by the Rust
supervisor.
When a guest formula misbehaves — infinite loops, wrong CapTP
messages, unexpected exceptions — the only recourse today is to
read worker logs after the fact.
There is no way to set breakpoints, step through code, inspect
variables, or pause a running worker.

XS has a built-in debug subsystem (`xsDebug.c`) that implements a
full stepping debugger with breakpoints, frame inspection, and
profiling.
It speaks an XML protocol ("xsbug") over sockets or pipes.
The Rust build compiles `xsDebug.c` but does **not** define
`mxDebug`, so all debug code paths are compiled out.

This design enables XS debugging in Endo by:

1. Activating `mxDebug` in the Rust build (conditionally, behind a
   cargo feature flag).
2. Replacing XS's socket/pipe debug transport with Rust host
   functions that route debug traffic through the existing worker
   bus envelope protocol.
3. Exposing the debugger as an Endo capability (`Debugger` exo) so
   that one worker (or the daemon itself) can debug another worker
   over CapTP.
4. Providing a web-facing API so that Chat or Familiar can drive
   the debugger from a UI.

### Use cases

- **Interactive debugging**: Set a breakpoint in a guest formula,
  step through code, inspect locals.
- **Post-mortem**: Break on exceptions to see the call stack and
  variable state at the throw site.
- **Profiling**: Collect CPU profiles from a running worker and
  export Chrome DevTools `.cpuprofile` files.
- **Remote control**: Debug a worker running on a self-hosted
  daemon from a local Familiar or Chat UI.

## Background: The xsbug Protocol

XS's debug protocol is XML-based, bidirectional, and
well-specified.
The existing reference implementation is in
`c/xsnap-pub/xsnap/xsbug-node/xsbug-machine.js`.

### Commands (client → VM)

| Command | XML | Purpose |
|---------|-----|---------|
| go | `<go/>` | Resume execution |
| step | `<step/>` | Step over |
| step-inside | `<step-inside/>` | Step into |
| step-outside | `<step-outside/>` | Step out |
| abort | `<abort/>` | Terminate |
| set-breakpoint | `<set-breakpoint path="..." line="..."/>` | Set breakpoint |
| clear-breakpoint | `<clear-breakpoint path="..." line="..."/>` | Clear breakpoint |
| clear-all-breakpoints | `<clear-all-breakpoints/>` | Clear all |
| set-all-breakpoints | `<set-all-breakpoints>...</set-all-breakpoints>` | Bulk set |
| select | `<select id="..."/>` | Select frame |
| toggle | `<toggle id="..."/>` | Expand property |
| start-profiling | `<start-profiling/>` | Begin CPU profile |
| stop-profiling | `<stop-profiling/>` | End CPU profile |
| script | `<script path="..." line="..."><![CDATA[...]]><script/>` | Eval script |

### Responses (VM → client)

| Element | Content |
|---------|---------|
| `<login>` | Machine name and tag |
| `<break>` | Breakpoint hit: path, line, context |
| `<frames>` | Call stack frames |
| `<local>` | Local variables with property trees |
| `<global>` | Global scope |
| `<log>` | Console output |
| `<bubble>` | Exception: name, value, path, line |
| `<eval>` | Script evaluation result |
| `<breakpoints>` | Current breakpoint set |
| `<files>` | Loaded source files |
| `<instruments>` | Metering/memory stats descriptions |
| `<samples>` | Instrument sample values (CSV) |
| `<pr>`, `<ps>`, `<pt>` | Profile records, samples, timestamps |

### Platform hooks

XS calls five platform functions for debug I/O.
The platform must implement all five:

```c
void fxConnect(txMachine* the);
void fxDisconnect(txMachine* the);
txBoolean fxIsConnected(txMachine* the);
void fxReceive(txMachine* the);
void fxSend(txMachine* the, txBoolean more);
```

`fxReceive` fills `the->debugBuffer` (with `debugOffset` bytes).
`fxSend` writes `the->echoBuffer` (`echoOffset` bytes).
The engine calls `fxDebugCommand(the)` from `fxRunDebugger(the)`
to process one round of debug I/O.

### Current state in Endo Rust

- `xsDebug.c` is compiled but `mxDebug` is **not** defined, so
  all debug code is behind `#ifdef mxDebug` and compiled out.
- `mxInstrument` is **not** defined either.
- `mxMetering` **is** defined (instruction counting works).
- `xsnap-platform.c` sets `mxUseDefaultDebug 1`, which provides
  no-op stubs for the debug hooks.
- The `XsMachine` FFI struct does not expose `debugBuffer`,
  `echoBuffer`, or `connection` fields to Rust.

## Architecture

### Option A: XML pass-through (recommended)

Route the raw XML debug protocol bytes through the envelope bus
as opaque payloads.
The Rust supervisor does not parse XML — it just ferries bytes
between XS's debug buffers and the bus.
The JS-side debugger client (in the daemon or a controlling
worker) parses the XML using a SAX parser, same as
`xsbug-machine.js`.

**Advantages:**
- Zero changes to xsDebug.c itself.
- The entire xsbug protocol works unchanged — breakpoints,
  stepping, profiling, variable inspection.
- XS engine upgrades get debug features for free.
- Small Rust surface area: just pipe bytes.

**Disadvantages:**
- XML parsing needed in the JS debugger client.
- The protocol is chatty (verbose XML), but debug sessions are
  low-frequency and human-speed.

### Option B: Host-function translation layer

Replace the XML protocol with Rust host functions
(`debugSetBreakpoint`, `debugStep`, etc.) that call into
`xsDebug.c` internals directly.

**Rejected** because:
- `xsDebug.c` internals are not public API — they parse XML
  commands in `fxDebugCommand` and produce XML responses.
  Bypassing the XML layer would require forking xsDebug.c or
  exposing internal functions.
- Loses profiling, instrument sampling, and future xsbug features.
- Much larger Rust surface area with no clear benefit.

### Option C: Replace XML entirely with JSON

Fork `xsDebug.c` to emit JSON instead of XML.

**Rejected** because:
- Massive fork divergence from upstream Moddable.
- Same information content, different syntax — not worth the cost.
- The XML is simple enough to parse with a streaming SAX parser.

## Design: Option A Details

### Layer 1: C platform hooks → Rust callbacks

#### Compile-time changes

Add a cargo feature `debug` that defines `mxDebug` and
`mxInstrument` when building XS:

```toml
# rust/endo/xsnap/Cargo.toml
[features]
debug = []
```

```rust
// build.rs — inside the cc::Build block
if cfg!(feature = "debug") {
    build.define("mxDebug", "1");
    build.define("mxInstrument", "1");
}
```

When the `debug` feature is off (default), everything compiles
exactly as today.
When on, XS activates its full debug subsystem.

#### Platform function implementations

Replace the default debug stubs in `xsnap-platform.c` with
implementations that call Rust via C-to-Rust callbacks:

```c
// xsnap-platform.c

#ifdef mxDebug

// Rust-provided callbacks (set at machine creation)
typedef void (*RustDebugSendFn)(
    void* context, const char* data, int length);
typedef int (*RustDebugRecvFn)(
    void* context, char* buffer, int capacity);
typedef int (*RustDebugIsReadableFn)(void* context);

static __thread RustDebugSendFn rust_debug_send = NULL;
static __thread RustDebugRecvFn rust_debug_recv = NULL;
static __thread RustDebugIsReadableFn rust_debug_readable = NULL;
static __thread void* rust_debug_context = NULL;
static __thread int rust_debug_connected = 0;

void fxSetDebugCallbacks(
    RustDebugSendFn send_fn,
    RustDebugRecvFn recv_fn,
    RustDebugIsReadableFn readable_fn,
    void* context
) {
    rust_debug_send = send_fn;
    rust_debug_recv = recv_fn;
    rust_debug_readable = readable_fn;
    rust_debug_context = context;
    rust_debug_connected = (send_fn != NULL) ? 1 : 0;
}

void fxConnect(txMachine* the) {
    // Connection is managed by Rust — no socket needed.
}

void fxDisconnect(txMachine* the) {
    rust_debug_connected = 0;
}

txBoolean fxIsConnected(txMachine* the) {
    return rust_debug_connected;
}

txBoolean fxIsReadable(txMachine* the) {
    if (!rust_debug_connected || !rust_debug_readable)
        return 0;
    return rust_debug_readable(rust_debug_context);
}

void fxReceive(txMachine* the) {
    if (rust_debug_connected && rust_debug_recv) {
        int n = rust_debug_recv(
            rust_debug_context,
            the->debugBuffer,
            sizeof(the->debugBuffer) - 1);
        if (n < 0) {
            the->debugOffset = 0;
        } else {
            the->debugOffset = n;
        }
    } else {
        the->debugOffset = 0;
    }
    the->debugBuffer[the->debugOffset] = 0;
}

void fxSend(txMachine* the, txBoolean more) {
    if (rust_debug_connected && rust_debug_send) {
        rust_debug_send(
            rust_debug_context,
            the->echoBuffer,
            the->echoOffset);
    }
}

#endif /* mxDebug */
```

#### Rust side

In `powers/debug.rs`, implement the callback functions and a
thread-local ring buffer pair for debug I/O:

```rust
// rust/endo/xsnap/src/powers/debug.rs

use std::collections::VecDeque;
use std::sync::Mutex;

/// Thread-local debug I/O buffers.
/// - `outbound`: XS → Rust (debug responses/events from VM)
/// - `inbound`: Rust → XS (debug commands to VM)
struct DebugBuffers {
    outbound: VecDeque<u8>,
    inbound: VecDeque<u8>,
}

static DEBUG_BUFFERS: Mutex<Option<DebugBuffers>> =
    Mutex::new(None);

/// Called by XS (via C callback) when it wants to send debug
/// output (XML responses).
unsafe extern "C" fn rust_debug_send(
    _ctx: *mut c_void, data: *const c_char, length: c_int,
) {
    let bytes = std::slice::from_raw_parts(
        data as *const u8, length as usize);
    let mut bufs = DEBUG_BUFFERS.lock().unwrap();
    if let Some(ref mut b) = *bufs {
        b.outbound.extend(bytes);
    }
}

/// Called by XS (via C callback) when it wants to read debug
/// input (XML commands).
unsafe extern "C" fn rust_debug_recv(
    _ctx: *mut c_void, buffer: *mut c_char, capacity: c_int,
) -> c_int {
    let mut bufs = DEBUG_BUFFERS.lock().unwrap();
    if let Some(ref mut b) = *bufs {
        let n = std::cmp::min(
            b.inbound.len(), capacity as usize);
        let dst = std::slice::from_raw_parts_mut(
            buffer as *mut u8, n);
        for (i, byte) in b.inbound.drain(..n).enumerate() {
            dst[i] = byte;
        }
        n as c_int
    } else {
        0
    }
}

/// Called by XS to check if debug input is available.
unsafe extern "C" fn rust_debug_readable(
    _ctx: *mut c_void,
) -> c_int {
    let bufs = DEBUG_BUFFERS.lock().unwrap();
    match *bufs {
        Some(ref b) if !b.inbound.is_empty() => 1,
        _ => 0,
    }
}
```

### Layer 2: Envelope bus verbs

Two new envelope verbs carry debug traffic between the daemon
and workers:

| Verb | Direction | Payload | Nonce |
|------|-----------|---------|-------|
| `"debug"` | daemon → worker | Raw xsbug XML bytes (command) | 0 |
| `"debug"` | worker → daemon | Raw xsbug XML bytes (response) | 0 |

The verb is the same in both directions — handle rewriting
distinguishes sender.
This matches the pattern of `"deliver"` for CapTP traffic.

#### Supervisor routing

The Rust supervisor already routes by verb.
Debug messages use the same handle-rewrite logic as `deliver`:
the supervisor replaces `env.handle` with the sender's handle
so the daemon knows which worker the debug traffic belongs to.

No new supervisor code beyond recognizing `"debug"` as a
pass-through verb (same as `"deliver"`).

#### Worker-side integration

The XS worker event loop (in `rust/endo/xsnap/src/worker_io.rs`
or `lib.rs`) gains a check for debug readability:

```rust
// In the worker's message pump loop:
loop {
    // Check if debug input is pending
    if debug_is_readable() {
        // Calls fxRunDebugger(machine) which triggers
        // fxReceive → rust_debug_recv → reads inbound buffer
        // fxSend → rust_debug_send → writes outbound buffer
        machine.run_debugger();
    }

    // Flush any debug output to the bus
    if let Some(data) = debug_drain_outbound() {
        transport.send_envelope(
            daemon_handle, "debug", &data, 0);
    }

    // Normal envelope processing
    match transport.try_recv_raw_envelope() {
        Some(env) => {
            if env.verb == "debug" {
                debug_push_inbound(&env.payload);
                machine.run_debugger();
                // Flush responses
                if let Some(data) = debug_drain_outbound() {
                    transport.send_envelope(
                        daemon_handle, "debug", &data, 0);
                }
            } else {
                // Normal deliver/command handling
            }
        }
        None => { /* block on next envelope */ }
    }
}
```

#### Daemon-side bus handler

In `packages/daemon/src/bus-daemon-rust-xs.js` (or equivalent),
the daemon registers a handler for `"debug"` envelopes from
workers:

```js
// When a "debug" envelope arrives from worker W:
registerSession(workerHandle, {
  onDebug(payload) {
    // payload is raw xsbug XML bytes
    // Route to the DebugSession for this worker
    const session = debugSessions.get(workerHandle);
    if (session) {
      session.feedXml(payload);
    }
  },
});
```

### Layer 3: DebugSession — xsbug client in JS

A `DebugSession` object in the daemon parses xsbug XML and
provides a structured JS API.
It is the JS equivalent of `xsbug-machine.js` but adapted for
the Endo environment.

```
packages/daemon/src/debug-session.js
```

The session maintains:
- SAX parser state (a minimal XML parser — no need for the
  Saxophone npm dep; a ~100-line state machine suffices for
  xsbug's simple XML subset)
- Current breakpoint set
- Last break location (path, line)
- Last frames, locals, globals snapshots
- Profile accumulator
- Pending command callbacks (for request/response correlation)

#### Feed cycle

1. Raw XML bytes arrive from the bus (`feedXml(bytes)`).
2. The SAX parser emits element events.
3. Element handlers update session state and resolve any pending
   promises (e.g., `getFrames()` resolves when `<frames>` arrives).
4. Break events emit to registered listeners.

#### Command methods

Each method writes XML to the outbound buffer and returns a
promise that resolves when the corresponding response arrives:

```js
session.go()              // → Promise<void>
session.step()            // → Promise<BreakInfo>
session.stepIn()          // → Promise<BreakInfo>
session.stepOut()         // → Promise<BreakInfo>
session.setBreakpoint(path, line)    // → Promise<void>
session.clearBreakpoint(path, line)  // → Promise<void>
session.clearAllBreakpoints()        // → Promise<void>
session.getFrames()       // → Promise<Frame[]>
session.getLocals()       // → Promise<Property[]>
session.getGlobals()      // → Promise<Property[]>
session.selectFrame(id)   // → Promise<LocalInfo>
session.toggleProperty(id) // → Promise<Property[]>
session.evaluate(source)  // → Promise<string>
session.startProfiling()  // → Promise<void>
session.stopProfiling()   // → Promise<Profile>
session.abort()           // → Promise<void>
```

### Layer 4: Debugger exo — CapTP capability

The daemon exposes a `Debugger` exo for each debug-enabled
worker.
This is a remotable object that any CapTP peer (another worker,
the gateway, Chat, Familiar) can call.

```js
// packages/daemon/src/debugger.js

/** @import { Debugger } from './types.js' */

const DebuggerI = M.interface('Debugger', {
  go: M.call().returns(M.undefined()),
  step: M.call().returns(M.record()),
  stepIn: M.call().returns(M.record()),
  stepOut: M.call().returns(M.record()),
  setBreakpoint: M.call(M.string(), M.nat()).returns(M.undefined()),
  clearBreakpoint: M.call(M.string(), M.nat()).returns(M.undefined()),
  clearAllBreakpoints: M.call().returns(M.undefined()),
  getFrames: M.call().returns(M.array()),
  getLocals: M.call().returns(M.array()),
  getGlobals: M.call().returns(M.array()),
  selectFrame: M.call(M.string()).returns(M.record()),
  evaluate: M.call(M.string()).returns(M.string()),
  startProfiling: M.call().returns(M.undefined()),
  stopProfiling: M.call().returns(M.record()),
  abort: M.call().returns(M.undefined()),
  followBreaks: M.call().returns(M.remotable()),
  help: M.call().returns(M.string()),
});
```

#### followBreaks

Returns an async iterator (a `Reader<BreakEvent>`) that yields
each time the VM hits a breakpoint or exception.
This is the subscription mechanism for the UI:

```js
const breaks = await E(debugger).followBreaks();
for await (const event of breaks) {
  // event: { path, line, reason, frames, locals }
  renderBreakpoint(event);
}
```

The daemon creates a `Debugger` exo when a worker is spawned
with debug mode enabled.
It is stored as a formula and given a pet name in the host's
namespace (e.g., `@debug:worker-42`).

### Layer 5: Gateway and UI integration

#### Chat / Familiar

The Debugger exo is a normal CapTP capability.
Chat or Familiar can receive it via the same mechanisms as any
other capability:

1. The user names the debug capability:
   `endo name my-debug @debug:worker-42`
2. A Chat agent can receive it via `E(powers).lookup('my-debug')`.
3. Familiar can render a debug panel backed by `E(ref).getFrames()`
   etc.

#### Web debugger panel

A weblet-based debug UI renders:
- Source code with breakpoint gutters
- Call stack (frames)
- Variables (locals/globals with expandable property trees)
- Step/continue/pause controls
- Profiling flame chart (using `stopProfiling()` data)

The weblet communicates with the daemon via the gateway
WebSocket.
Each UI action is a single `E(debugger).method()` call.

### Layer 6: Debug-mode worker spawning

Workers are not debuggable by default.
A new spawn option enables debug mode:

```js
// In the daemon's worker spawning code:
const worker = await provideWorker(formula, {
  debug: true,  // Enable xsbug protocol for this worker
});
```

When `debug: true`:
1. The Rust supervisor sets up the debug callback hooks before
   creating the XS machine.
2. The daemon creates a `Debugger` exo and formula for the worker.
3. The worker's event loop includes debug I/O polling.

When `debug: false` (default):
1. No debug callbacks are installed.
2. No `fxRunDebugger` calls in the event loop.
3. Zero overhead — identical to today's behavior.

A CLI command enables debug mode:

```
endo debug <worker-pet-name>
```

This could either restart the worker in debug mode or (if the
worker is already running with debug compiled in) attach a
debugger to it dynamically.

## Envelope protocol changes

### New verb: `debug`

| Field | Value |
|-------|-------|
| handle | Worker handle (supervisor-rewritten) |
| verb | `"debug"` |
| payload | Raw xsbug XML bytes |
| nonce | 0 |

Same routing as `"deliver"` — the supervisor passes it through
with handle rewriting.

### New verb: `debug-attach` (optional, Phase 2)

For dynamic attach to already-running workers:

| Field | Value |
|-------|-------|
| handle | 0 (to supervisor control) |
| verb | `"debug-attach"` |
| payload | CBOR `{workerHandle: H}` |
| nonce | request nonce |

Response: `"debug-attached"` or `"error"`.

## Host function changes

### New host function: `debugPoll`

Registered on debug-enabled workers only.
Called from JS bootstrap to check for pending debug commands:

```js
// In the worker bootstrap, before the main eval loop:
if (typeof debugPoll === 'function') {
  // Drain any pending debug commands (e.g., set-all-breakpoints
  // sent before the first eval).
  debugPoll();
}
```

This is a thin wrapper around `fxRunDebugger(the)` that also
flushes the outbound debug buffer.

## File inventory

### New files

| File | Purpose |
|------|---------|
| `rust/endo/xsnap/src/powers/debug.rs` | Debug I/O buffers, C callbacks, host functions |
| `packages/daemon/src/debug-session.js` | xsbug XML SAX parser and structured API |
| `packages/daemon/src/debugger.js` | Debugger exo (CapTP-remotable debug controller) |

### Modified files

| File | Change |
|------|--------|
| `rust/endo/xsnap/Cargo.toml` | Add `debug` feature flag |
| `rust/endo/xsnap/build.rs` | Conditionally define `mxDebug`, `mxInstrument` |
| `rust/endo/xsnap/xsnap-platform.h` | Replace `mxUseDefaultDebug` with custom debug block |
| `rust/endo/xsnap/xsnap-platform.c` | Implement `fxConnect`/`fxDisconnect`/`fxReceive`/`fxSend` via Rust callbacks |
| `rust/endo/xsnap/src/powers/mod.rs` | Add `pub mod debug;` |
| `rust/endo/xsnap/src/lib.rs` | Register debug powers; expose `run_debugger()` on Machine; integrate debug polling in worker event loop |
| `rust/endo/xsnap/src/ffi.rs` | Add `fxRunDebugger`, `fxSetDebugCallbacks`, `fxDescribeInstrumentation`, `fxSampleInstrumentation` FFI declarations |
| `rust/endo/xsnap/src/worker_io.rs` | Add debug envelope handling in message pump |
| `rust/endo/xsnap/src/host_aliases.js` | Add `debugPoll` alias |
| `rust/endo/src/inproc.rs` | Route `"debug"` verb same as `"deliver"` |
| `rust/endo/src/proc.rs` | Route `"debug"` verb same as `"deliver"` |
| `packages/daemon/src/bus-daemon-rust-xs.js` | Handle `"debug"` envelopes; create DebugSession per worker |
| `packages/daemon/src/bus-xs-core.js` | Add `sendDebug(payload)` helper |
| `packages/daemon/src/daemon.js` | Debugger formula type; `provideDebugger()` |
| `packages/daemon/src/types.d.ts` | Add Debugger, DebugSession, BreakEvent, Frame, Property types |

## Implementation phases

### Phase 1: Compile-time debug support

1. Add `debug` cargo feature to `Cargo.toml`.
2. Update `build.rs` to define `mxDebug` and `mxInstrument`
   conditionally.
3. Replace `mxUseDefaultDebug` in `xsnap-platform.h` with `0`.
4. Implement `fxConnect`/`fxDisconnect`/`fxIsConnected`/
   `fxIsReadable`/`fxReceive`/`fxSend` in `xsnap-platform.c`
   using the Rust callback pattern.
5. Add `fxSetDebugCallbacks` export.
6. Add FFI declarations to `ffi.rs`.
7. Create `powers/debug.rs` with buffer management and callback
   implementations.
8. Add `Machine::run_debugger()` method.
9. **Test**: Build with `cargo build --features debug`.
   Create a machine, install debug callbacks, call
   `run_debugger()` — verify `<login>` XML appears in the
   outbound buffer.

### Phase 2: Bus protocol integration

1. Add `"debug"` verb routing in `proc.rs` and `inproc.rs` (same
   as `"deliver"` pass-through).
2. Update worker event loop to poll debug I/O and handle `"debug"`
   envelopes.
3. Add `debugPoll` host function and alias.
4. **Test**: Spawn a debug-enabled worker, send
   `<set-breakpoint path="test" line="1"/>` via the bus, verify
   the worker processes it without crashing.

### Phase 3: DebugSession JS client

1. Write `debug-session.js` with SAX parser and structured API.
2. Add `"debug"` envelope handler in `bus-daemon-rust-xs.js`.
3. **Test**: Unit test the SAX parser against captured xsbug XML.
   Integration test: spawn debug worker, set breakpoint, eval
   code, verify break event arrives.

### Phase 4: Debugger exo and formula

1. Write `debugger.js` with `makeExo` and `M.interface`.
2. Add `debugger` formula type to `daemon.js`.
3. Add `followBreaks` async iterator.
4. Wire `debug: true` option into worker provisioning.
5. **Test**: Provision a debug worker, look up its debugger
   capability, call `step()` / `getFrames()` over CapTP.

### Phase 5: CLI and UI

1. Add `endo debug <name>` CLI command.
2. Build a weblet debug panel (source view, frames, locals,
   controls).
3. Integrate profiling output (Chrome DevTools format).

## Design decisions

1. **Cargo feature flag, not runtime toggle.**
   `mxDebug` is a compile-time flag in XS.
   We cannot enable it at runtime without recompiling.
   The `debug` cargo feature keeps the default binary lean
   (no debug overhead) while allowing debug builds.
   A future enhancement could ship both binaries and select at
   spawn time.

2. **XML pass-through, not translation.**
   The xsbug protocol is stable, well-tested, and complete.
   Translating to JSON or a custom format would duplicate effort,
   introduce bugs, and lose features.
   The XML stays internal to the `DebugSession` — the CapTP
   Debugger exo presents a clean JS API.

3. **Thread-local buffers with mutex.**
   XS machines are single-threaded.
   Each worker thread has its own debug buffers.
   The mutex is for safety but should be uncontended in practice
   since only the worker thread and the bus I/O thread touch it,
   and they alternate.

4. **`"debug"` verb on the existing bus.**
   No new transport, no new pipes, no new sockets.
   Debug traffic rides the same envelope protocol as CapTP,
   keeping the supervisor simple.

5. **Debugger as an Endo capability.**
   This is the Endo way: everything is a capability.
   The debugger can be granted, delegated, and revoked like any
   other capability.
   A guest could debug its own sub-workers if given the
   debugger capability.

6. **`followBreaks` as async iterator.**
   Matches the Endo `followMessages` / `followNameChanges`
   pattern.
   The UI subscribes once and renders each break event as it
   arrives.

7. **No changes to xsDebug.c.**
   The entire debug subsystem is stock Moddable XS.
   We only change the platform layer (`xsnap-platform.c`/`.h`)
   which is already our custom code.

## Known limitations

- **Debug builds are larger and slower.**
  `mxDebug` adds bookkeeping to every bytecode instruction.
  Debug workers should only be used when actively debugging.

- **No hot-attach to running workers.**
  Phase 1 requires the worker to be spawned with debug mode.
  Dynamic attach (Phase 2's `debug-attach` verb) requires the
  worker to already have been compiled with `mxDebug`.
  This means the entire `endor` binary must be the debug variant.

- **SAX parser in SES.**
  The `DebugSession` SAX parser runs inside a locked-down SES
  environment.
  It must be written in Jessie-compatible JS (no regex literals
  in some contexts, no `eval`).
  The xsbug XML subset is simple enough for a hand-written
  state machine parser.

- **Profile data size.**
  CPU profiles can be large (megabytes).
  The `stopProfiling()` response must be buffered entirely before
  returning to the caller.
  For very long profiles, streaming would be better but is
  deferred.

## Augmentation: Break on Uncaught Exceptions Only

### Problem

The xsbug protocol supports a single exception breakpoint mode:
`path="exceptions" line="0"` sets `the->breakOnExceptionsFlag`,
which causes the debugger to break on **every** `throw` —
including exceptions that will be caught by a `try/catch` block.

This is noisy and unusable in practice.
Endo code (and any code using promises, eventual-send, or
defensive patterns) throws and catches exceptions constantly as
part of normal control flow.
A useful debugger needs a mode that breaks only on exceptions
that will propagate uncaught.

### Analysis of XS internals

The `XS_CODE_THROW` bytecode handler in `xsRun.c` calls
`fxDebugThrow` **before** calling `fxJump` (the longjmp to the
catch handler):

```c
mxCase(XS_CODE_THROW)
    mxException = *mxStack;
#ifdef mxDebug
    fxDebugThrow(the, C_NULL, 0, "throw");
#endif
    fxJump(the);
```

`fxDebugThrow` in `xsDebug.c` is extremely simple:

```c
void fxDebugThrow(txMachine* the, txString path,
                  txInteger line, txString message)
{
    if (the->debugEval)
        return;
    if (fxIsConnected(the) && (the->breakOnExceptionsFlag))
        fxDebugLoop(the, path, line, message);
    else {
        // ... report exception ...
    }
}
```

It checks only `breakOnExceptionsFlag` — a single boolean.
There is no awareness of whether the exception will be caught.

**However**, at the time `fxDebugThrow` is called, the
information needed to answer "will this exception be caught?"
is fully available:

- `the->firstJump` is the head of a linked list of active
  exception handlers (`txJump` structs).
- Each `txJump` has a `flag` field:
  - `flag == 0` → C-level `mxTry/mxCatch` (host boundary)
  - `flag == 1` → JS-level `XS_CODE_CATCH` (JS `try/catch`)
- If any `txJump` in the chain has `flag == 1`, the exception
  **will be caught** by a JavaScript `try/catch` block.
- If no `txJump` in the chain has `flag == 1`, the exception
  will either be caught only by a C host boundary (which
  typically translates to an unhandled-exception abort) or will
  be entirely uncaught.

This means the augmentation can be done **entirely within
`fxDebugThrow`** with no changes to the bytecode interpreter,
the exception mechanism, or the throw/catch lifecycle.

### Proposed change to xsDebug.c

Add a second flag to `txMachine`:

```c
// In xsAll.h, within the #ifdef mxDebug block of txMachine:
txBoolean breakOnExceptionsFlag;
txBoolean breakOnUncaughtExceptionsFlag;  // NEW
```

Modify `fxDebugThrow`:

```c
void fxDebugThrow(txMachine* the, txString path,
                  txInteger line, txString message)
{
    if (the->debugEval)
        return;
    if (!fxIsConnected(the))
        goto report;

    if (the->breakOnExceptionsFlag) {
        // Break on ALL exceptions (existing behavior).
        fxDebugLoop(the, path, line, message);
        return;
    }

    if (the->breakOnUncaughtExceptionsFlag) {
        // Break only if no JS-level catch handler exists.
        txJump* jump = the->firstJump;
        while (jump) {
            if (jump->flag) {
                // A JS try/catch will catch this.
                goto report;
            }
            jump = jump->nextJump;
        }
        // No JS catch found — this exception is uncaught.
        fxDebugLoop(the, path, line, message);
        return;
    }

report:
    {
        txSlot* frame = the->frame;
        while (frame && !path) {
            txSlot* environment = mxFrameToEnvironment(frame);
            if (environment->ID != XS_NO_ID) {
                path = fxGetKeyName(the, environment->ID);
                line = environment->value.environment.line;
            }
            frame = frame->next;
        }
        fxReportException(the, path, line, "%s", message);
    }
}
```

### Protocol extension

#### New pseudo-breakpoint

Add a new special breakpoint path `"uncaughtExceptions"`:

```xml
<!-- Set: break only on uncaught exceptions -->
<set-breakpoint path="uncaughtExceptions" line="0"/>

<!-- Clear: stop breaking on uncaught exceptions -->
<clear-breakpoint path="uncaughtExceptions" line="0"/>

<!-- Bulk set supports both modes -->
<set-all-breakpoints>
  <breakpoint path="uncaughtExceptions" line="0"/>
  <breakpoint path="start" line="0"/>
  <!-- ... other breakpoints ... -->
</set-all-breakpoints>
```

In `fxSetBreakpoint` / `fxClearBreakpoint`:

```c
if ((theID == 0) && (theLine == 0)) {
    if (!c_strcmp(thePath, "exceptions")) {
        the->breakOnExceptionsFlag = 1;
        return;
    }
    if (!c_strcmp(thePath, "uncaughtExceptions")) {
        the->breakOnUncaughtExceptionsFlag = 1;
        return;
    }
}
```

The two modes are mutually exclusive in practice (setting one
should clear the other), but the code above allows both to be
set — `breakOnExceptionsFlag` takes priority since it is checked
first in `fxDebugThrow`.

#### Debugger exo API

The CapTP `Debugger` exo gets a method to control exception
break mode:

```js
const DebuggerI = M.interface('Debugger', {
  // ...existing methods...
  setExceptionBreakMode: M.call(
    M.or(M.literal('none'),
         M.literal('all'),
         M.literal('uncaught')),
  ).returns(M.undefined()),
});
```

The `DebugSession` translates:
- `'none'` → clear both `exceptions` and `uncaughtExceptions`
- `'all'` → set `exceptions`, clear `uncaughtExceptions`
- `'uncaught'` → clear `exceptions`, set `uncaughtExceptions`

### Why backtracking is not needed

When `fxDebugThrow` is called, the VM has not yet jumped to the
catch handler — the throw site's full stack and locals are still
live.
The debugger breaks at the throw point with the complete
execution state available for inspection.

If the firstJump walk determines the exception is caught, the
debugger simply does not break, and `fxJump` proceeds normally.
There is no need to "undo" anything because execution has not
left the throw site yet.

This is the critical architectural advantage: XS calls
`fxDebugThrow` **before** `fxJump`, not after.
The decision to break or not can be made at throw time with
zero cost if the answer is "don't break."

### Edge cases

#### Promises

`Promise.reject()` and unhandled rejections do not go through
`XS_CODE_THROW`.
XS reports unhandled rejections via `fxCheckUnhandledRejections`
at the end of the run loop.
This augmentation does not affect promise rejection behavior —
that requires a separate mechanism (already handled by XS's
existing unhandled-rejection reporting).

#### Re-throw

If a `catch` block re-throws the exception, `XS_CODE_THROW`
fires again for the re-throw.
The firstJump walk will correctly reflect the new handler chain
at the re-throw site.

#### `finally` without `catch`

`try { ... } finally { ... }` (no catch) compiles to an
`XS_CODE_CATCH` that re-throws after the finally block.
The `txJump.flag` for the finally handler is `1` (same as
catch), so the walk will see it as "caught."
This is arguably wrong — the exception will propagate after
the finally block runs.

**Mitigation**: The compiler could use a distinct flag value for
finally-only handlers (e.g., `flag == 2`).
Alternatively, the debugger could accept this as a minor
false negative — the exception is temporarily "caught" by the
finally block even though it will be re-thrown.
In practice, `try/finally` without `catch` is rare enough
that this is acceptable for v1.

#### Nested C host boundaries

Some exceptions are caught by C-level `mxTry/mxCatch` in host
functions or the platform layer.
These have `flag == 0` and are not considered "JS catch" by the
walk.
This means the debugger will break on exceptions caught by host
boundaries — which is usually correct, since host boundaries
catching exceptions often indicates an error condition.

### Files to modify

| File | Change |
|------|--------|
| `c/moddable/xs/sources/xsAll.h` | Add `breakOnUncaughtExceptionsFlag` to txMachine |
| `c/moddable/xs/sources/xsDebug.c` | Modify `fxDebugThrow`, `fxSetBreakpoint`, `fxClearBreakpoint` |
| `packages/daemon/src/debug-session.js` | Add `setExceptionBreakMode` command |
| `packages/daemon/src/debugger.js` | Add `setExceptionBreakMode` to Debugger exo |

### Implementation phase

This is a self-contained addition to Phase 1 of the main
debugger design (compile-time debug support).
The XS source changes are minimal (< 30 lines) and localized
to `xsDebug.c` and `xsAll.h`.
The protocol extension is backwards-compatible — older xsbug
clients that don't send `uncaughtExceptions` breakpoints will
see no change in behavior.

## Prompt

> Please analyze the XS source and propose a plan in designs/
> that would allow endor (rust + XS) to run in a debug mode with
> stepping commands. It should be possible to remote control the
> debugger for one worker from another worker, and to create a
> protocol over CapTP so that the debugger can be driven from a
> web application like Chat or app like Familiar. XS has some
> hooks for a debug protocol that looks like streaming XML.
> Consider either working with that as-is from Rust or altering
> XS, if necessary, to use platform hook functions instead. We can
> add features to the worker bus protocol and host methods to
> workers.
>
> Research an augmentation to XS and the XS debugger protocol
> that would permit us to have a debugger mode that steps over
> caught exceptions.

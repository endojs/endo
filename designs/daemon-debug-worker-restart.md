# Debug Worker Restart

| | |
|---|---|
| **Created** | 2026-04-17 |
| **Updated** | 2026-04-17 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The existing debugger design
([daemon-xs-worker-debugger](daemon-xs-worker-debugger.md))
supports hot-attaching to a **running** worker.
This is useful for inspecting live state, but it cannot catch
initialization code, module-level side effects, or the first
crank of message handling — by the time the debugger attaches,
those have already executed.

A developer debugging a formula needs to be able to say
"restart this worker from its snapshot with the debugger active
from the very first instruction" so that:

1. The XS engine is paused before executing any code.
2. The debugger must be attached and issue a `<go/>` command
   before the engine takes its first steps.
3. Breakpoints can be set before any code runs — including
   module-level initialization and the first message dispatch.

This surfaces as a single method on the Endo host:

```js
const debugSession = await E(host).debugWorker('my-worker');
```

## Design

### User-facing API

`debugWorker(petNameOrPath)` is a method on `EndoHost` (and
transitively on `EndoGuest` if the guest has been granted
debug authority).
It accepts a pet name or path identifying a worker.

The method:

1. Suspends the named worker (snapshot to CAS).
2. Resumes the worker with debug mode enabled.
3. Returns a `Debugger` capability (the same exo defined in
   the existing debugger design).

The returned `Debugger` is attached and paused at the XS
`<login>` break — the machine has been restored from the
snapshot but has not executed any code.
The caller must issue `go()`, `step()`, or set breakpoints
before the worker will process messages.

```js
const dbg = await E(host).debugWorker('@main');
await E(dbg).setBreakpoint('my-module.js', 42);
await E(dbg).go();
// Worker resumes, hits breakpoint at line 42
const frames = await E(dbg).getFrames();
```

### Why suspend/resume instead of in-place restart?

A worker's identity is its handle on the capability bus.
Its durable state is its XS heap snapshot in the CAS.
Suspending takes a snapshot and tears down the machine;
resuming restores from that snapshot into a fresh machine.

Restarting in debug mode is exactly this: suspend, then resume
with `debug_enable()` called before machine restoration.
The worker keeps its handle, its bus identity, its pending
messages in the inbox, and its metering state.
No new mechanism is needed — this composes two existing
operations (suspend and debug-aware resume).

### Envelope protocol

No new verbs are required.
The operation is sequenced entirely by the JS manager using
existing verbs:

1. **Suspend**: manager sends `suspend` control verb →
   worker streams snapshot → supervisor receives `suspended`
   with CAS hash.
2. **Resume with debug flag**: manager sends a new control
   verb `debug-resume` with the worker's handle.
   The Rust supervisor resumes the worker with
   `debug_enable()` called on the worker thread before
   machine restoration.
3. **Debug attach**: the resumed worker's XS machine calls
   `fxConnect()` during restoration, which activates the
   debug connection (since `debug_enable()` was called).
   XS emits a `<login>` response and enters the debug
   loop — paused, waiting for commands.
4. **Debugger exo**: the manager receives the `<login>` via
   a `debug` envelope, creates a `Debugger` exo, and returns
   it to the caller.

#### New control verb: `debug-resume`

| Field | Value |
|-------|-------|
| handle | 0 (control) |
| verb | `"debug-resume"` |
| payload | CBOR map: `{"handle": <worker_handle>}` |
| nonce | request nonce |

The supervisor handles this identically to a normal resume
triggered by message delivery to a suspended worker, except:

- The worker thread calls `debug_enable()` before creating
  or restoring the XS machine.
- The supervisor responds with `"debug-resumed"` (nonce
  matches) once the worker is alive and the initial
  `<login>` debug envelope has been received.

The manager can also set the debug flag on a suspended
worker before sending the first message that triggers resume.
This avoids a dedicated `debug-resume` verb — instead, a
`debug-flag` verb sets a per-handle flag in the supervisor,
and the normal resume path checks it.

**Chosen approach: `debug-flag` + normal resume.**

This is simpler because it does not require duplicating the
resume logic.
The supervisor gains a `debug_flags: HashSet<Handle>` that
is checked during resume.

| Field | Value |
|-------|-------|
| handle | 0 (control) |
| verb | `"debug-flag"` |
| payload | CBOR map: `{"handle": <worker_handle>}` |
| nonce | 0 |

No response needed — the flag is fire-and-forget.
The subsequent resume (triggered by the first message to the
suspended handle) will observe it.

### Rust supervisor changes

#### `Supervisor` struct

```rust
/// Handles that should resume with debug enabled.
debug_flags: RwLock<HashSet<Handle>>,
```

#### Resume path

In both `resume_shared` and `resume_process`, before
spawning the worker thread:

```rust
let debug = sup.take_debug_flag(handle);
// ... in the worker thread:
if debug {
    xsnap::powers::debug::debug_enable();
}
// Then create/restore the machine.
```

`take_debug_flag` atomically removes the handle from
`debug_flags` and returns whether it was present.

#### Control verb handler

In `handle_control_message`:

```rust
"debug-flag" => {
    if let Ok(target) =
        codec::decode_handle_request(&msg.envelope.payload)
    {
        sup.set_debug_flag(target);
    }
}
```

### JS manager changes

#### EndoHost interface

```js
debugWorker: M.call(NameOrPathShape).returns(M.promise()),
```

#### Implementation

```js
const debugWorker = async petNameOrPath => {
  const namePath = namePathFrom(petNameOrPath);
  assertNamePath(namePath);

  // Resolve the pet name to a worker formula.
  const workerId = await E(directory).identify(...namePath);
  if (workerId === undefined) {
    throw new TypeError(
      `Unknown pet name: ${q(petNameOrPath)}`,
    );
  }

  // Get the worker's bus handle.
  const workerHandle = await getWorkerHandle(workerId);

  // 1. Suspend the worker (snapshot to CAS).
  await requestSuspend(workerHandle);

  // 2. Set the debug flag so the resume path enables debug.
  sendControlVerb('debug-flag', { handle: workerHandle });

  // 3. Attach a debug session that will receive the <login>
  //    when the worker resumes.
  const session = createDebugSession(workerHandle);

  // 4. Send a no-op message to trigger resume.
  //    The worker's inbox already has this message; the
  //    supervisor will resume the worker from the snapshot.
  sendControlVerb('debug-ping', { handle: workerHandle });

  // 5. Wait for the <login> from the resumed worker.
  await session.waitForLogin();

  // 6. Create and return the Debugger exo.
  return makeDebuggerExo(session, workerHandle);
};
```

The `requestSuspend` helper sends the `suspend` control verb
and waits for the `suspended` acknowledgement.

The `debug-ping` is a lightweight message to the worker's
handle that triggers the supervisor's resume path.
Its verb can be `"ping"` or any benign verb — the worker
will process it after the debugger releases it.
Alternatively, if the worker's inbox already has pending
messages, no ping is needed — the next `route_message` call
for that handle will trigger resume.

#### Help text

```js
"debugWorker": "debugWorker(petNamePath) -> Promise<Debugger>\n"
  + "Restart a worker in debug mode.\n"
  + "Suspends the worker, then resumes it with the XS debugger\n"
  + "active from the first instruction. Returns a Debugger\n"
  + "capability. The worker is paused until the debugger issues\n"
  + "a go() or step() command.",
```

### Control powers (daemon_bootstrap.js)

The XS manager sends `debug-flag` using the existing
`sendControlRequest` pattern:

```js
const debugFlag = async workerHandle => {
  const buf = encodeMeterHandlePayload(workerHandle);
  sendEnvelope(0, 'debug-flag', buf, 0);
};
```

This is added to `controlPowers` alongside the metering
functions.

### Interaction with metering

When a worker is restarted in debug mode, its metering state
is preserved through the suspend/resume cycle (Phase 6 of
the metering design).
The debug session does not affect metering — computrons are
still counted during debugger-driven stepping.
This is correct: debugging a worker should not grant it
unlimited computation.

If the caller wants to temporarily disable metering during a
debug session, they can use the existing `meterSetQuota` to
set measurement mode (hard_limit = 0).

### Interaction with CapTP

The worker's CapTP connections are torn down during suspend
and re-established during resume.
This is the existing behavior — `debugWorker` does not change
it.
The caller should expect that any live CapTP references to
the worker will be broken and must be re-obtained after the
worker resumes.

The returned `Debugger` exo is itself a CapTP capability and
can be stored in the pet store, passed to other agents, or
used from Chat/Familiar.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-xs-worker-debugger](daemon-xs-worker-debugger.md) | Requires: debug infrastructure, `Debugger` exo, `DebugSession` |
| [daemon-xs-worker-snapshot](daemon-xs-worker-snapshot.md) | Requires: suspend/resume via CAS snapshots |
| [daemon-xs-worker-metering](daemon-xs-worker-metering.md) | Composes: meter state preserved across debug restart |

## Implementation phases

### Phase 1: Rust supervisor debug flag

1. Add `debug_flags: RwLock<HashSet<Handle>>` to `Supervisor`.
2. Add `set_debug_flag(handle)` and `take_debug_flag(handle)`
   methods.
3. Add `"debug-flag"` handler in `handle_control_message`.
4. In `resume_shared` and `resume_process`, check
   `take_debug_flag` and call `debug_enable()` before machine
   creation.
5. Add codec function `decode_handle_request` (already exists).
6. **Test**: set debug flag, verify `take_debug_flag` returns
   true once and false thereafter.

### Phase 2: JS manager `debugWorker`

1. Add `debugWorker` to `HostInterface` guard.
2. Implement `debugWorker` async function: suspend → set
   debug flag → create debug session → trigger resume →
   wait for login → return debugger exo.
3. Add to host object assembly and `makeExo` wrapper.
4. Add help text.
5. Add `debugFlag` to `controlPowers` in
   `daemon_bootstrap.js`.
6. **Test**: call `debugWorker` on a running worker, verify
   the returned `Debugger` is connected and the worker is
   paused.

### Phase 3: Chat integration

1. Add `/debug-restart <worker>` command (or extend existing
   `/debug` to handle the restart case).
2. The command calls `E(host).debugWorker(workerName)` and
   opens the debugger panel with the returned session.
3. **Test**: manual — `/debug-restart @main` opens the
   debugger panel with the worker paused at login.

## Design decisions

1. **Compose suspend + debug-aware resume.**
   No new restart primitive is needed.
   Suspend/resume already exists; adding a debug flag to the
   resume path is minimal.
   This keeps the supervisor simple — it does not need to
   understand "restart" as a concept.

2. **Debug flag on the supervisor, not per-message.**
   The flag is set on the handle before resume, not carried
   in each message.
   This avoids changing the envelope protocol for normal
   message delivery.

3. **Worker is paused at `<login>`, not at first user code.**
   XS enters the debug loop immediately after `fxConnect`
   during machine creation/restoration.
   The `<login>` break is before any bytecode executes.
   This gives the caller a window to set breakpoints before
   any code runs.

4. **CapTP connections are broken.**
   This is inherent to suspend/resume.
   The alternative — keeping connections alive during a
   machine restart — would require a proxy layer that does
   not exist.
   The cost is acceptable: debug sessions are developer
   tools, not production operations.

5. **Method name: `debugWorker`, not `restartWorkerInDebugMode`.**
   Concise and discoverable.
   The "restart" is an implementation detail — from the
   user's perspective, they are debugging a worker.

## Prompt

> It should be possible to restart a worker in debug mode, so
> that a debugger must be attached in order for the XS engine
> to be instructed to take its first steps. This should surface
> as a method on the Endo agent that names the worker to restart
> in debug mode, like debugWorker('@main').

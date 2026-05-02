# XS Worker Metering: Measurement, Quotas, and Rate Limiting

| | |
|---|---|
| **Created** | 2026-04-17 |
| **Updated** | 2026-04-17 |
| **Author** | Kris (prompted) |
| **Status** | **Complete** |

## Status

All seven phases implemented and tested.

**Phase 1 — Machine metering API** (`xsnap/src/lib.rs`):
`begin_metering`, `end_metering`, `current_meter`, `set_meter`,
`run_promise_jobs_metered`. Thread-local `CRANK_LIMIT` and
`METERING_ABORTED` state. 9 metering unit tests.

**Phase 2 — Crank-level metering** (`xsnap/src/lib.rs`):
Reactive pump loop resets meter per crank, uses
`run_promise_jobs_metered`, sends `meter-report` envelope on
completion or termination.

**Phase 3 — Supervisor MeterState** (`src/supervisor.rs`,
`src/endo.rs`, `src/codec.rs`):
`MeterState` with Measurement/Quota/RateLimited modes.
Control verbs: `meter-report`, `meter-query`, `meter-reset`,
`meter-set-quota`, `meter-set-rate`, `meter-refill`.
11 codec round-trip tests.

**Phase 4 — Admission gate** (`src/supervisor.rs`):
`should_deliver` check in `route_message`. Messages buffered
in `pending_delivery` when budget insufficient. `drain_pending`
called after report/refill/quota changes.

**Phase 5 — Rate limiting** (`src/types.rs`):
Lazy `refill()` on `RateLimit`. `ready_time()` for scheduling.
Tokio timer wake-up in `route_message`.

**Phase 6 — Snapshot integration** (`src/supervisor.rs`):
`SuspendedWorker.meter` field preserves `MeterState` across
suspend/resume. `restore_meter` on resume.

**Phase 7 — JS manager integration**
(`xsnap/src/daemon_bootstrap.js`):
`controlPowers` extended with `meterQuery`, `meterReset`,
`meterSetQuota`, `meterSetRate`, `meterRefill`.
Response handling for `meter-state`, `meter-reset-ack`,
`meter-refill-ack` in `handleCommand`.

**C helpers** (`xsnap/xsnap-platform.c`):
Custom `fxAbort` (longjmp for recoverable aborts instead of
`exit()`). `fxRunPromiseJobsMetered` (raw setjmp guard).
`fxGetCurrentMeter`, `fxSetCurrentMeter`.

## What is the Problem Being Solved?

XS workers execute JavaScript in an environment with no intrinsic
resource limits.
A misbehaving or expensive computation can monopolize a worker
thread indefinitely.
The daemon needs three related capabilities:

1. **Measurement** — observe how many computation steps
   ("computrons") a worker has consumed, for accounting, billing,
   and diagnostics.
2. **Quota enforcement** — cap a worker's execution so messages
   are only delivered when the worker has sufficient budget,
   and terminate the worker as hung if a single crank exceeds
   a hard limit.
3. **Rate limiting** — accumulate budget over time at a
   configurable rate, clamped by a burst limit, so workers
   get a steady stream of computation capacity without being
   able to stockpile unbounded budget.

## Key Insight: Admission Control Eliminates Embargo

An earlier revision of this design proposed embargoing a worker's
outbound messages during each crank and discarding them if the
crank was aborted by quota exhaustion.
This is complex: it requires buffering in the bridge layer,
crank-boundary delimiters, and reasoning about partial effects.

A simpler model avoids embargo entirely:

- **Hard per-crank limit**: a safety net that terminates the
  worker if a single crank exceeds a fixed step threshold.
  This protects against infinite loops.
  A crank that hits this limit is treated as a fatal bug —
  the worker is terminated, not paused.
- **Admission control**: the supervisor only delivers a message
  when the worker's remaining budget exceeds the hard limit.
  Since any crank that completes normally used fewer steps
  than the limit, the budget is always sufficient to cover
  the crank's cost.
  Messages buffer in the inbox until enough budget accumulates.

Because messages are only delivered when the budget can cover
the worst case, a normally-completing crank never needs its
output rolled back.
The only case where output could be partial is the hard-limit
termination, which destroys the worker anyway.

## Existing XS Metering Internals

### Step counter

Every XS bytecode dispatch increments `the->meterIndex` by
`XS_BUILTIN_METERING` (1 << 14).
The upper 16 bits of `meterIndex` give the human-readable
"computron" count; the lower bits provide sub-step granularity.

### Metering callback

`fxBeginMetering(the, callback, interval)` installs a callback
that fires every *interval* increments.
The callback receives the current `meterIndex >> 16` and returns
a boolean: true = continue, false = abort with
`XS_TOO_MUCH_COMPUTATION_EXIT`.

### Getter / setter

`fxGetCurrentMeter(the)` and `fxSetCurrentMeter(the, value)`
read and write `meterIndex` directly.

### Existing C worker

The C `xsnap-worker` uses a per-crank model:
`xsBeginCrank` resets the counter to 0 and sets a global limit;
`xsEndCrank` reads the counter and clears the limit.
The response includes `{ compute, allocate, currentHeapCount }`.

### Rust FFI

`ffi.rs` declares `fxBeginMetering` and `fxEndMetering`.
`mxMetering` is enabled in `build.rs` (line 123).
No safe Rust API exists on `Machine`.

## Design

### Three metering modes

| Mode | Behavior |
|------|----------|
| **Measurement** | Steps counted per crank, accumulated in supervisor. No enforcement. Default for all workers. |
| **Quota** | Worker has a step budget. Messages buffered until budget >= hard limit. Worker terminated if single crank exceeds hard limit. |
| **Rate-limited** | Quota mode plus automatic budget accumulation over time at a configured rate, clamped by a burst ceiling. |

### Layered architecture

```
┌─────────────────────────────────────────────────────┐
│  Supervisor  (tokio)                                │
│  ┌───────────────────────────────────────────────┐  │
│  │  Per-worker MeterState                        │  │
│  │  accumulated: u64        (lifetime total)     │  │
│  │  budget: u64             (current balance)    │  │
│  │  hard_limit: u64         (per-crank ceiling)  │  │
│  │  rate: Option<RateLimit> (refill policy)      │  │
│  └───────────────────────────────────────────────┘  │
│       ▲ meter-report  │ admission gate              │
│       │               ▼                             │
│   [only deliver when budget >= hard_limit]          │
│                                                     │
├─────────────────────────────────────────────────────┤
│  XS Machine Thread                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │  fxBeginMetering(callback, interval)          │  │
│  │  meterIndex  (raw step counter)               │  │
│  │  Metering callback → terminate on hard limit  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Machine API additions (xsnap crate)

```rust
impl Machine {
    /// Enable metering with the given check interval.
    /// The callback is installed for the lifetime of the machine.
    pub fn begin_metering(&self, interval: u32);

    /// Disable metering and clear state.
    pub fn end_metering(&self);

    /// Read the current raw meterIndex (computrons = value >> 16).
    pub fn current_meter(&self) -> u64;

    /// Reset the meter to a given value (typically 0 at crank start).
    pub fn set_meter(&self, value: u64);
}
```

The metering callback is a C function pointer stored in a
thread-local.
It reads a thread-local `crank_limit: u64`; if the meter exceeds
the limit (and limit > 0), returns false.

```rust
thread_local! {
    static CRANK_LIMIT: Cell<u64> = Cell::new(0);
}

unsafe extern "C" fn metering_callback(
    _the: *mut ffi::XsMachine,
    index: u32,
) -> i32 {
    CRANK_LIMIT.with(|limit| {
        let lim = limit.get();
        if lim > 0 && u64::from(index) > lim {
            0  // abort — worker will be terminated
        } else {
            1  // continue
        }
    })
}
```

### Crank lifecycle

A "crank" is the processing of one inbound envelope plus all
resulting promise jobs until quiescence.

```
admission gate:
    if budget < hard_limit → hold message in inbox
    deliver message to worker

crank executes:
    set_meter(0)
    set CRANK_LIMIT = hard_limit  (safety net)

    dispatch envelope → handle_envelope()
    drain promise jobs (reactive pump)

    if metering callback aborted:
        → worker is terminated (hung / infinite loop)
        → supervisor marks worker dead
        → no further messages delivered

    steps = current_meter() >> 16
    send meter-report(steps) to supervisor
    clear CRANK_LIMIT

supervisor receives meter-report:
    accumulated += steps
    budget -= steps
    if rate limiting: schedule next refill check
```

### Hard limit as termination, not pause

When the metering callback fires, the crank exceeded the hard
limit.
This is treated as a fatal condition: the worker is destroyed.

Rationale:
- A crank that exceeds the hard limit is either an infinite
  loop or a computation so expensive it shouldn't run.
- The XS machine state after an abort is uncertain — promise
  queues may be partially drained, shared closures may be in
  inconsistent states.
- Terminating is the only safe option.
  The supervisor can re-create the worker from its last
  snapshot if needed (suspend/resume infrastructure).

For the worker thread, hitting the hard limit means:
1. `XS_TOO_MUCH_COMPUTATION_EXIT` fires via `longjmp`.
2. The worker sends a final `meter-report` with
   `outcome: "terminated"`.
3. The worker exits its main loop.
4. The supervisor receives the report and cleans up.

### Admission control

The supervisor gates message delivery on budget:

```rust
fn should_deliver(&self, meter: &MeterState) -> bool {
    match meter.mode {
        MeterMode::Measurement => true,  // always deliver
        MeterMode::Quota | MeterMode::RateLimited => {
            meter.budget >= meter.hard_limit
        }
    }
}
```

When a message arrives for a worker that lacks sufficient budget:
- The message stays in the worker's inbox
  (`tokio::sync::mpsc` channel).
- The routing loop skips this worker, similar to how it skips
  suspended workers today.
- When budget is replenished (explicit refill or rate-limit
  tick), the supervisor resumes draining the inbox.

This is the key simplification: because the worker always has
at least `hard_limit` steps of budget when a crank begins,
any crank that completes normally (under the hard limit) is
fully paid for.
No embargo, no rollback, no buffering of outbound messages.

### Meter report envelope

After each crank, the worker sends a control envelope to
handle 0:

```
verb: "meter-report"
payload: CBOR map {
    "handle":  <worker_handle>,
    "steps":   <u64 computrons this crank>,
    "outcome": "ok" | "terminated",
}
```

The supervisor uses this to:
1. Subtract `steps` from `budget`.
2. Add `steps` to `accumulated`.
3. On `"terminated"`: clean up the worker.

### Supervisor MeterState

```rust
pub enum MeterMode {
    /// Steps counted but no enforcement.
    Measurement,
    /// Fixed budget, messages gated on budget >= hard_limit.
    Quota,
    /// Budget accumulates over time at a configured rate.
    RateLimited,
}

pub struct RateLimit {
    /// Computrons added per second.
    pub rate: u64,
    /// Maximum budget that can accumulate (burst ceiling).
    pub burst: u64,
    /// Timestamp of last refill calculation.
    pub last_refill: Instant,
}

pub struct MeterState {
    pub mode: MeterMode,
    /// Total computrons consumed across all cranks (lifetime).
    pub accumulated: u64,
    /// Current step budget (decremented per crank).
    pub budget: u64,
    /// Maximum steps allowed in a single crank.
    /// Exceeding this terminates the worker.
    pub hard_limit: u64,
    /// Rate-limit configuration (only for RateLimited mode).
    pub rate_limit: Option<RateLimit>,
}
```

### Rate limiting

Rate limiting builds on the quota model by adding automatic
budget accumulation.
The budget grows over time at `rate` computrons per second,
clamped at the `burst` ceiling.

```rust
fn refill(&mut self) {
    if let Some(ref mut rl) = self.rate_limit {
        let now = Instant::now();
        let elapsed = now.duration_since(rl.last_refill);
        let earned = (elapsed.as_secs_f64() * rl.rate as f64) as u64;
        self.budget = (self.budget + earned).min(rl.burst);
        rl.last_refill = now;
    }
}
```

The supervisor calls `refill()` before checking the admission
gate.
This is a lazy calculation — no timers needed.
The budget is recomputed on demand when:
- A new message arrives for the worker.
- A `meter-query` verb is received.
- The routing loop polls the worker's readiness.

The burst ceiling prevents a long-idle worker from stockpiling
unbounded budget.
A worker that has been idle for an hour gets at most `burst`
steps, not `rate * 3600`.

#### Ready time

The supervisor can compute the earliest time at which a worker
will accept another message:

```rust
fn ready_time(&self) -> Option<Instant> {
    match self.mode {
        MeterMode::Measurement => None,  // always ready
        MeterMode::Quota => {
            if self.budget >= self.hard_limit {
                None  // ready now
            } else {
                None  // never, until explicit refill
            }
        }
        MeterMode::RateLimited => {
            if self.budget >= self.hard_limit {
                return None;  // ready now
            }
            let deficit = self.hard_limit - self.budget;
            let rl = self.rate_limit.as_ref()?;
            let seconds = deficit as f64 / rl.rate as f64;
            Some(rl.last_refill + Duration::from_secs_f64(seconds))
        }
    }
}
```

This allows the supervisor to efficiently schedule wake-ups
for rate-limited workers rather than polling.

### Message bus control verbs

All verbs target handle 0 (supervisor control).
Payloads are CBOR maps.

#### `meter-query`

Request the current metering state of a worker.

Request:
```cbor
{ "handle": <worker_handle> }
```

Response:
```cbor
{
    "handle": <worker_handle>,
    "accumulated": <u64>,
    "budget": <u64>,
    "hard_limit": <u64>,
    "mode": "measurement" | "quota" | "rate-limited",
    "rate": <u64 | null>,
    "burst": <u64 | null>
}
```

#### `meter-reset`

Reset the accumulated step counter to zero.
Does not affect budget, quota, or rate limit.

Request:
```cbor
{ "handle": <worker_handle> }
```

Response:
```cbor
{ "handle": <worker_handle>, "accumulated": 0 }
```

#### `meter-set-quota`

Enable quota mode with a given hard limit and initial budget.
Disables rate limiting if previously set.

Request:
```cbor
{
    "handle": <worker_handle>,
    "hard_limit": <u64>,
    "budget": <u64>
}
```

Passing `hard_limit: 0` returns the worker to measurement mode.

#### `meter-set-rate`

Enable rate-limited mode.
Sets the hard limit, rate, and burst ceiling.
Budget begins accumulating immediately.

Request:
```cbor
{
    "handle": <worker_handle>,
    "hard_limit": <u64>,
    "rate": <u64>,
    "burst": <u64>
}
```

#### `meter-refill`

Add steps to a worker's budget (one-time top-up).
Works in both quota and rate-limited modes.
Budget is clamped to `burst` in rate-limited mode, unclamped
in quota mode.

Request:
```cbor
{
    "handle": <worker_handle>,
    "amount": <u64>
}
```

Response includes the new budget after refill.

#### `meter-report` (worker → supervisor)

Sent by the XS thread after each crank.
Not a control verb in the request sense — it flows on the
outbound path from worker to supervisor.

```cbor
{
    "handle": <worker_handle>,
    "steps": <u64>,
    "outcome": "ok" | "terminated"
}
```

### Reactive pump integration

The reactive pump loop in `lib.rs` changes minimally.
Metering is installed once at machine creation:

```rust
machine.begin_metering(METERING_INTERVAL);
```

Each crank:

```rust
// Before dispatch:
machine.set_meter(0);
// CRANK_LIMIT is set from hard_limit (communicated via
// meter-budget envelope or a fixed configuration).

// Dispatch + reactive pump (existing code, unchanged)
// ...

// After pump quiesces:
let steps = machine.current_meter() >> 16;
CRANK_LIMIT.with(|c| c.set(0));
send_meter_report(steps, "ok");
```

If `XS_TOO_MUCH_COMPUTATION_EXIT` fires:

```rust
// setjmp caught the longjmp from metering abort.
let steps = machine.current_meter() >> 16;
send_meter_report(steps, "terminated");
break 'outer;  // exit main loop — worker is dead
```

### Per-crank hard limit communication

The supervisor communicates the hard limit to the worker.
Since the hard limit rarely changes (typically set once), the
simplest approach is a `meter-config` envelope sent once at
worker startup or when the limit changes:

```
verb: "meter-config"
payload: { "hard_limit": <u64> }
```

The worker stores this in a thread-local and uses it as
`CRANK_LIMIT` for every crank.
No per-crank budget envelope needed — the admission gate
in the supervisor handles budget accounting.

### Worker states with metering

```
                  ┌──────────┐
           ┌─────│  Active   │◄──────────────┐
           │     └────┬─────┘                │
           │          │ crank completes       │ refill /
           │          │ meter-report(ok)      │ rate tick
           │          ▼                       │
           │   budget -= steps                │
           │   accumulated += steps           │
           │          │                       │
           │   budget >= hard_limit?          │
           │    yes │         no              │
           │        │          │              │
           │        ▼          ▼              │
           │   [deliver    ┌──────────┐       │
           │    next msg]  │ Waiting  │───────┘
           │               │ (budget) │
           │               └──────────┘
           │
      hard limit exceeded
           │
           ▼
     ┌──────────┐
     │  Dead    │   (worker terminated)
     └──────────┘
```

The "Waiting" state is not a new supervisor state — it simply
means the admission gate blocks delivery.
Messages accumulate in the inbox channel.
The worker thread is idle, blocked on `recv_raw_envelope`.

### Measurement-only mode (default)

When `mode` is `Measurement`:
- Metering callback always returns true (limit = 0 means
  no enforcement).
- Steps are counted and reported after each crank.
- The supervisor accumulates `accumulated` steps.
- No admission gating, no budget tracking.
- Zero overhead except for the metering callback (which
  runs every *interval* steps and immediately returns true).

The metering interval can be set high (e.g., 10000) to
minimize callback overhead in measurement-only mode.

## Dependencies

| Design | Relationship |
|--------|-------------|
| `daemon-endor-architecture.md` | Parent: defines worker platforms |
| `daemon-xs-worker-snapshot.md` | Sibling: suspend/resume must preserve meter state |
| `daemon-rust-xs-performance.md` | Sibling: reactive pump loop integration |

## Phased Implementation

### Phase 1: Machine metering API

Add safe Rust wrappers on `Machine` for `fxBeginMetering`,
`fxEndMetering`, `fxGetCurrentMeter`, `fxSetCurrentMeter`.
Add a `metering_callback` C function with thread-local limit.
Add unit tests: create machine, begin metering, eval a loop,
verify step count > 0, set a low limit, verify abort.

Files: `rust/endo/xsnap/src/ffi.rs`, `rust/endo/xsnap/src/lib.rs`

### Phase 2: Crank-level metering in the pump loop

Wrap each crank in `set_meter(0)` / read meter after quiesce.
Handle `XS_TOO_MUCH_COMPUTATION_EXIT` via `setjmp`/`longjmp`.
Send `meter-report` envelope after each crank.
Add `meter-config` envelope for hard-limit communication.
On metering abort: send `meter-report(terminated)` and exit
the main loop.

Files: `rust/endo/xsnap/src/lib.rs`,
`rust/endo/xsnap/xsnap-platform.c`

### Phase 3: Supervisor MeterState and control verbs

Add `MeterState` to per-worker state in the supervisor.
Implement `meter-query`, `meter-reset`, `meter-set-quota`,
`meter-set-rate`, `meter-refill` control verbs.
Process `meter-report`: decrement budget, accumulate steps.
On `meter-report(terminated)`: clean up dead worker.

Files: `rust/endo/src/supervisor.rs`, `rust/endo/src/endo.rs`,
`rust/endo/src/codec.rs`, `rust/endo/src/types.rs`

### Phase 4: Admission gate

Add budget check to the routing loop before delivering
messages.
When `budget < hard_limit`, skip the worker (message stays
in inbox).
For rate-limited workers, compute `ready_time` and schedule
a wake-up via `tokio::time::sleep_until` so the routing loop
re-checks the worker when its budget is sufficient.
Integration tests: set quota below hard limit, verify messages
buffer; refill, verify delivery resumes.

Files: `rust/endo/src/supervisor.rs`, `rust/endo/src/endo.rs`

### Phase 5: Rate limiting

Add `RateLimit` to `MeterState`.
Implement lazy refill calculation.
Implement `meter-set-rate` verb.
Add `ready_time` scheduling to the routing loop.
Integration tests: set rate, verify messages are delivered
at the expected cadence.

Files: `rust/endo/src/supervisor.rs`, `rust/endo/src/endo.rs`,
`rust/endo/src/codec.rs`

### Phase 6: Snapshot integration

Preserve `MeterState` (accumulated, budget, hard_limit, mode,
rate config) across suspend/resume.
Include meter state in `SuspendedWorker`.
On resume, recompute `last_refill` to avoid crediting idle
time during suspension.

Files: `rust/endo/src/supervisor.rs`, `rust/endo/src/endo.rs`

### Phase 7: JS manager integration

Expose metering verbs to the JS manager layer so the
daemon's formula-level code can set quotas, rates, and
query meters via the message bus.
Add `meterQuery`, `meterReset`, `setQuota`, `setRate`,
`refill` methods to the worker management interface.

Files: `rust/endo/xsnap/src/daemon_bootstrap.js`

## Design Decisions

1. **Admission control instead of embargo.**
   By ensuring the worker has `>= hard_limit` budget before
   delivering a message, any normally-completing crank is
   fully paid for.
   No need to buffer, roll back, or discard outbound messages.
   The only partial-effect case (hard-limit termination) is
   fatal anyway.
   This eliminates the most complex part of the earlier design.

2. **Hard limit as termination, not pause.**
   A crank that exceeds the hard limit is treated as a hung
   worker, not a budget exhaustion event.
   The machine state after a metering abort is unreliable
   (partially-drained promise queues, inconsistent closures).
   Termination is the only safe response.
   The worker can be re-created from its last snapshot.

3. **Lazy rate-limit refill.**
   Budget accumulation is computed on demand (when a message
   arrives or a query is made), not via a background timer.
   This avoids timer overhead for idle workers and gives
   exact results.
   The `ready_time` calculation lets the supervisor schedule
   a single wake-up rather than polling.

4. **Burst ceiling prevents budget hoarding.**
   A rate-limited worker's budget is clamped at `burst`,
   preventing a long-idle worker from accumulating an
   arbitrarily large balance.
   This ensures that even after a long idle period, the
   worker can only process a bounded burst of messages
   before returning to the steady-state rate.

5. **Budget as pre-payment, not post-payment.**
   The budget represents *available* steps, not a credit
   limit.
   Steps are subtracted after each crank.
   Messages are only delivered when the budget can cover
   the worst case (hard limit).
   This means the actual cost of a crank may be much less
   than the hard limit, leaving budget for the next crank.

6. **Measurement-only as default.**
   Metering is always on (callback installed at machine
   creation) but with limit = 0 (no enforcement).
   This means step counts are always available.
   The callback overhead at interval = 10000 is negligible
   (one function call per ~10000 bytecode dispatches).

7. **meter-config envelope for hard-limit, not per-crank.**
   The hard limit rarely changes.
   Sending it once (at worker startup or on change) avoids
   the overhead of a per-crank budget envelope.
   The admission gate lives entirely in the supervisor —
   the worker only needs the hard limit for the safety-net
   callback.

## Known Gaps and TODOs

- [ ] Determine the right default metering interval for
      measurement-only mode (1 vs 1000 vs 10000).
      Lower intervals give finer-grained counts but cost
      more callback overhead.
- [ ] Memory metering: XS tracks `allocatedSpace` and
      `currentHeapCount` — these could be included in
      meter reports and optionally enforced.
- [ ] Nested calls: if worker A calls worker B via CapTP
      sync call, A's meter is paused while waiting (A's XS
      thread is blocked on recv).
      The accounting is naturally correct — A only pays for
      its own computation — but this should be documented.
- [ ] What hard_limit value is appropriate?
      Too low: legitimate expensive cranks get killed.
      Too high: infinite loops take a long time to detect.
      Probably configurable per worker with a sensible default
      (e.g., 10M computrons ~= a few seconds of wall time).
- [ ] Should the supervisor attempt to snapshot a worker
      before terminating it on hard-limit violation?
      This would allow forensic analysis but risks hanging
      if the snapshot itself is expensive.
- [ ] Rate-limit time source: `Instant::now()` is monotonic
      but not preserved across daemon restarts.
      On restart, `last_refill` should be reset to "now"
      to avoid crediting offline time.

## Prompt

> I would like to add support for metering, both in the sense of
> measuring, and optionally in the sense of enforcing a quota. An
> XS worker should be able to measure the number of steps it took
> and there should be verbs in the message bus for querying the
> accumulated steps, resetting the number of steps, and setting and
> refilling quotas. Workers should support a mode where they are
> suspended when they are over quota, with pending messages buffered
> until they are refilled. This may be complex since a message might
> be delivered and not reach quiesence before being terminated. For
> quotas to work, a worker needs to be in a mode where its output
> is embargoed until it quiesces.

> It just occurred to me that there is a simpler way to do quota
> based metering, avoiding the need to embargo anything. We can
> instead set a hard limit on the number of steps a worker can take
> after a message is delivered, after which the worker is considered
> hung and simply terminated. This protects against infinite loops.
> It also tells us how much overhead the worker needs to have in its
> quota before it will accept another message. Messages will buffer
> until they have accumulated enough quota. This also suggests
> another metering mode: rate limiting. We can track the time at
> which the worker will accept another message based on a rate at
> which it accumulates steps toward its quota. This value will be
> clamped based on a burst limit, so that the worker cannot
> accumulate steps toward its quota beyond a certain amount of time.

# EndoClaw: Core Heartbeat Scheduler

|             |                            |
|-------------|----------------------------|
| **Created** | 2026-03-03                 |
| **Updated** | 2026-03-18                 |
| **Author**  | Kris Kowal (prompted)      |
| **Author**  | Joshua T Corbin (evolving) |
| **Status**  | In Progress                |
| **Parent**  | [endoclaw](endoclaw.md)    |

## Status

Prototype implementation lives in `packages/genie/src/interval/`
- only Phase 1 scope for now, pending review and progression
- core scheduling logic is complete with 25 passing tests (allegedly)

Going forward this facility can graduate out to a proper @endo/xxx package, or
maybe just move into @endo/daemon more generally.

### Implemented (in `@endo/genie`)

- `scheduler.js` — `makeIntervalScheduler()` factory returning
  `IntervalScheduler` / `IntervalControl` facet pair
- `persistence.js` — atomic file persistence (write-then-rename)
- `types.js` — JSDoc typedefs and constants
- `index.js` — re-exports
- Start-to-start tick scheduling via `setTimeout`
- `resolve()` / `reschedule()` tick response with exponential backoff
- Tick timeout with auto-resolve and warning
- Startup recovery from persisted entries with missed-tick coalescing
- Host-controlled limits (`maxActive`, `minPeriodMs`)
- `pause()` / `resume()` / `revoke()` lifecycle
- `cancel()` / `setPeriod()` per-interval management
- `list()` / `listAll()` enumeration

### Not yet implemented

- Daemon integration (formula type, `extractDeps`, maker table) — Phase 1 remainder
- Tick delivery as mail messages (uses `onTick` callback for now) — Phase 2
- `TickResponse` as a proper exo with `M.interface()` guards — Phase 2
- Host `makeIntervalScheduler()` method on `HostInterface` — Phase 4
- CLI commands — Phase 4
- Full SES/harden compatibility (currently uses `harden` as identity in tests) — deferred to daemon graduation

### Deviations from design

- **Tick delivery**: ticks are delivered via an `onTick` callback rather than
  the daemon mail system. This is intentional for the genie-package prototype;
  mail integration comes in Phase 2 when the code moves to `@endo/daemon`.
- **No formula persistence**: the scheduler does not create daemon formulas.
  Interval entries are persisted to a configurable directory. Formula
  integration is deferred to daemon graduation.
- **`harden` calls**: the implementation calls `harden()` throughout, but
  in the genie package context `harden` may be the SES global or a no-op
  polyfill depending on runtime.

## What is the Problem Being Solved?

SES lockdown removes `setTimeout` and `setInterval` from the global scope.
An agent running inside a locked-down worker has **no mechanism** for
scheduling future execution.  Without a heartbeat capability, agents are
purely reactive — they can only respond to messages they receive.

The heartbeat is the core "there" that makes an agent tick. 
A claw needs a consistent, reliable pulse so it can:

- **Drive its main loop:** Check for pending work, run housekeeping, and
  advance its internal state on a regular cadence.
- **Power downstream scheduling:** Higher-level scheduling policies
  (daily briefings, reminders, monitoring intervals) are implemented
  *by the agent* on top of its heartbeat — the heartbeat itself carries
  no cron or policy semantics.
- **Retry transient failures:** Re-attempt an operation after a backoff
  delay without blocking the main loop.

This design provides a core interval/ticker facility — similar to Go's
`time.Ticker` or Tokio's `time::Interval` — that delivers consistent
start-to-start wakeups as messages.  It is **not** a general-purpose cron
scheduler.  Any policy decisions about "when to run what" are the agent's
concern, not the scheduler's.

## Design

### Capability Shape

The `IntervalScheduler` follows the caretaker pattern:
- the agent holds the scheduler facet
- the host retains the `IntervalControl` facet.

Both are facets of a single `interval-scheduler` exo.

Each tick delivers a `TickResponse` capability that the agent uses to
signal completion or request a retry.

```ts
interface IntervalScheduler {
  makeInterval(
    label: string,
    periodMs: number,
    opts?: {
      firstDelayMs?: number;   // default 0 (immediate first tick)
      tickTimeoutMs?: number;  // default periodMs / 2
    },
  ): Promise<Interval>;
  list(): Promise<IntervalEntry[]>;
  help(): string;
}

interface Interval {
  label(): string;
  period(): number;            // current periodMs
  setPeriod(periodMs: number): Promise<void>;
  cancel(): Promise<void>;
  info(): IntervalEntry;
  help(): string;
}

interface IntervalControl {
  setMaxActive(n: number): void;
  setMinPeriodMs(ms: number): void;
  pause(): void;
  resume(): void;
  revoke(): void;
  listAll(): Promise<IntervalEntry[]>;
  help(): string;
}

interface TickResponse {
  resolve(): void;
  reschedule(): void;
}

type IntervalEntry = {
  id: string;
  label: string;
  periodMs: number;
  firstDelayMs: number;
  tickTimeoutMs: number;
  nextTickAt: number;        // epoch ms of next scheduled tick
  createdAt: number;         // epoch ms when created
  tickCount: number;         // total ticks fired
  status: 'active' | 'paused' | 'cancelled';
};
```

### Interface Guards

```js
const IntervalEntryShape = harden({
  id: M.string(),
  label: M.string(),
  periodMs: M.number(),
  firstDelayMs: M.number(),
  tickTimeoutMs: M.number(),
  nextTickAt: M.number(),
  createdAt: M.number(),
  tickCount: M.number(),
  status: M.or('active', 'paused', 'cancelled'),
});

export const IntervalSchedulerInterface = M.interface('EndoIntervalScheduler', {
  makeInterval: M.callWhen(
    M.string(),
    M.number(),
    M.opt(M.splitRecord({}, {
      firstDelayMs: M.number(),
      tickTimeoutMs: M.number(),
    })),
  ).returns(M.remotable('Interval')),
  list: M.callWhen().returns(M.arrayOf(IntervalEntryShape)),
  help: M.call().returns(M.string()),
});

export const IntervalInterface = M.interface('EndoInterval', {
  label: M.call().returns(M.string()),
  period: M.call().returns(M.number()),
  setPeriod: M.callWhen(M.number()).returns(M.undefined()),
  cancel: M.callWhen().returns(M.undefined()),
  info: M.call().returns(IntervalEntryShape),
  help: M.call().returns(M.string()),
});

export const IntervalControlInterface = M.interface('EndoIntervalControl', {
  setMaxActive: M.call(M.number()).returns(M.undefined()),
  setMinPeriodMs: M.call(M.number()).returns(M.undefined()),
  pause: M.call().returns(M.undefined()),
  resume: M.call().returns(M.undefined()),
  revoke: M.call().returns(M.undefined()),
  listAll: M.callWhen().returns(M.arrayOf(IntervalEntryShape)),
  help: M.call().returns(M.string()),
});

export const TickResponseInterface = M.interface('EndoTickResponse', {
  resolve: M.call().returns(M.undefined()),
  reschedule: M.call().returns(M.undefined()),
});
```

### How It Works

1. **Host creates the capability pair.**  The host calls
   `E(host).makeIntervalScheduler(agentName, options)` which formulates
   an `interval-scheduler` formula and returns the
   `IntervalScheduler` / `IntervalControl` pair.  The host grants the
   `IntervalScheduler` facet to the agent and retains `IntervalControl`.

2. **Agent creates an interval.**  The agent calls
   `E(scheduler).makeInterval('heartbeat', 30 * 60 * 1_000) // 30m heartbeat example`.
   The scheduler:
   - validates the request against the host's limits
   - persists the interval entry to disk
   - arms a `setTimeout` for the first tick
   - with the default `firstDelayMs: 0`, the first tick fires immediately

3. **Tick fires.**  When the `setTimeout` callback runs
   - the daemon creates a `TickResponse` capability (a one-shot exo) and
     delivers an `interval-tick` message to the agent's inbox
   - the message carries a reference to the `TickResponse`
   - the scheduler immediately arms a timeout (`tickTimeoutMs`) for the tick's
     deadline.

4. **Agent processes the tick.**  The agent's message loop sees the
   `interval-tick` message through `followMessages()`.  It executes its
   heartbeat logic and then calls either:
   - `E(tickResponse).resolve()` — the tick succeeded (or failed
     terminally).  The scheduler advances `nextTickAt` to the next
     period boundary and arms the next `setTimeout`.
   - `E(tickResponse).reschedule()` — the tick failed transiently.
     The scheduler re-fires after an exponential backoff delay (see
     [Resolve/Reschedule Semantics](#resolveschedule-semantics)).

5. **Tick times out.**  If the agent neither resolves nor reschedules
   before `tickTimeoutMs` elapses:
   - the scheduler auto-resolves the tick, logs a warning, and advances to the
     next period
   - the `TickResponse` becomes inert — subsequent calls are no-ops

6. **Daemon restarts.**  On startup, the daemon
   - reads all persisted interval entries
   - computes any missed ticks
   - for any missed ticks, delivers a single catch-up message
   - arms all active intervals (see [Startup Recovery](#startup-recovery)).

### Tick Delivery as a Message

Tick events are delivered through the existing mail system rather than a
new delivery mechanism.  This provides:

- **Persistence:**
  - Tick messages are persisted in the agent's mailbox and survive restarts.
  - If the agent crashes during processing, the message is still in
    `followMessages()` on the next incarnation.
- **Ordering:**
  - Tick events interleave naturally with other messages in arrival order
- **Replay:**
  - The `followMessages()` replay on restart includes tick events, so agents
    with inbox-replay recovery handle tick events identically to user messages.

#### Message Shape

```ts
type IntervalTickMessage = {
  type: 'interval-tick';
  messageId: FormulaIdentifier;
  from: FormulaIdentifier;       // the interval-scheduler's handle
  to: FormulaIdentifier;         // the agent's handle
  intervalId: string;
  label: string;
  periodMs: number;
  tickNumber: number;            // 1-indexed count for this interval
  scheduledAt: number;           // intended fire time (epoch ms)
  actualAt: number;              // actual fire time (epoch ms)
  missedTicks: number;           // ticks missed during downtime (0 normally)
  tickResponseId: FormulaIdentifier;  // ref to TickResponse capability
};
```

The `missedTicks` field tells the agent how many ticks were skipped during
daemon downtime.  For an interval with a 60-second period, if the daemon
was down for 5 minutes, the agent receives a single `interval-tick`
message with `missedTicks: 4` on restart.  The agent decides whether to
compensate or simply continue.

### Resolve/Reschedule Semantics

Each tick fires with a deadline of `tickTimeoutMs` from the actual fire
time.  The agent must respond before the deadline by calling one of:

#### `resolve()`

The tick is done.  The scheduler advances to the next period boundary:

```
nextTickAt = scheduledAt + periodMs
```

This is **start-to-start** timing:
- the next tick fires at a fixed offset from when *this* tick was scheduled to
  fire, not from when it was resolved
- this keeps the cadence consistent regardless of how long the agent takes to
  process each tick

If processing took longer than one full period (i.e., `nextTickAt` is
already in the past), the scheduler fires the next tick immediately with
`missedTicks` reflecting how many periods were consumed.

#### `reschedule()`

The tick failed transiently. 
The agent declines this wakeup but wants to try again soon.
The scheduler implements exponential backoff:

```
baseBackoff = min(1000, periodMs / 10)
backoffDelay = min(baseBackoff * 2^(rescheduleCount - 1), tickTimeoutMs)
retryAt = min(now + backoffDelay, scheduledAt + tickTimeoutMs)
```

The scheduler increments a per-tick `rescheduleCount` and arms a new
`setTimeout` for `retryAt`.  The retry delivers a fresh `interval-tick`
message with a fresh `TickResponse` capability (same `tickNumber`,
incremented internal retry counter).

If the backoff delay would push the retry past the tick deadline, the
scheduler auto-resolves and advances to the next period instead.

#### Timeout (no response)

If the agent neither resolves nor reschedules within `tickTimeoutMs`,
the scheduler treats this as an implicit resolve:

- The `TickResponse` capability becomes inert (both methods are no-ops).
- The scheduler logs a warning: `Interval ${label} tick ${tickNumber} timed out after ${tickTimeoutMs}ms`.
- The scheduler advances `nextTickAt` to the next period boundary and
  arms the next tick.

This prevents a crashed or stuck agent from permanently stalling its
heartbeat.

### Start-to-Start Timing

The scheduler enforces **consistent start-to-start** timing.  Each tick
is scheduled relative to the previous tick's *scheduled* time, not its
actual completion time:

```
tick 1 scheduled at: createdAt + firstDelayMs
tick 2 scheduled at: tick1.scheduledAt + periodMs
tick 3 scheduled at: tick2.scheduledAt + periodMs
...
```

If processing a tick takes longer than `periodMs`, the next tick fires
immediately when the current tick resolves (the scheduled time has
already passed).  This avoids drift while also avoiding overlapping
ticks — each tick must resolve or time out before the next one fires.

### Formula Type

```ts
type IntervalSchedulerFormula = {
  type: 'interval-scheduler';
  /** The agent this scheduler is bound to. */
  agent: FormulaIdentifier;
  /** The handle used by the scheduler to deliver tick messages. */
  handle: FormulaIdentifier;
  /** Maximum number of active intervals (default 5). */
  maxActive: number;
  /** Minimum allowed period in ms (default 30_000). */
  minPeriodMs: number;
  /** Whether all intervals are paused (default false). */
  paused: boolean;
};
```

The formula stores the agent and handle references along with limits
(`maxActive`, `minPeriodMs`) and `paused` state.  Interval entries are
stored as files in a dedicated directory on disk (see
[Persistence](#persistence)).

**Dependency edges for GC:**
- `agent` — strong.  The scheduler is alive as long as its agent is.
- `handle` — strong.  The scheduler's own handle must be alive to
  deliver messages.

The scheduler is formulated with a `DeferredTasks` that writes its
formula ID into the agent's pet store (e.g., under the name `SCHEDULER`),
making it accessible to the agent.

### Persistence

#### Directory Layout

Each `interval-scheduler` instance is backed by a directory on disk:

```
state/
  interval-scheduler/
    ab/
      cdef0123…/                ← one scheduler instance
        intervals/              ← one file per interval
          a1b2c3d4.json
          e5f6g7h8.json
```

This follows the established pattern from `pet-store` and
`synced-pet-store` (one directory per formula, one file per entry).

#### Interval Entry File Format

```json
{
  "id": "a1b2c3d4",
  "label": "heartbeat",
  "periodMs": 60000,
  "firstDelayMs": 0,
  "tickTimeoutMs": 30000,
  "nextTickAt": 1741852860000,
  "createdAt": 1741852800000,
  "tickCount": 42,
  "status": "active"
}
```

`nextTickAt` is the absolute time of the next scheduled tick.  This makes
restart recovery trivial: compare to `Date.now()` and fire or re-arm.

#### Atomic Writes

All writes use the write-then-rename pattern established in the
`synced-pet-store` design (and already used by the content store in
`daemon-node-powers.js:400-423`):

```
async function atomicWriteJSON(filePowers, targetDir, fileName, value):
    temporaryPath = filePowers.joinPath(targetDir, `.tmp.${randomHex()}`)
    finalPath = filePowers.joinPath(targetDir, fileName)
    await filePowers.writeFileText(temporaryPath, JSON.stringify(value) + '\n')
    await filePowers.renamePath(temporaryPath, finalPath)
```

### Arming and Disarming

The daemon maintains an in-memory `Map<string, NodeJS.Timeout>` from
interval entry ID to active `setTimeout` handle.  This map is not
persisted — it is rebuilt from disk on startup.

#### Arming an Interval

```
function armInterval(entry):
    const now = Date.now()
    const delay = Math.max(0, entry.nextTickAt - now)
    const handle = setTimeout(() => onIntervalTick(entry.id), delay)
    activeTimeouts.set(entry.id, handle)
```

#### On Interval Tick

```
async function onIntervalTick(entryId):
    const entry = await readEntry(entryId)
    if entry.status !== 'active':
        return   // cancelled or paused during delay

    const now = Date.now()
    entry.tickCount += 1

    // Create a one-shot TickResponse capability
    const tickResponse = makeTickResponse(entry, now)

    // Deliver the interval-tick message
    await deliverIntervalTickMessage(entry, tickResponse, now)

    // Arm the tick timeout
    const deadlineHandle = setTimeout(
        () => onTickTimeout(entry.id, entry.tickCount),
        entry.tickTimeoutMs,
    )
    tickDeadlines.set(entryId, deadlineHandle)
```

When `resolve()` is called on the `TickResponse`:

```
function onTickResolved(entry):
    // Cancel the deadline timeout
    clearTimeout(tickDeadlines.get(entry.id))
    tickDeadlines.delete(entry.id)

    // Advance to next period (start-to-start)
    entry.nextTickAt = entry.nextTickAt + entry.periodMs
    await persistEntry(entry)

    // If next tick is already past, fire immediately
    armInterval(entry)
```

When `reschedule()` is called:

```
function onTickRescheduled(entry, rescheduleCount):
    const baseBackoff = Math.min(1000, entry.periodMs / 10)
    const backoffDelay = Math.min(
        baseBackoff * Math.pow(2, rescheduleCount - 1),
        entry.tickTimeoutMs,
    )
    const retryAt = Date.now() + backoffDelay
    const deadline = entry.nextTickAt + entry.tickTimeoutMs

    if retryAt >= deadline:
        // Backoff would exceed deadline; auto-resolve instead
        onTickResolved(entry)
        return

    // Arm retry
    const handle = setTimeout(() => onIntervalTick(entry.id), backoffDelay)
    activeTimeouts.set(entry.id, handle)
```

#### Disarming

```
function disarmInterval(entryId):
    const handle = activeTimeouts.get(entryId)
    if handle !== undefined:
        clearTimeout(handle)
        activeTimeouts.delete(entryId)
    const deadlineHandle = tickDeadlines.get(entryId)
    if deadlineHandle !== undefined:
        clearTimeout(deadlineHandle)
        tickDeadlines.delete(entryId)
```

### Startup Recovery

On daemon restart, `seedFormulaGraphFromPersistence()` loads all formulas
including `interval-scheduler` formulas.  When an `interval-scheduler` is
incarnated:

1. Read all entry files from the `intervals/` directory.
2. Read limits and pause state from the formula.
3. For each entry with `status: 'active'`:
   a. If `formula.paused` is true, skip arming (entries remain active but
      unarmed until `resume()`).
   b. Compute how many periods were missed:
      `missedTicks = Math.max(0, Math.floor((now - entry.nextTickAt) / entry.periodMs))`.
   c. If `entry.nextTickAt <= now` (fire time has passed):
      - Advance `nextTickAt` to the next future period boundary:
        `entry.nextTickAt += (missedTicks + 1) * entry.periodMs`.
      - Deliver a single catch-up `interval-tick` message with
        `missedTicks` count.
      - Persist the updated entry.
      - Arm for the next tick.
   d. If `entry.nextTickAt > now`: arm normally.

This ensures no scheduled work is silently lost during downtime, while
avoiding a storm of catch-up messages.

### Host-Controlled Limits

| Limit         | Default     | Range              | Enforced At                                                     |
|---------------|-------------|--------------------|-----------------------------------------------------------------|
| `maxActive`   | 5           | 1     – 100        | `makeInterval()` — throws if limit reached                      |
| `minPeriodMs` | 3_000 (30s) | 1_000 – 86_400_000 | `makeInterval()` and `setPeriod()` — throws if period too short |

These limits are **per-scheduler** (and therefore per-agent, since each
agent has its own scheduler — see design decision #9).  The host sets
limits when creating the scheduler via `makeIntervalScheduler()` and can
adjust them at any time through `IntervalControl`.

Limits and pause state are stored as fields on the formula itself (see
[Formula Type](#formula-type)), not in a separate config file.

Changing `maxActive` downward does not cancel existing intervals — it prevents
new ones until active count drops below the new limit.  Changing `minPeriodMs`
does not retroactively invalidate existing intervals.

### Pause and Resume

`IntervalControl.pause()`:
- disarms all active `setTimeout` and deadline handles without changing entry status
- entries remain `status: 'active'` on disk but are not armed
- sets `paused` to `true` on the formula and persists

`IntervalControl.resume()`:
- re-reads all active entries
- re-computes `nextTickAt` relative to now
- re-arms timers for each active
- sets `paused` to `false` on the formula and persists

During a pause, if the daemon restarts, the startup recovery sees
`formula.paused === true` and does not arm any intervals.
No tick messages are delivered for ticks that would have occurred during the
pause.
This is intentional: pause is a deliberate suppression, not a deferral. The
host can inspect `listAll()` to see what was suppressed.

### Revocation

`IntervalControl.revoke()`:

1. Disarms all active `setTimeout` and deadline handles.
2. Sets all entries to `status: 'cancelled'` and persists.
3. Sets a `revoked` flag on the in-memory exo state.
4. All subsequent calls to `IntervalScheduler.makeInterval()` and
   `IntervalScheduler.list()` throw
   `Error('Interval scheduler has been revoked')`.
5. Existing `Interval` references become inert — `cancel()` is a
   no-op, `info()` returns the entry with `status: 'cancelled'`.
6. Any outstanding `TickResponse` capabilities become inert.

Revocation is **permanent**.  To restore interval access, the host must
create a new `IntervalScheduler` / `IntervalControl` pair.

### Cancellation Context Integration

The `interval-scheduler` exo registers an `onCancel` hook with its
context:

```js
context.onCancel(() => {
  // Disarm all active timeouts and deadlines
  for (const [, handle] of activeTimeouts) {
    clearTimeout(handle);
  }
  activeTimeouts.clear();
  for (const [, handle] of tickDeadlines) {
    clearTimeout(handle);
  }
  tickDeadlines.clear();
});
```

This ensures that if the scheduler's formula is cancelled (e.g., because
the agent is collected by GC), all `setTimeout` handles are cleaned up
and no orphan intervals continue ticking.

The scheduler also calls `context.thisDiesIfThatDies(agentId)` so that
if the agent is cancelled, the scheduler is cancelled too.

### Security Considerations

#### Interval Bomb Prevention

An agent cannot create unbounded intervals because `maxActive` limits the
total.  An agent cannot create high-frequency intervals because
`minPeriodMs` enforces a floor.  These limits are host-controlled and
cannot be modified by the agent.

#### No Ambient Scheduling

The `IntervalScheduler` capability is the only scheduling mechanism.  An
agent without a scheduler capability cannot schedule future execution by
any means.  There is no `Promise.delay`, no `queueMicrotask` with delay,
and no busy-wait loop (the event loop is not exposed).

#### TickResponse Abuse

A malicious agent could call `reschedule()` repeatedly to generate rapid
retries.  This is bounded by the exponential backoff (each successive
retry doubles the delay) and capped by the tick deadline (`tickTimeoutMs`).
At most `log2(tickTimeoutMs / baseBackoff)` retries can occur per tick.

#### Fire-and-Forget

An agent could ignore tick messages, letting them accumulate in its
mailbox and timing out.  This is bounded by `maxActive` (at most N
intervals, each producing one tick per period) and the timeout
auto-resolve prevents resource leaks in the scheduler.  Mailbox size
limits (if implemented separately) provide an additional bound.

#### Clock Manipulation

The daemon uses `Date.now()` for fire time computation.  If the system
clock jumps forward (e.g., NTP correction), ticks may fire early.  If
the clock jumps backward, ticks may fire late.  This is acceptable for
the intended use cases where second-level precision is not required.
The `actualAt` field in the tick message records the actual fire time
for auditing.

### Maker Function

The host creates interval schedulers through a new method on the host
interface:

```ts
// Added to HostInterface
makeIntervalScheduler: M.callWhen(
  M.string(),                    // agentName — pet name of the agent
  M.opt({
    maxActive: M.opt(M.number()),
    minPeriodMs: M.opt(M.number()),
  }),
).returns(M.record()),           // { scheduler, schedulerControl }
```

The maker:

1. Resolves `agentName` to the agent's formula ID.
2. Creates a new handle for the scheduler (so it has its own identity in
   the mail system).
3. Formulates an `interval-scheduler` formula with `{ agent, handle }`.
4. Creates the `IntervalScheduler` and `IntervalControl` exo facets.
5. Writes the scheduler capability into the agent's pet store under the
   name `SCHEDULER` (or a host-chosen name).
6. Returns `{ scheduler, schedulerControl }` to the host.

The host can then grant `scheduler` to the agent (it is already written
into the agent's namespace) and retain `schedulerControl` for management.

### `extractDeps` Integration

The `extractDeps` function in `daemon.js` must be extended to handle the
new formula type:

```js
case 'interval-scheduler':
  return [formula.agent, formula.handle];
```

Both are local formula IDs, so they create strong GC edges.

## Dependencies

| Design                                                        | Relationship                                                                                          |
|---------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| [endoclaw](endoclaw.md)                                       | Parent capability taxonomy                                                                            |
| [daemon-capability-bank](daemon-capability-bank.md)           | Lists Timer/scheduling in the capability taxonomy                                                     |
| [endoclaw-proactive-messages](endoclaw-proactive-messages.md) | **Depends on this design.** Composes heartbeat + data capabilities + `send()` for scheduled briefings |

## Implementation Phases

### Phase 1: Core Interval Exo (S)

- Define `IntervalSchedulerFormula` in `types.d.ts`.
- Add `interval-scheduler` to the `Formula` discriminated union.
- Implement `makeIntervalScheduler()` factory returning
  `IntervalScheduler` / `IntervalControl` facets with interface guards.
- Add `interval-scheduler` maker to the `makers` table in `daemon.js`.
- Add `extractDeps` case for `interval-scheduler`.
- Persistence: entry files in the scheduler directory; limits and pause state on the formula.
- `makeInterval()` creates entries, persists, and arms `setTimeout`.
- `cancel()` disarms and marks cancelled.
- Limit enforcement: `maxActive`, `minPeriodMs`.
- Cancellation context integration.

### Phase 2: Tick Delivery and Response (S)

- Add `interval-tick` to the `MessageFormula` type union.
- Implement `deliverIntervalTickMessage()` using the existing `post()`
  pathway in `mail.js`.
- Create a handle for the scheduler (so tick messages have a valid `from`
  identity).
- Implement the `TickResponse` one-shot exo with `resolve()` /
  `reschedule()`.
- Implement tick timeout with auto-resolve.
- Implement exponential backoff on `reschedule()`.

### Phase 3: Startup Recovery (S)

- In `seedFormulaGraphFromPersistence()`, when an `interval-scheduler`
  formula is loaded, read its entry files and re-arm active intervals.
- Compute `missedTicks` for intervals that should have ticked during
  downtime.
- Deliver catch-up `interval-tick` messages with `missedTicks > 0`.

### Phase 4: Host Integration (S)

- Add `makeIntervalScheduler()` to `HostInterface` and implement in
  `host.js`.
- Add `pause()` / `resume()` / `revoke()` to `IntervalControl`.
- CLI: `endo interval list <agent>`, `endo interval pause <agent>`,
  `endo interval resume <agent>`.

## Design Decisions

1. **Tick events are messages, not iterator values.**  Delivering through
   the mail system gives persistence, ordering, and replay for free.  An
   `AsyncIterator<Tick>` interface would require a new delivery
   mechanism, would not survive restarts without additional work, and
   would not interleave naturally with other agent messages.

2. **Start-to-start timing, not end-to-start.**  Each tick is scheduled
   at a fixed offset from the previous tick's *scheduled* time.  This
   keeps the cadence consistent: a 60-second interval fires 60 times
   per hour regardless of processing time.  End-to-start timing would
   drift — a tick that takes 5 seconds would push the cadence to 65
   seconds.

3. **Resolve/reschedule, not fire-and-forget.**  Each tick requires an
   explicit response from the agent.  This gives the scheduler
   visibility into whether the agent is healthy and allows transient
   failures to be retried with backoff within the current period.  The
   timeout auto-resolve prevents a stuck agent from stalling the
   heartbeat.

4. **Immediate first tick by default.**  `firstDelayMs` defaults to 0 so
   the agent gets an initial wakeup as soon as the interval is created.
   This is critical for startup: the agent's first heartbeat should fire
   immediately to initialize state, not after an arbitrary delay.

5. **No cron semantics.**  The interval scheduler knows only about
   periods (milliseconds between ticks).  Any higher-level scheduling
   policy — "run at 8 AM daily," "run every weekday," etc. — is
   implemented by the agent in its tick handler.  This keeps the
   scheduler simple and pushes policy decisions to the agent, where they
   belong.

6. **Missed ticks are coalesced, not replayed.**  An interval that
   missed 4 ticks during downtime delivers **one** message with
   `missedTicks: 4`, not 5 separate messages.  This prevents message
   storms on restart and lets the agent decide whether to compensate.

7. **Pause suppresses, not defers.**  Ticks that would have occurred
   during a pause are **lost**, not queued.  This matches the intent of
   pause (the host wants the agent to stop doing scheduled work) and
   avoids a burst of suppressed events on resume.  The host can inspect
   `listAll()` to audit what was suppressed.

8. **Revocation is permanent.**  Once `revoke()` is called, the
   `IntervalScheduler` capability is dead.  The host must create a new
   scheduler to restore access.  This matches the caretaker pattern used
   throughout EndoClaw.

9. **One scheduler per agent, not per interval.**  Individual interval
   entries are stored as files within the scheduler directory, not as
   separate formulas.  This avoids formula explosion (an agent with 5
   intervals would otherwise create 5 formulas, each with GC edges).
   The scheduler is the unit of GC — when the agent dies, the entire
   scheduler (and all its intervals) is collected.

10. **No sub-second intervals.**  The `minPeriodMs` floor is 1000ms
    (1 second).  Sub-second heartbeats are not useful for the intended
    agent use cases and would create unnecessary load.  The host can set
    the floor higher (the default is 60 seconds).

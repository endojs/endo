# EndoClaw: Timer / Scheduler Capability

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-13 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## What is the Problem Being Solved?

SES lockdown removes `setTimeout` and `setInterval` from the global scope.
An agent running inside a locked-down worker has **no mechanism** for
scheduling future execution.  Without a timer capability, agents are purely
reactive — they can only respond to messages they receive.

Proactive agent behavior requires scheduled execution:

- **Morning briefings:** Gather data and compose a summary at 8 AM daily.
- **Reminders:** Alert the user at a specific future time.
- **Monitoring:** Check an external service every 15 minutes and report
  anomalies.
- **Retry/backoff:** Re-attempt a failed operation after a delay.

The Timer capability is the **only** way to restore scheduled execution
under SES, making timer authority explicit, auditable, and revocable.

## Design

### Capability Shape

The Timer capability follows the caretaker pattern: a `Timer` facet
granted to the agent (the guest facet) and a `TimerControl` facet
retained by the host (the control facet).  Both are facets of a single
`timer-service` exo.

```ts
interface Timer {
  schedule(cron: string, label: string): Promise<TimerHandle>;
  delay(ms: number, label: string): Promise<TimerHandle>;
  list(): Promise<TimerEntry[]>;
  help(): string;
}

interface TimerHandle {
  cancel(): Promise<void>;
  info(): TimerEntry;
}

interface TimerControl {
  setMaxActive(n: number): void;
  setMinIntervalMs(ms: number): void;
  pause(): void;
  resume(): void;
  revoke(): void;
  listAll(): Promise<TimerEntry[]>;
  help(): string;
}

type TimerEntry = {
  id: string;
  label: string;
  kind: 'cron' | 'delay';
  cron: string | undefined;
  fireAt: number;          // epoch ms of next (or only) fire
  createdAt: number;       // epoch ms when scheduled
  firedCount: number;      // times this timer has fired
  status: 'active' | 'paused' | 'cancelled' | 'completed';
};
```

### Interface Guards

```js
const TimerEntryShape = harden({
  id: M.string(),
  label: M.string(),
  kind: M.or('cron', 'delay'),
  cron: M.or(M.string(), M.undefined()),
  fireAt: M.number(),
  createdAt: M.number(),
  firedCount: M.number(),
  status: M.or('active', 'paused', 'cancelled', 'completed'),
});

export const TimerInterface = M.interface('EndoTimer', {
  schedule: M.callWhen(M.string(), M.string())
    .returns(M.remotable('TimerHandle')),
  delay: M.callWhen(M.number(), M.string())
    .returns(M.remotable('TimerHandle')),
  list: M.callWhen().returns(M.arrayOf(TimerEntryShape)),
  help: M.call().returns(M.string()),
});

export const TimerHandleInterface = M.interface('EndoTimerHandle', {
  cancel: M.callWhen().returns(M.undefined()),
  info: M.call().returns(TimerEntryShape),
});

export const TimerControlInterface = M.interface('EndoTimerControl', {
  setMaxActive: M.call(M.number()).returns(M.undefined()),
  setMinIntervalMs: M.call(M.number()).returns(M.undefined()),
  pause: M.call().returns(M.undefined()),
  resume: M.call().returns(M.undefined()),
  revoke: M.call().returns(M.undefined()),
  listAll: M.callWhen().returns(M.arrayOf(TimerEntryShape)),
  help: M.call().returns(M.string()),
});
```

### How It Works

1. **Host creates the capability pair.**  The host calls a maker function
   (e.g., `E(host).makeTimer(agentName, options)`) which formulates a
   `timer-service` formula and returns the `Timer` / `TimerControl` pair.
   The host grants the `Timer` facet to the agent and retains
   `TimerControl`.

2. **Agent schedules a timer.**  The agent calls
   `E(timer).schedule('0 8 * * *', 'morning-briefing')` or
   `E(timer).delay(300000, 'retry-upload')`.  The `Timer` exo validates
   the request against the host's limits, persists the timer entry to
   disk, arms a Node.js `setTimeout` for the next fire time, and returns
   a `TimerHandle`.

3. **Timer fires.**  When the `setTimeout` callback runs, the daemon
   delivers a `timer-fire` message to the agent's handle.  The agent
   receives it through `followMessages()` alongside all other messages.
   For cron timers, the daemon computes the next fire time and re-arms
   the `setTimeout`.

4. **Agent processes the event.**  The agent's message loop sees the
   `timer-fire` message, which contains the timer's label and entry
   metadata.  The agent executes its scheduled logic (gather data,
   compose a response, send messages).

5. **Daemon restarts.**  On startup, the daemon reads all persisted timer
   entries.  For each active timer, it computes the next fire time
   relative to now and arms a `setTimeout`.  Timers that should have
   fired during downtime fire immediately (or once, with a
   `missedFirings` count in the message).

### Timer Fire as a Message

Timer events are delivered through the existing mail system rather than a
new delivery mechanism.  This provides:

- **Persistence:** Fired events are persisted in the agent's mailbox and
  survive restarts.  If the agent crashes during processing, the message
  is still in `followMessages()` on the next incarnation.
- **Ordering:** Timer events interleave naturally with other messages in
  arrival order.
- **Replay:** The `followMessages()` replay on restart includes timer
  events, so agents with inbox-replay recovery (like Fae) handle timer
  events identically to user messages.

#### Message Shape

```ts
type TimerFireMessage = {
  type: 'timer-fire';
  messageId: FormulaIdentifier;
  from: FormulaIdentifier;     // the timer-service's handle
  to: FormulaIdentifier;       // the agent's handle
  timerId: string;
  label: string;
  kind: 'cron' | 'delay';
  fireAt: number;              // scheduled fire time (epoch ms)
  actualAt: number;            // actual fire time (epoch ms)
  firedCount: number;          // 1-indexed count for this timer
  missedFirings: number;       // firings missed during downtime (0 if on time)
};
```

The `missedFirings` field tells the agent how many firings occurred during
daemon downtime.  For a daily cron that fires at 8 AM, if the daemon was
down for 3 days, the agent receives a single `timer-fire` message with
`missedFirings: 2` on restart.  The agent can decide whether to run its
logic once (idempotent) or compensate for the missed firings.

### Formula Type

```ts
type TimerServiceFormula = {
  type: 'timer-service';
  /** The agent this timer service is bound to. */
  agent: FormulaIdentifier;
  /** The handle used by the timer service to deliver fire messages. */
  handle: FormulaIdentifier;
};
```

The formula stores the agent and handle references.  Timer entries,
limits, and pause state are stored in a dedicated directory on disk (not
in the formula itself), because they change frequently and independently.

**Dependency edges for GC:**
- `agent` — strong.  The timer service is alive as long as its agent is.
- `handle` — strong.  The timer service's own handle must be alive to
  deliver messages.

The timer service is formulated with a `DeferredTasks` that writes its
formula ID into the agent's pet store (e.g., under the name `TIMER`),
making it accessible to the agent.

### Persistence

#### Directory Layout

Each `timer-service` instance is backed by a directory on disk:

```
state/
  timer-service/
    ab/
      cdef0123…/              ← one timer-service instance
        entries/               ← one file per timer entry
          a1b2c3d4.json
          e5f6g7h8.json
        config.json            ← limits and pause state
```

This follows the established pattern from `pet-store` and
`synced-pet-store` (one directory per formula, one file per entry).

#### Entry File Format

```json
{
  "id": "a1b2c3d4",
  "label": "morning-briefing",
  "kind": "cron",
  "cron": "0 8 * * *",
  "fireAt": 1741852800000,
  "createdAt": 1741766400000,
  "firedCount": 3,
  "status": "active"
}
```

For one-shot delays:

```json
{
  "id": "e5f6g7h8",
  "label": "retry-upload",
  "kind": "delay",
  "fireAt": 1741767300000,
  "createdAt": 1741767000000,
  "firedCount": 0,
  "status": "active"
}
```

One-shot delays store the **absolute** fire time, not the relative delay.
This allows the daemon to determine on restart whether the delay has
elapsed (fire immediately) or how much time remains (re-arm with the
remainder).

#### Config File Format

```json
{
  "maxActive": 5,
  "minIntervalMs": 60000,
  "paused": false
}
```

Defaults are applied if the file does not exist.

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
timer entry ID to active `setTimeout` handle.  This map is not
persisted — it is rebuilt from disk on startup.

#### Arming a Timer

```
function armTimer(entry):
    const now = Date.now()
    const delay = Math.max(0, entry.fireAt - now)
    const handle = setTimeout(() => onTimerFire(entry.id), delay)
    activeTimeouts.set(entry.id, handle)
```

For cron timers, `fireAt` is the next occurrence computed from the cron
expression.  For one-shot delays, `fireAt` is the absolute target time.

#### On Timer Fire

```
async function onTimerFire(entryId):
    const entry = await readEntry(entryId)
    if entry.status !== 'active':
        return   // cancelled or paused during delay

    // Deliver the timer-fire message
    entry.firedCount += 1
    await deliverTimerFireMessage(entry)

    if entry.kind === 'cron':
        // Compute next fire time and re-arm
        entry.fireAt = nextCronOccurrence(entry.cron, entry.fireAt)
        entry.status = 'active'
        await persistEntry(entry)
        armTimer(entry)
    else:
        // One-shot: mark completed
        entry.status = 'completed'
        await persistEntry(entry)
        activeTimeouts.delete(entryId)
```

#### Disarming

```
function disarmTimer(entryId):
    const handle = activeTimeouts.get(entryId)
    if handle !== undefined:
        clearTimeout(handle)
        activeTimeouts.delete(entryId)
```

### Startup Recovery

On daemon restart, `seedFormulaGraphFromPersistence()` loads all formulas
including `timer-service` formulas.  When a `timer-service` is
incarnated:

1. Read all entry files from the `entries/` directory.
2. Read `config.json` for limits and pause state.
3. For each entry with `status: 'active'`:
   a. If `config.paused` is true, skip arming (entries remain active but
      unarmed until `resume()`).
   b. Compute the delay: `Math.max(0, entry.fireAt - Date.now())`.
   c. If `delay === 0` (fire time has passed):
      - For cron timers: compute how many firings were missed, deliver a
        single `timer-fire` message with `missedFirings` count, advance
        `fireAt` to the next future occurrence, persist, and arm.
      - For one-shot delays: deliver the `timer-fire` message, mark
        `status: 'completed'`, persist.
   d. If `delay > 0`: arm normally.

This ensures no scheduled work is silently lost during downtime.

### Cron Parsing

The design requires a cron expression parser that can:

1. Validate a cron expression string.
2. Compute the next occurrence after a given time.
3. Compute the number of occurrences in a time range (for
   `missedFirings`).

**Library choice:** `cron-parser` (npm) is a well-maintained, pure-JS
library with no native dependencies.  It supports standard 5-field cron
syntax (`minute hour day-of-month month day-of-week`) and optional
6-field syntax with seconds.

**SES compatibility:** The library must be evaluated inside a
Compartment (or imported normally in the daemon's node process, which
runs under SES lockdown).  If `cron-parser` uses frozen-incompatible
patterns (e.g., mutating `Date.prototype`), a thin wrapper or a
purpose-built parser may be needed.  Testing under `@endo/init` is
required before committing to the dependency.

**Restricted expressions:** The `minIntervalMs` limit from
`TimerControl` is enforced at schedule time.  If the cron expression
would fire more frequently than `minIntervalMs`, the `schedule()` call
throws.  The check computes the two nearest future occurrences and
verifies their gap meets the minimum.

### Host-Controlled Limits

| Limit | Default | Range | Enforced At |
|-------|---------|-------|-------------|
| `maxActive` | 5 | 1–100 | `schedule()` and `delay()` — throws if limit reached |
| `minIntervalMs` | 60000 (1 min) | 1000–86400000 | `schedule()` — throws if cron fires too frequently |

Limits are persisted in `config.json` and take effect immediately when
changed via `TimerControl`.  Changing `maxActive` downward does not
cancel existing timers — it prevents new ones until active count drops
below the new limit.  Changing `minIntervalMs` does not retroactively
invalidate existing cron timers.

### Pause and Resume

`TimerControl.pause()` disarms all active `setTimeout` handles without
changing entry status.  Entries remain `status: 'active'` on disk but
are not armed.  `config.paused` is set to `true` and persisted.

`TimerControl.resume()` re-reads all active entries, re-computes fire
times relative to now, and re-arms them.  `config.paused` is set to
`false` and persisted.

During a pause, if the daemon restarts, the startup recovery sees
`config.paused === true` and does not arm any timers.  No `timer-fire`
messages are delivered for firings that would have occurred during the
pause.  This is intentional: pause is a deliberate suppression, not a
deferral.  The host can inspect `listAll()` to see what was suppressed.

### Revocation

`TimerControl.revoke()`:

1. Disarms all active `setTimeout` handles.
2. Sets all entries to `status: 'cancelled'` and persists.
3. Sets a `revoked` flag on the in-memory exo state.
4. All subsequent calls to `Timer.schedule()`, `Timer.delay()`, and
   `Timer.list()` throw `Error('Timer capability has been revoked')`.
5. Existing `TimerHandle` references become inert — `cancel()` is a
   no-op, `info()` returns the entry with `status: 'cancelled'`.

Revocation is **permanent**.  To restore timer access, the host must
create a new `Timer` / `TimerControl` pair.

### Cancellation Context Integration

The `timer-service` exo registers an `onCancel` hook with its context:

```js
context.onCancel(() => {
  // Disarm all active timeouts
  for (const [entryId, handle] of activeTimeouts) {
    clearTimeout(handle);
  }
  activeTimeouts.clear();
});
```

This ensures that if the timer service's formula is cancelled (e.g.,
because the agent is collected by GC), all `setTimeout` handles are
cleaned up and no orphan timers continue firing.

The timer service also calls `context.thisDiesIfThatDies(agentId)` so
that if the agent is cancelled, the timer service is cancelled too.

### Security Considerations

#### Timer Bomb Prevention

An agent cannot create unbounded timers because `maxActive` limits the
total.  An agent cannot create high-frequency timers because
`minIntervalMs` enforces a floor.  These limits are host-controlled and
cannot be modified by the agent.

#### No Ambient Scheduling

The `Timer` capability is the only scheduling mechanism.  An agent
without a `Timer` capability cannot schedule future execution by any
means.  There is no `Promise.delay`, no `queueMicrotask` with delay, and
no busy-wait loop (the event loop is not exposed).

#### Fire-and-Forget Abuse

A malicious agent could schedule a timer and then ignore the fire
messages, accumulating unprocessed messages in its mailbox.  This is
bounded by `maxActive` (at most N timers, each producing at most one
message per `minIntervalMs`).  Mailbox size limits (if implemented
separately) provide an additional bound.

#### Clock Manipulation

The daemon uses `Date.now()` for fire time computation.  If the system
clock jumps forward (e.g., NTP correction), timers may fire early.  If
the clock jumps backward, timers may fire late.  This is acceptable for
the intended use cases (briefings, reminders) where second-level
precision is not required.  The `actualAt` field in the fire message
records the actual fire time for auditing.

### Maker Function

The host creates timer services through a new method on the host
interface:

```ts
// Added to HostInterface
makeTimer: M.callWhen(
  M.string(),                    // agentName — pet name of the agent
  M.opt({
    maxActive: M.opt(M.number()),
    minIntervalMs: M.opt(M.number()),
  }),
).returns(M.record()),           // { timer, timerControl }
```

The maker:

1. Resolves `agentName` to the agent's formula ID.
2. Creates a new handle for the timer service (so it has its own identity
   in the mail system).
3. Formulates a `timer-service` formula with `{ agent, handle }`.
4. Creates the `Timer` and `TimerControl` exo facets.
5. Writes the timer capability into the agent's pet store under the name
   `TIMER` (or a host-chosen name).
6. Returns `{ timer, timerControl }` to the host.

The host can then grant `timer` to the agent (it is already written
into the agent's namespace) and retain `timerControl` for management.

### `extractDeps` Integration

The `extractDeps` function in `daemon.js` must be extended to handle
the new formula type:

```js
case 'timer-service':
  return [formula.agent, formula.handle];
```

Both are local formula IDs, so they create strong GC edges.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [endoclaw](endoclaw.md) | Parent capability taxonomy |
| [daemon-capability-bank](daemon-capability-bank.md) | Lists Timer in the capability taxonomy |
| [endoclaw-proactive-messages](endoclaw-proactive-messages.md) | **Depends on this design.** Composes Timer + data capabilities + `send()` for scheduled briefings |

## Implementation Phases

### Phase 1: Core Timer Exo (S)

- Define `TimerServiceFormula` in `types.d.ts`.
- Add `timer-service` to the `Formula` discriminated union.
- Implement `makeTimerService()` factory returning `Timer` /
  `TimerControl` facets with interface guards.
- Add `timer-service` maker to the `makers` table in `daemon.js`.
- Add `extractDeps` case for `timer-service`.
- Persistence: entry files and `config.json` in the timer service
  directory.
- `schedule()` and `delay()` create entries, persist, and arm
  `setTimeout`.
- `cancel()` disarms and marks completed/cancelled.
- Limit enforcement: `maxActive`, `minIntervalMs`.
- Cancellation context integration.

### Phase 2: Timer Fire Delivery (S)

- Add `timer-fire` to the `MessageFormula` type union.
- Implement `deliverTimerFireMessage()` using the existing `post()`
  pathway in `mail.js`.
- Create a handle for the timer service (so fire messages have a valid
  `from` identity).
- On fire: construct the `TimerFireMessage`, post to the agent's handle.
- Cron re-arm after fire.
- One-shot completion after fire.

### Phase 3: Startup Recovery (S)

- In `seedFormulaGraphFromPersistence()`, when a `timer-service` formula
  is loaded, read its entry files and re-arm active timers.
- Compute `missedFirings` for cron timers that should have fired during
  downtime.
- Deliver catch-up `timer-fire` messages with `missedFirings > 0`.

### Phase 4: Host Integration (S)

- Add `makeTimer()` to `HostInterface` and implement in `host.js`.
- `makeTimer()` formulates the timer service and writes the `Timer`
  capability into the agent's pet store.
- Add `pause()` / `resume()` / `revoke()` to `TimerControl`.
- CLI: `endo timer list <agent>`, `endo timer pause <agent>`,
  `endo timer resume <agent>`.

### Phase 5: Cron Library Integration (S)

- Evaluate `cron-parser` under SES lockdown (`@endo/init`).
- If compatible: add as dependency.  If not: implement a minimal
  5-field cron parser (the grammar is small and well-specified).
- Wire cron parsing into `schedule()` and startup recovery.

## Design Decisions

1. **Timer fires are messages, not direct worker calls.**  Delivering
   through the mail system gives persistence, ordering, and replay for
   free.  The alternative (a direct `E(worker).onTimerFire()` call)
   would require a new delivery mechanism, would not survive restarts,
   and would not interleave naturally with other agent work.

2. **One timer-service per agent, not per timer.**  Individual timer
   entries are stored as files within the service directory, not as
   separate formulas.  This avoids formula explosion (an agent with 5
   timers would otherwise create 5 formulas, each with GC edges).  The
   service is the unit of GC — when the agent dies, the entire service
   (and all its timers) is collected.

3. **Absolute fire times, not relative delays.**  Storing
   `fireAt: 1741767300000` instead of `delayMs: 300000` makes restart
   recovery trivial: compare `fireAt` to `Date.now()` and fire or
   re-arm.  Relative delays would require storing the creation time and
   recomputing, which is equivalent but less direct.

4. **Missed firings are coalesced, not replayed.**  A cron timer that
   missed 3 firings during downtime delivers **one** message with
   `missedFirings: 2`, not 3 separate messages.  This prevents message
   storms on restart and lets the agent decide whether to compensate.
   The alternative (replay all missed firings) could overwhelm an agent
   that sends external messages on each fire.

5. **Pause suppresses, not defers.**  Firings that would have occurred
   during a pause are **lost**, not queued.  This matches the intent of
   pause (the host wants the agent to stop doing scheduled work) and
   avoids a burst of suppressed events on resume.  The host can inspect
   `listAll()` to audit what was suppressed.

6. **Revocation is permanent.**  Once `revoke()` is called, the `Timer`
   capability is dead.  The host must create a new timer service to
   restore access.  This matches the caretaker pattern used throughout
   EndoClaw: revocation is final, not togglable.

7. **No sub-second timers.**  The `minIntervalMs` floor is 1000ms
   (1 second).  Sub-second scheduling is not useful for the intended
   agent use cases and would create unnecessary load.  The host can set
   the floor higher (the default is 60 seconds).

## Prompt

> Expand the endoclaw-timer stub design into a full design document.
> Cover: formula type, persistence format, startup recovery, timer fire
> delivery through the mail system, host-controlled limits, pause/resume,
> revocation, cancellation context integration, security considerations,
> interface guards, maker function, GC integration, cron parsing, and
> implementation phases.  Follow the conventions of existing daemon
> designs (daemon-cross-peer-gc, daemon-value-message) and EndoClaw
> capability conventions (endoclaw.md, daemon-capability-bank.md).


# Design: persist interval ticks as endo formulas

This is a design-only task.
Do not implement yet -- plan out how the interval scheduler could be
redesigned so that ticks are persisted as daemon formulas / pet names,
removing the need for the ephemeral side-channel Map.

## Motivation

The side-channel Map (TODO #23) works because `runHeartbeat` and
`runAgentLoop` share a process, but it is fragile across daemon
restarts: old heartbeat messages linger in the inbox with no
corresponding Map entry.
A formula-based approach would let the tick survive restart and be
referenced by pet name in the daemon message, the same way other endo
capabilities are passed.

## Key challenge

`tickResponse` is a one-shot closure with mutable state:

```js
// from packages/genie/src/interval/scheduler.js ~line 100
const tickResponse = harden({
  resolve() {
    if (tickResponseConsumed.get(tickKey)) return;
    tickResponseConsumed.set(tickKey, true);
    onTickResolved(entry);
  },
  reschedule() {
    if (tickResponseConsumed.get(tickKey)) return;
    const count = (rescheduleCounts.get(tickKey) || 0) + 1;
    rescheduleCounts.set(tickKey, count);
    onTickRescheduled(entry, count);
  },
});
```

This cannot be naively serialized.
The design must separate the **tick metadata** (tickNumber,
missedTicks, scheduledAt, actualAt) from the **tick response
capability** (resolve/reschedule).

## Design answers

### 1. What formula type for the tick?

**Recommendation: new `'interval-tick'` formula kind.**

Trade-offs considered:

| Approach | Pros | Cons |
|----------|------|------|
| New `'interval-tick'` kind | Clear semantics; dedicated lifecycle; GC-friendly paired with scheduler formula; can encode tick metadata in formula JSON | One more entry in formula-type.js (36 types already) |
| `eval`-style formula | Reuses existing infrastructure | Requires bundled source code; overkill for a simple remotable; harder to reason about lifecycle; obscures intent |
| `marshal`-style formula | No new type needed | Marshal formulas deserialize a frozen capability graph -- cannot close over live scheduler state; no mutable consumed/reschedule tracking |

The daemon already has 36 formula types, and the bar for adding one
is low: a line in `formula-type.js`, a typedef in `types.d.ts`, a
maker in `daemon.js`, and a `formulateXxx` helper.
The `promise`/`resolver` pair (which also has one-shot resolve
semantics and shared state via a backing store) is the closest
precedent and validates the pattern.

**Formula shape:**

```typescript
type IntervalTickFormula = {
  type: 'interval-tick';
  intervalId: string;       // opaque ID of the parent interval
  label: string;            // human-readable interval label
  tickNumber: number;       // monotonic tick counter
  missedTicks: number;      // how many ticks were skipped
  scheduledAt: number;      // intended fire time (epoch ms)
  actualAt: number;         // real fire time (epoch ms)
  periodMs: number;         // interval period
  store: FormulaIdentifier; // backing pet-store for status
};
```

The `store` field follows the `promise`/`resolver` precedent: a
dedicated pet-store holds the tick's resolution status so the maker
can reconstruct state on reincarnation.

### 2. How does the tick remotable expose resolve/reschedule?

The maker creates a `makeExo` remotable with an
`M.interface('IntervalTick', ...)` guard.
The remotable closes over a reference to the scheduler's
`onTickResolved` / `onTickRescheduled` callbacks, obtained
indirectly through a capability injected at formula creation time.

```js
// In daemon.js makers table:
'interval-tick': async (formula, context) => {
  const store = await provide(formula.store);
  context.thisDiesIfThatDies(formula.store);

  // Reconstruct consumed state from store on reincarnation.
  const statusRecord = await E(store).has('status');
  let consumed = statusRecord;

  // The scheduler callback is a remotable provided by the
  // scheduler formula; it's referenced by the tick's store
  // under the key 'scheduler-callback'.
  const schedulerCallback = await E(store).lookup('scheduler-callback');

  return makeExo('IntervalTick', IntervalTickInterface, {
    // ── Metadata accessors (pure reads) ──
    tickNumber:  () => formula.tickNumber,
    missedTicks: () => formula.missedTicks,
    scheduledAt: () => formula.scheduledAt,
    actualAt:    () => formula.actualAt,
    periodMs:    () => formula.periodMs,
    label:       () => formula.label,
    intervalId:  () => formula.intervalId,

    // ── Lifecycle methods (one-shot, side-effecting) ──
    async resolve() {
      if (consumed) return;
      consumed = true;
      await E(store).write('status', 'resolved');
      await E(schedulerCallback).onResolved(formula.intervalId);
    },

    async reschedule() {
      if (consumed) return;
      // Don't mark consumed -- reschedule is retriable.
      await E(schedulerCallback).onRescheduled(formula.intervalId);
    },

    async fail(reason) {
      if (consumed) return;
      consumed = true;
      await E(store).write('status', `failed:${reason}`);
      await E(schedulerCallback).onResolved(formula.intervalId);
    },

    help: () =>
      `Interval tick #${formula.tickNumber} for "${formula.label}"` +
      ` (${formula.missedTicks} missed). Call resolve() to advance.`,

    __getMethodNames__: () => harden([
      '__getMethodNames__',
      'tickNumber', 'missedTicks', 'scheduledAt', 'actualAt',
      'periodMs', 'label', 'intervalId',
      'resolve', 'reschedule', 'fail', 'help',
    ]),
  });
},
```

**Why `makeExo` over `Far`:** CapTP introspection
(`__getMethodNames__`) is provided automatically, and the
`M.interface` guard enforces argument shapes at the boundary.
The heartbeat consumer can discover the interface with
`E(tick).__getMethodNames__()` without duck-typing.

### 3. Lifecycle: who creates and who destroys?

**Creation flow:**

1. The scheduler timer fires inside the genie worker process.
2. The genie plugin layer calls upward into the daemon via an
   injected `tickFactory` capability:
   `const { tickPetName } = await E(tickFactory).createTick(metadata)`
3. The daemon's `tickFactory` implementation (exposed to the genie
   worker like other daemon facets):
   - Creates a pet-store for the tick's status.
   - Writes the scheduler callback remotable into the store.
   - Calls `formulate()` with an `'interval-tick'` formula.
   - Writes the tick's formula ID into the agent's pet store
     under a generated pet name (e.g., `tick-0042`).
   - Returns the pet name to the genie worker.
4. The genie `onTick` callback sends the heartbeat message:
   `E(agentGuest).send('@self', ['HEARTBEAT'], [tickPetName], [])`

**Consumption flow:**

5. `runAgentLoop` receives the message.
6. `names[0]` is the tick pet name.
7. `tick = await E(agentPowers).lookup(tickPetName)` incarnates
   the `interval-tick` formula.
8. `processHeartbeat(tick)` reads metadata, runs the agent round,
   then calls `E(tick).resolve()`.

**Destruction / GC:**

9. After `resolve()` is called, the tick's job is done.
   Two options (not mutually exclusive):

   a. **Explicit removal:** The heartbeat runner calls
      `E(agentPowers).remove(tickPetName)` after resolution.
      This drops the pet-store edge, and the formula graph's
      reference counting collects the tick + its backing store.

   b. **Automatic expiry:** The tick formula's `context` could
      register a delayed self-cancellation after resolution
      (e.g., `setTimeout(() => context.cancel(), 60_000)`).
      This is cleaner but requires the maker to manage its own
      lifetime, which no current formula type does.

   **Recommendation:** Option (a), explicit removal.
   It follows the existing pattern where the consumer of a
   capability is responsible for cleanup, and it avoids
   adding self-destructing formula semantics.

### 4. Restart recovery

**On daemon restart, three categories of tick formulas may exist:**

| State | Action |
|-------|--------|
| **Resolved** (store has `status: 'resolved'`) | Reincarnate as a no-op remotable. The heartbeat runner can safely call `resolve()` again (idempotent). Garbage-collect on next `remove()`. |
| **Unresolved, still within deadline** | Reincarnate normally. The scheduler's `recover()` method re-creates the scheduler callback, and the store's `scheduler-callback` entry is updated. The agent loop picks up the pending message and resolves it. |
| **Unresolved, past deadline (stale)** | The scheduler's `recover()` detects that `actualAt + tickTimeoutMs < now`. It auto-resolves the tick by writing `status: 'resolved'` to the store, then creates a fresh catch-up tick with the correct `missedTicks` count. |

**Key insight:** The scheduler's existing `recover()` function
(scheduler.js lines 302-336) already computes missed ticks and
delivers catch-up ticks.
The formula-based design augments this: instead of only creating
new catch-up ticks, recovery also cleans up stale unresolved tick
formulas from the previous run.

**Recovery sequence:**

```
daemon restart
  |
  v
reincarnate scheduler formula
  |-- scheduler.recover() reads persisted IntervalEntry files
  |-- for each active entry with nextTickAt <= now:
  |     |-- scan agent's pet store for unresolved tick-* names
  |     |-- for each stale tick: write 'resolved' to its store
  |     |-- compute missedTicks
  |     |-- create fresh interval-tick formula (catch-up tick)
  |     |-- deliver heartbeat message with new tick pet name
  |-- arm timers for future ticks
```

### 5. Scheduler refactoring scope

The scheduler currently lives entirely in the genie worker
(`packages/genie/src/interval/scheduler.js`) with no access to
daemon formula APIs.
Two refactoring approaches:

**Option A: Inject a `tickFactory` capability into the genie worker.**

The genie plugin's `make(powers)` entry point receives a
`tickFactory` from the daemon host that provisions formula
creation.
The scheduler calls `E(tickFactory).createTick(metadata)` and
receives a pet name back.

- **Scope:** Moderate.
  The scheduler's `deliverTick()` becomes async and delegates
  formula creation to the factory.
  The scheduler itself does not need daemon internals.
- **Daemon changes:** Add a `makeTickFactory(agentId)` function
  in `daemon.js` that returns a Far remotable with
  `createTick()`.
  Wire it through the guest/host provisioning chain.

**Option B: Graduate the scheduler to a daemon formula.**

The interval scheduler becomes an `'interval-scheduler'` formula
kind.
It is incarnated inside the daemon process (not a worker) and
has direct access to `formulate()`, `provide()`, etc.

- **Scope:** Large.
  Requires moving scheduler logic from genie into the daemon,
  or importing it and wrapping it.
  The scheduler would be a full daemon-side exo.
- **Benefit:** Direct formula creation without CapTP round-trips.
  Simpler lifecycle management.
- **Risk:** The genie package currently encapsulates all agent
  scheduling logic; splitting it across packages increases
  coupling.

**Recommendation: Option A (inject tickFactory).**

It preserves the current package boundaries and follows the
existing pattern of capabilities granted to guest workers.
The round-trip cost of `E(tickFactory).createTick()` is
negligible for a tick that fires every 5-15 minutes.

**Specific changes to `scheduler.js`:**

```diff
- const deliverTick = (entry, now, missedTicks = 0) => {
+ const deliverTick = async (entry, now, missedTicks = 0) => {
    // ... build metadata ...

-   const tickResponse = harden({ resolve() { ... }, ... });
-   const message = harden({ ...metadata, tickResponse });
-   if (onTick) onTick(message);

+   // Delegate formula creation to the daemon.
+   const { tickPetName } = await E(tickFactory).createTick({
+     intervalId: entry.id,
+     label: entry.label,
+     periodMs: entry.periodMs,
+     tickNumber: entry.tickCount,
+     scheduledAt: entry.nextTickAt - entry.periodMs,
+     actualAt: now,
+     missedTicks,
+   });
+
+   if (onTick) onTick({ ...metadata, tickPetName });
  };
```

The `onTickResolved` / `onTickRescheduled` callbacks remain in
the scheduler but are invoked indirectly through the
scheduler-callback remotable stored in the tick's backing store.

### 6. Does this replace or supplement the Map approach?

**This fully replaces the Map approach.**

If ticks are daemon formulas with pet names:

- The heartbeat message carries `tickPetName` in the `names`
  array (not the `strings` array).
- `runAgentLoop` resolves it with `E(powers).lookup(tickPetName)`
  -- standard endo name resolution, no side-channel Map.
- The tick remotable provides both metadata (tickNumber, etc.)
  and lifecycle methods (resolve, reschedule, fail).
- The Map in TODO #23 (`tickResponseMap`) becomes unnecessary.

**Migration path:**

1. Implement TODO #23 (Map-based side-channel) as the short-term
   fix.
   It unblocks the heartbeat feature immediately.
2. Implement this formula-based design as a follow-up.
   The Map approach is removed entirely when the formula approach
   lands.
3. No compatibility layer is needed between the two: the message
   format changes (pet name in `names[]` vs. opaque string in
   `strings[]`), so the consumer code is different anyway.

## Sketch of the formula-based flow

```
scheduler timer fires
  |
  v
deliverTick(entry)
  |-- create tick metadata: { tickNumber, missedTicks, ... }
  |-- await E(tickFactory).createTick(metadata)
  |     |-- daemon creates pet-store for tick status
  |     |-- daemon writes scheduler-callback into store
  |     |-- daemon calls formulate() with 'interval-tick' formula
  |     |-- daemon writes tick formula ID into agent's pet store
  |     |-- returns { tickPetName }
  |-- onTick({ ...metadata, tickPetName })
        |
        v
onTick callback in runHeartbeat
  |-- E(agentGuest).send('@self', ['HEARTBEAT'], [tickPetName], [])
        |
        v
runAgentLoop receives message
  |-- names[0] is the tick pet name
  |-- tick = await E(agentPowers).lookup(tickPetName)
  |-- methods = await E(tick).__getMethodNames__()
  |     -> ['resolve', 'reschedule', 'fail', 'tickNumber', ...]
  |-- processHeartbeat(..., tick)
        |
        v
processHeartbeat
  |-- tickNum = await E(tick).tickNumber()
  |-- missed = await E(tick).missedTicks()
  |-- ... run agent round ...
  |-- await E(tick).resolve()  // writes 'resolved' to store,
  |                            // calls scheduler callback
  |-- await E(powers).remove(tickPetName)  // GC the tick formula
```

## Performance analysis

**Is creating a formula per tick (every 5-15 minutes) acceptable?**

Yes.
The daemon already creates formulas for every message, directory
lookup, and guest invitation.
A heartbeat tick every 5 minutes adds ~288 formulas per day.
For comparison, a moderately active agent can generate hundreds
of message formulas per hour.

**I/O cost per tick:**

| Operation | Writes |
|-----------|--------|
| Create pet-store | 1 formula JSON |
| Write scheduler-callback to store | 1 store entry |
| Create interval-tick formula | 1 formula JSON |
| Write pet name to agent's store | 1 store entry |
| Resolve: write status to store | 1 store entry |
| Remove: delete formula + store | 2 file deletes |
| **Total** | **~6 small I/O ops** |

At one tick per 5 minutes, this is ~1.7 IOPS on average --
negligible even on spinning disks.

**Could use ephemeral (non-persisted) formulas?**

Not recommended.
The whole point of this design is crash recovery.
An ephemeral formula that vanishes on restart would recreate
the same problem as the in-memory Map.
The daemon does not currently support ephemeral formula kinds,
and adding that abstraction is a larger change than adding
`'interval-tick'`.

## Interface guard definition

```js
const IntervalTickInterface = M.interface('IntervalTick', {
  tickNumber:  M.call().returns(M.number()),
  missedTicks: M.call().returns(M.number()),
  scheduledAt: M.call().returns(M.number()),
  actualAt:    M.call().returns(M.number()),
  periodMs:    M.call().returns(M.number()),
  label:       M.call().returns(M.string()),
  intervalId:  M.call().returns(M.string()),
  resolve:     M.callWhen().returns(M.undefined()),
  reschedule:  M.callWhen().returns(M.undefined()),
  fail:        M.callWhen(M.string()).returns(M.undefined()),
  help:        M.call().returns(M.string()),
});
```

**Note on `reschedule` vs. internal retry:**

Exposing `reschedule()` to the consumer is useful when the agent
loop encounters a transient error (e.g., network timeout) and
wants the scheduler to retry with exponential backoff.
The scheduler's `onTickRescheduled` logic (backoff, deadline
enforcement, auto-resolve on deadline expiry) remains unchanged.
If the consumer does not call `reschedule()` and instead just
retries itself, the tick deadline timeout will eventually
auto-resolve.
Both paths are safe, so exposing `reschedule()` adds flexibility
without risk.

## Implementation checklist (for future PR)

1. Add `'interval-tick'` to `formula-type.js` Set.
2. Add `IntervalTickFormula` typedef to `types.d.ts`.
3. Add `IntervalTickInterface` M.interface guard.
4. Add maker to `daemon.js` makers table.
5. Add `formulateIntervalTick()` helper in `daemon.js`.
6. Create `makeTickFactory(agentId)` remotable that wraps
   `formulateIntervalTick()` and pet-name assignment.
7. Wire `tickFactory` into guest/host provisioning so it reaches
   the genie worker's `make(powers)`.
8. Refactor `scheduler.js` `deliverTick()` to call
   `E(tickFactory).createTick()` instead of building in-memory
   tick objects.
9. Update `runAgentLoop` heartbeat handler to resolve tick via
   `E(powers).lookup()` instead of the side-channel Map.
10. Add `E(powers).remove(tickPetName)` after resolution.
11. Update `recover()` to handle stale tick formulas.
12. Remove the `tickResponseMap` side-channel (TODO #23 code).
13. Add tests: tick creation, resolution, reschedule, restart
    recovery, stale tick cleanup.

## Deliverable

A written design document (this file, expanded with answers to the
above questions) that can be reviewed before implementation begins.
No code changes in this task.

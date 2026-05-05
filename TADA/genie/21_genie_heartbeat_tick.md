
Trying to get the genie unconfined main plugin heartbeat to work:
- running up against my lack of understanding for how to use the endo message system to pass an interval tick along
- read `packages/genie/main.js` especially the TODOs around lines 345 - 359
  1. [x] research, design, and plan how we can address this
  2. [x] only updates this task for now, do not yet write code

## Research findings

### The problem

`processHeartbeat` (line 351) needs the `IntervalTickMessage` object to:
1. Log `tick.tickNumber` and `tick.missedTicks` (line 374)
2. Call `tick.tickResponse.resolve()` after processing (line 462)
3. Call `extra.heartbeat.tickResponse.resolve()` for coalesced extras
   (line 450)

But the `tick` only exists inside the `onTick` callback in
`runHeartbeat` (line 513).
The callback communicates to the agent loop via
`E(agentGuest).send('@self', ['HEARTBEAT'], ...)` — daemon mail that
only carries **strings, names, and formula IDs**, not live JS objects.
The `tickResponse` handle has `.resolve()` and `.reschedule()` methods
that cannot be serialized through daemon mail.

### Why daemon messages can't carry the tick

Looking at `packages/daemon/src/mail.js` `send()`:
- `strings` → `Array<string>` (plain text)
- `names` → `Array<Name>` (pet-name strings mapped to formula IDs)
- `ids` → `Array<FormulaIdentifier>` (64-char hex:NodeNumber opaque
  strings)

Formula identifiers point to persisted formulas in the daemon graph.
The `tickResponse` one-shot capability (with mutable consumed flag,
resolve/reschedule closures) is fundamentally ephemeral in-memory
state — it can't be persisted as a daemon formula.

### Key insight: same process, no serialization needed

`runHeartbeat`'s `onTick` callback and `runAgentLoop`'s message
iteration run in the **same daemon worker process**.
They don't need to serialize the tick through the network — they just
need a shared coordination point.
The daemon message is used for **ordering** (so heartbeats interleave
with user messages in FIFO order), not for carrying the tick payload.

## Design: shared side-channel Map

Use a `Map<string, IntervalTickMessage>` shared between the `onTick`
callback and the message loop, keyed by a correlation ID embedded in
the message text.

### Data flow

```
onTick(tick)
  ├─ correlationId = `hb-${counter++}`
  ├─ pendingTicks.set(correlationId, tick)
  └─ E(agentGuest).send('@self', [`HEARTBEAT:${correlationId}`], [], [])
        │
        ▼
runAgentLoop receives message with strings: ['HEARTBEAT:hb-42']
  ├─ parse correlationId from head
  ├─ tick = pendingTicks.get(correlationId)
  ├─ pendingTicks.delete(correlationId)
  └─ processHeartbeat(..., tick, extraTicks)
        │
        ▼
processHeartbeat
  ├─ uses tick.tickNumber, tick.missedTicks for logging
  ├─ runs agent round
  ├─ tick.tickResponse.resolve()  ← scheduler advances
  └─ extra ticks: extraTick.tickResponse.resolve()
```

### Scope of the Map

The Map should be created in `spawnAgent` (which calls both
`runHeartbeat` and `runAgentLoop`) and passed to both:
- `runHeartbeat` → onTick writes to it
- `runAgentLoop` → message loop reads/deletes from it

### Changes needed

#### 1. Create the pending-ticks Map in `spawnAgent` (~line 860)

```js
/** @type {Map<string, IntervalTickMessage>} */
const pendingHeartbeatTicks = new Map();
let heartbeatTickCounter = 0;
```

Pass it to both `runAgentLoop` and `runHeartbeat`.

#### 2. Update `runHeartbeat` onTick callback (~line 513)

```js
const onTick = tick => {
  switch (tick.label) {
    case 'heartbeat': {
      heartbeatTickCounter += 1;
      const correlationId = `hb-${heartbeatTickCounter}`;
      pendingHeartbeatTicks.set(correlationId, tick);

      E(agentGuest)
        .send('@self', [`HEARTBEAT:${correlationId}`], [], [])
        .catch(err => {
          console.error(...);
          pendingHeartbeatTicks.delete(correlationId);
          tick.tickResponse.resolve();
        });
    }; break;
    ...
  }
};
```

#### 3. Update heartbeat detection in `runAgentLoop` (~line 657)

Parse the correlation ID from the message text and look up the tick:

```js
if (head.startsWith('heartbeat:')) {
  const correlationId = first.trim().split(':').slice(1).join(':');
  const tick = pendingHeartbeatTicks.get(correlationId);
  if (tick) {
    pendingHeartbeatTicks.delete(correlationId);
  }
  // ... pass tick to processHeartbeat
}
```

#### 4. Update `drainPendingHeartbeats` (~line 611)

Currently returns daemon messages.
Needs to also look up each message's tick from the Map.
Return `Array<{ message, tick }>` pairs:

```js
const drainPendingHeartbeats = async () => {
  const extra = [];
  const allMessages = await E(agentPowers).listMessages();
  for (const m of allMessages) {
    // ... existing filters ...
    const corrId = m.strings[0]?.trim().split(':').slice(1).join(':');
    const tick = pendingHeartbeatTicks.get(corrId);
    if (tick) {
      pendingHeartbeatTicks.delete(corrId);
      extra.push({ message: m, tick });
    }
  }
  return extra;
};
```

#### 5. Update `processHeartbeat` signature (~line 351)

Accept `tick` as a parameter instead of extracting from message:

```js
const processHeartbeat = async (
  agentPowers, piAgent, agentName, workspaceDir,
  message, tick,
  extraHeartbeats, // now Array<{ message, tick }>
) => { ... };
```

Remove the TODO block (lines 364-367).
Line 374 `tick.tickNumber` and line 462 `tick.tickResponse.resolve()`
now work.
Line 448-459 loop changes from `extra.heartbeat.tickResponse` to
`extra.tick.tickResponse`.

#### 6. Handle missing tick gracefully

If `pendingHeartbeatTicks.get()` returns undefined (e.g. after daemon
restart where the Map is empty but old messages still exist), skip the
heartbeat or log a warning and dismiss the stale message:

```js
if (!tick) {
  console.warn(`[genie:${agentName}] Stale heartbeat (no tick for ${correlationId}), dismissing`);
  await E(agentPowers).dismiss(message.number);
  continue;
}
```

### Why not alternatives

- **Persist tick as an endo formula / pet name**: The tick's
  `tickResponse` is a closure with mutable state — can't survive
  serialization.
  Would require redesigning the scheduler around daemon-persistent
  resolvers.
- **Skip daemon mail entirely (use async queue)**: Loses FIFO ordering
  with user messages.
  Heartbeats could starve or race with user interactions.
- **Encode tick data in message text (JSON)**: Can encode metadata
  (tickNumber, missedTicks) but not the `tickResponse` capability.
  Still needs the Map for the response handle.

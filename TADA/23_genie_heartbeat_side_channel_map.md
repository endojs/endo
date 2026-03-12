
# ✅ Implement side-channel Map for heartbeat tick delivery

Wire up a shared `Map<string, IntervalTickMessage>` between
`runHeartbeat` and `runAgentLoop` so that `processHeartbeat` receives
the live `tick` object (with `tickResponse.resolve()`) without
serializing it through daemon mail.

This is the implementation of the design from
`TADA/21_genie_heartbeat_tick.md` "Design: shared side-channel Map".

## Steps

### 1. Create the Map and counter in `spawnAgent`

File: `packages/genie/main.js` around line 898 (before `runAgentLoop`
and `runHeartbeat` calls).

```js
/** @type {Map<string, IntervalTickMessage>} */
const pendingHeartbeatTicks = new Map();
let heartbeatTickCounter = 0;
```

Pass `pendingHeartbeatTicks` (and a closure or ref for the counter) to
both `runAgentLoop` and `runHeartbeat` via their option bags.

### 2. Update `runHeartbeat` onTick callback

File: `packages/genie/main.js` around line 512.

- Generate a correlation ID: `hb-${++heartbeatTickCounter}`.
- Store the tick in the Map: `pendingHeartbeatTicks.set(corrId, tick)`.
- Change the message text from `['HEARTBEAT']` to
  `[`HEARTBEAT:${corrId}`]`.
- In the `.catch()` error path, delete the Map entry and resolve the
  tick to prevent scheduler stalls.

### 3. Update heartbeat detection in `runAgentLoop`

File: `packages/genie/main.js` around line 655.

- Change the `head.startsWith('/heartbeat')` check to
  `head.startsWith('heartbeat:')`.
- Parse the correlation ID from the message string.
- Look up and delete the tick from `pendingHeartbeatTicks`.
- If no tick found (stale message after restart), log a warning,
  dismiss the message, and `continue`.

### 4. Update `drainPendingHeartbeats`

File: `packages/genie/main.js` around line 611.

- Change the filter from `/heartbeat` prefix to `heartbeat:` prefix.
- For each matching message, look up and delete the tick from
  `pendingHeartbeatTicks`.
- Return `Array<{ message, tick }>` instead of plain messages.

### 5. Update `processHeartbeat` signature and body

File: `packages/genie/main.js` around line 351.

- Add `tick` parameter (type `IntervalTickMessage | undefined`).
- Change `extraHeartbeats` from `Array<Package>` to
  `Array<{ message: Package, tick: IntervalTickMessage | undefined }>`.
- Remove the TODO block at lines 364-367.
- Line 374: `tick.tickNumber` and `tick.missedTicks` now resolve.
- Line 462: `tick.tickResponse.resolve()` now works; guard with
  `if (tick)` for stale-message resilience.
- Lines 448-459: change `extra.heartbeat.tickResponse` to
  `extra.tick.tickResponse`; guard with `if (extra.tick)`.

### 6. Handle missing tick gracefully

In both `runAgentLoop` and `processHeartbeat`, if a heartbeat message
has no corresponding Map entry (e.g. after daemon restart), log a
warning and dismiss the stale message rather than crashing.

## Verification

- [x] `node --check packages/genie/main.js` — syntax OK.
- [ ] Run existing genie/daemon tests:
  `cd packages/daemon && npx ava test/endo.test.js --timeout=120s`
- [ ] Manual: start a genie agent with heartbeat enabled, verify
  console shows `Heartbeat tick #N (missed: M)` and ticks resolve
  without stalling.

## Implementation notes

All changes in `packages/genie/main.js`:

- Used `{ value: number }` object for the counter instead of a bare
  `let` so it can be passed by reference through the option bag.
- The `runAgentLoop` function declaration line
  (`const runAgentLoop = async ({`) was missing from the file; added
  it as part of this change.
- Stale heartbeat messages (no tick in the Map) are dismissed with a
  warning log in the `runAgentLoop` message loop rather than passed
  to `processHeartbeat`, but `processHeartbeat` also guards with
  `if (tick)` for defense-in-depth.

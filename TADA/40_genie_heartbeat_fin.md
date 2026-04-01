# Genie Heartbeat

Read and review the `packages/genie/src/heartbeat/` module.

Update this task with a design plan:
- for what it'll take to add heartbeat into the `packages/genie/main.js` plugin
- so that it uses `packages/genie/src/interval/`
- so that every created agent (via `packages/genie/src/agent/`) ...
- ... gets its own heartbeat, that shows up as a message in its inbox
- which interleaves with any normal user interaction messages

**DO NOT** start coding yet.

- [x] just make a plan for what interval-scheduled heartbeats will look like in our unconfined endo plugin

---

## Design Plan

### Goal

Each agent spawned by the Genie plugin gets its own periodic heartbeat.
Heartbeat ticks arrive as messages in the agent's daemon inbox,
interleaved with normal user messages, so the agent processes them
in FIFO order like any other interaction.

### Key Insight

The interval scheduler (`src/interval/`) already models per-agent
periodic wakeups with persistence, catch-up on restart, and
one-shot tick responses.
The heartbeat module (`src/heartbeat/`) provides the prompt
template (`buildHeartbeatPrompt`), status classification
(`isHeartbeatOk`, `HeartbeatStatus`), turn gating
(`makeTurnGate`), and event creation (`makeHeartbeatEvent`).
The plan is to wire these together inside `main.js` so that
interval ticks deliver heartbeat messages through the existing
daemon mail path.

### Changes by File

#### 1. `main.js` — `spawnAgent()` additions

After creating the PiAgent and starting `runAgentLoop`, also:

1. **Create an `IntervalScheduler`** per agent (or one shared
   scheduler with per-agent intervals — shared is simpler since
   the scheduler already supports multiple entries keyed by ID).
   A single scheduler instance lives in module scope; each
   `spawnAgent` call registers a new interval.

2. **Create a heartbeat interval** via
   `scheduler.makeInterval('heartbeat', periodMs, opts)`.
   - `periodMs` comes from agent config (default 5 min).
   - `tickTimeoutMs` mirrors `heartbeat.timeout` (default 90 s).
   - The `onTick` callback (passed into `makeIntervalScheduler`)
     sends a daemon mail message to the agent's own inbox.

3. **Wire the `onTick` callback** to:
   ```js
   // pseudo-code
   async function onTick(tick) {
     const prompt = buildHeartbeatPrompt(workspaceIsGit);
     const heartbeatMessage = harden({
       type: 'heartbeat',
       intervalId: tick.intervalId,
       tickNumber: tick.tickNumber,
       prompt,
     });
     await E(agentPowers).send(selfId, heartbeatMessage);
     // tick auto-resolves on timeout; we resolve early on
     // successful delivery
     tick.tickResponse.resolve();
   }
   ```
   This reuses the daemon's `send()` to place the heartbeat
   into the same inbox stream that `followMessages()` reads.

4. **Store the `IntervalHandle`** in the `activeAgents` Map
   alongside the PiAgent reference so we can cancel the heartbeat
   on agent teardown.

#### 2. `main.js` — `runAgentLoop()` changes

The message processing loop already iterates all inbound
messages. Changes:

1. **Detect heartbeat messages** by checking
   `message.type === 'heartbeat'`.

2. **Wrap with TurnGate** — call `makeTurnGate()` once per
   agent. Before processing *any* message (user or heartbeat),
   `tryAcquire()` the gate. On completion, `complete()`.
   This prevents a heartbeat tick from overlapping with an
   in-flight user interaction.

3. **For heartbeat messages**, extract the prompt and run a
   normal `runAgentRound(piAgent, prompt)`.  Stream events
   back the same way `processMessage` already does.

4. **Emit a `HeartbeatEvent`** after the round completes,
   using `makeHeartbeatEvent(Date.now(), status)` where
   `status` is derived from `isHeartbeatOk(response)`.
   This is informational (logged / observable) but not
   required for correctness.

5. **If gate acquisition fails** (agent busy with a user
   turn), the tick's `tickResponse.reschedule()` triggers
   the scheduler's exponential backoff retry — no custom
   retry logic needed.

#### 3. `main.js` — `runLoop()` / config form changes

Add an optional `heartbeatPeriod` field to the configuration
form so operators can set the interval per agent (or disable it
with `0`). Default: `300_000` (5 minutes).

#### 4. Scheduler instantiation

Create the shared `IntervalScheduler` at module scope inside
`make()`:

```js
const intervalsDir = path.join(statePath, 'intervals');
const { scheduler, schedulerControl } =
  makeIntervalScheduler({
    intervalsDir,
    onTick,          // dispatches to agent inbox
    onError: logErr, // surfaces in daemon logs
  });
```

On daemon restart, `makeIntervalScheduler` calls
`readAllEntries` and re-arms all persisted intervals,
delivering catch-up ticks with `missedTicks` count, so
heartbeats resume automatically.

#### 5. No changes needed in `src/heartbeat/` or `src/interval/`

Both modules are already designed for this integration:
- The scheduler's `onTick` → inbox delivery pattern is
  exactly its intended use.
- `buildHeartbeatPrompt` and `isHeartbeatOk` are pure
  functions that need no modification.
- `makeTurnGate` is instantiable per-agent with no
  scheduler coupling.

### Sequencing (what to implement first)

1. Shared `IntervalScheduler` creation in `make()`.
2. `heartbeatPeriod` config field on the form.
3. `onTick` → `send()` wiring in `spawnAgent()`.
4. TurnGate integration in `runAgentLoop()`.
5. Heartbeat message detection and round execution.
6. HeartbeatEvent emission (nice-to-have, not blocking).

### Risks / Open Questions

- **Message schema**: daemon mail may enforce a specific
  envelope shape. Need to verify that `send(selfId, obj)`
  accepts arbitrary payloads or whether we must wrap in
  a standard message type (e.g. `{ type: 'text', ... }`).
- **Self-send permission**: confirm that an agent guest
  can send mail to its own inbox (some CapTP policies
  may restrict self-delivery).
- **Interval persistence path**: `statePath` must be
  resolvable from `guestPowers`; if not, we pass it
  through config or derive from `workspaceDir`.
- **Graceful shutdown**: when the daemon shuts down,
  the scheduler's `setTimeout` handles leak unless we
  call `schedulerControl.revoke()`. Wire this to the
  daemon's cancellation signal if one exists.

# Genie Heartbeat

- [x] Implement the planned heartbeat integration design plan below

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
interleaved with normal user messages,
so the agent processes them in FIFO order
like any other interaction.

### Key Insight

The interval scheduler (`src/interval/`) already models:
- per-agent periodic wakeups
- with persistence
- catch-up on restart
- one-shot tick responses

The heartbeat module (`src/heartbeat/`) provides:
- the prompt template (`buildHeartbeatPrompt`)
- status classification (`isHeartbeatOk`, `HeartbeatStatus`)
- turn gating (`makeTurnGate`)
- event creation (`makeHeartbeatEvent`)

**NOTE** the turn gate piece should not be necessary:
- genie agents only ever take one turn at a time due to being serialized by
  their daemon message inboxes
- we should however coalesce replies:
  - if by the time we get around to processing a message
  - and it has already accrued more follow-up replies, collect all of them as
    input for the agent's next turn, and reply to the latest-such-coalesced
    message id
  - TODO delete all of the heartbeat turn gate code

The plan is to wire these together inside `main.js` so that interval ticks
deliver heartbeat messages through the existing daemon mail path.

### Changes by File

#### 1. `main.js` — `spawnAgent()` additions

After creating the PiAgent and starting `runAgentLoop`, also:

1. **Create an `IntervalScheduler`** per agent: we want one scheduler for each
   agent, since each scheduler has a moderate `maxActive` limit, and we do not
   want to limit the number of created agents by sharing a scheduler.

2. **Create a heartbeat interval** via
   `scheduler.makeInterval('heartbeat', periodMs, opts)`.
   - `periodMs` comes from agent config (default 30 min).
   - `tickTimeoutMs` mirrors `heartbeat.timeout` (default 15 min).
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

4. **Store the `IntervalHandle`** inside the agent closure, and provide
   internal tool(s) for inspecting heartbeat status, runtime stats ( number
   completed, last time elapsed, etc ); each agent teardown should also
   teardown its scheduler, canceling any outstanding timers.

#### 2. `main.js` — `runAgentLoop()` changes

The message processing loop already iterates all inbound
messages. Changes:

1. **Detect heartbeat messages** by checking
   `message.type === 'heartbeat'`.
   - in particular, when processing a heartbeat event, coalesce and
     de-duplicate any other pending heartbeat messages at the same time; no
     stacked heartbeats, one run clears all pending

2. **For heartbeat messages**, extract the prompt and run a
   normal `runAgentRound(piAgent, prompt)`.  Stream events
   back the same way `processMessage` already does.

3. **Emit a `HeartbeatEvent`** after the round completes,
   using `makeHeartbeatEvent(Date.now(), status)` where
   `status` is derived from `isHeartbeatOk(response)`.
   This is informational (logged / observable) but not
   required for correctness.
   - record this event into a status file in the agent's workspace

#### 3. `main.js` — `runLoop()` / config form changes

- Add an optional `heartbeatPeriod` field to the configuration form so
  operators can set the interval per agent (or disable it with `0`). Default:
  `1_800_000` (30 minutes).

- Add an optional `heartbeatTimeout` field to the configuration form so that
  operators can set the timout per agent. Default: `heartbeatPeriod/2` (so 15
  minutes when using the default 30 minute heartbeat period).

#### 4. Scheduler instantiation

Create the shared `IntervalScheduler` inside `spawnAgent()`:

```js
const intervalsDir = path.join(statePath, 'intervals');
const { scheduler, schedulerControl } =
  makeIntervalScheduler({
    intervalsDir,
    onTick,          // dispatches to agent inbox
    onError: logErr, // surfaces in daemon logs
  });
```

On daemon restart, `makeIntervalScheduler` calls `readAllEntries`
and re-arms all persisted intervals,
delivering catch-up ticks with `missedTicks` count,
so heartbeats resume automatically.

#### 5. No changes needed in `src/heartbeat/` or `src/interval/`

Both modules are already designed for this integration.

But the turn gate is redundant, delete `makeTurnGate` and all related turn gate
code.

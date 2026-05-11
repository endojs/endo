# Genie Loop: Remote Mode

> **Status: deferred future work.**
> No implementation tasks are scheduled yet.
> The in-process refactor tracked in
> [`genie_loop_overview.md`](./genie_loop_overview.md) steps 1–6 must
> land first and demonstrate value before remote mode is revisited.
> Until then, this document is a reference for where the design is
> headed, not a to-do list.

## Goal

Run the existing `dev-repl.js` against a **running** genie plugin
instead of an in-process agent, so that the same REPL UX can drive
integration tests against a real daemon deployment.

In-process today:

```
dev-repl.js ──in-process──▶ makePiAgent → runAgentRound
                       └─▶ observer / reflector / heartbeat
```

Remote target:

```
dev-repl.js ──daemon mail──▶ endo daemon ──▶ genie plugin guest
                                         └─▶ makePiAgent / observer / …
```

## Motivation

- Reproducibility: exercise the actual plugin lifecycle (guest
  provisioning, form submission, heartbeat ticker, tool allow-list)
  from a single, scriptable command.
- CI coverage: a shell-driven REPL script can exercise plugin
  behaviour end-to-end with real mail latency.
- Parity check: if a feature works in-process but not in-plugin (or
  vice-versa), the divergence is the bug — we'll find it here.

## Non-goals

- Progressive token / thinking / tool-call visibility through endo
  mail.
  Mail messages are immutable today; only the final assistant text
  is observable.
  See [Event channels](#event-channels) for future options.
- Replacing the in-process dev-repl.
  Both modes stay supported so local development does not require a
  running daemon.

## Endo mail recap

Relevant pieces of the daemon mail model, drawn from what main.js
already uses:

- `E(hostAgent).followMessages()` → iterator of `{ number, strings,
  from, type, replyTo, valueId, ... }`.
- `E(hostAgent).send(to, strings, blobs, packages)` — primary way
  the caller nudges a guest.
- `E(hostAgent).reply(number, strings, blobs, packages)` — the
  guest's reply to a specific inbound message.
- `E(hostAgent).listMessages()` — synchronous snapshot.
- `E(hostAgent).dismiss(number)` — mark a message handled.
- `E(hostAgent).form(to, label, fields)` / `E(hostAgent).submit(
  number, values)` — structured form lifecycle (used by setup.js).

Nothing in this list supports a *mutable* mail message.
A guest cannot edit a previously-sent string chunk to tack on more
text as it streams.
The practical consequence for remote dev-repl:

- "Thinking…" placeholders cannot be upgraded in place.
- Tool-call start/end events cannot be reported progressively
  without sending many separate messages.

## Proposal

Add a remote-mode flag to `dev-repl.js`:

```
node dev-repl.js --remote main-genie [-m provider/modelId] …
```

When `--remote <agentName>` is set:

1. Resolve the endo host (via `@endo/cli` libraries already used
   elsewhere, or `@endo/daemon`'s client API).
2. Look up the target agent guest by pet name.
3. Replace the local `runPrompt` path with a remote one:
   - `send(<agentName>, [promptText], [], [])` with
     `@self`-scoped addressing as needed.
   - Watch our own inbox for a `reply` whose `replyTo` is the
     outbound message's id.
   - Render the reply text as the REPL's assistant message.

The rest of the dev-repl stays the same:

- Readline prompt source unchanged.
- Specials dispatcher reused, but the built-in set is pared back —
  in remote mode we can only offer commands that the plugin
  supports (`/heartbeat`, `/observe`, `/reflect`), so the REPL
  proxies `.heartbeat` → `/heartbeat`, etc.
- Background printer degrades to a simple "waiting…" spinner
  because no sub-agent events are visible.

Keep the migration incremental:

- Phase A: single-prompt, synchronous reply (no streaming). Works
  with what main.js emits today.
- Phase B: accept the plugin's intermediate `Thinking…` /
  `Calling tool …` status replies as log-only lines in the REPL.
- Phase C: wire up an out-of-band event channel (see below) so
  observer/reflector events surface in the REPL.

## Options for the remote transport

| Option                              | Shape                                                                              | Pros                                              | Cons                                                           |
|-------------------------------------|------------------------------------------------------------------------------------|---------------------------------------------------|----------------------------------------------------------------|
| A. Raw mail (same as main.js today) | `send` + `followMessages` + match on `replyTo`                                     | Zero new protocol; minimal code                   | No structured event typing; text-only                          |
| B. Structured mail w/ typed strings | Prefix each chunk with `[event-type]` (e.g. `[tool]`, `[thinking]`)                | Recovers some event structure; still one-way text | Fragile to chunk boundary choices                              |
| C. Dedicated event capability       | Plugin exposes an exo method the REPL can call to subscribe to ChatEvents          | Proper event streaming; typed                     | Needs a new exported interface; each REPL is a distinct client |
| D. Shared file/ring buffer          | Plugin appends JSON-line events to `${workspace}/.genie/events.log`; REPL tails it | Cheap; works today                                | Out-of-band, racy                                              |

Phase A picks **option A**.
Phase C should revisit **option C** (dedicated capability) once the
rest of the plan has landed — it composes cleanly with the existing
observer/reflector `subscribe` API.

## Event channels

Extended thinking on the progressive-updates limitation.
Each option below is just a slice of the larger
[observer/reflector parity](./genie_loop_architecture.md#observer-reflector-parity)
design, extended to cover the main piAgent too.

### Option C in detail

Add an exo method on the genie guest:

```js
E(genie).followEvents() // returns a far-ref iterator of ChatEvent
```

Implementation: build on the existing `subscribe` APIs.
Subscribers can buffer events and expose them via a `makeRefIterator`-
compatible consumer.

Client side in dev-repl:

```js
const events = await makeRefIterator(E(remoteGenie).followEvents());
for await (const event of events) {
  for (const chunk of renderAgentEvent(event, { label: 'genie' })) {
    process.stdout.write(chunk);
  }
}
```

Complications:

- **Back-pressure**: a disconnected REPL must not stall the plugin.
  The buffer needs a bounded size with drop-oldest semantics.
- **Multi-client**: observer/reflector already support N
  subscribers; this is just another subscriber.
- **Reconnect**: dev-repl restarting mid-round loses in-flight
  events.  Accept that for phase C; phase D could add a replay
  cursor.

### Option D: JSONL event log

An orthogonal mechanism — the plugin already owns the workspace
directory and could append ChatEvents to
`${workspaceDir}/.genie/events.log` regardless of whether a REPL is
attached.
Useful for post-mortem debugging even when no REPL is connected.

Recommend: do both.
JSONL for durability / post-mortem; exo method for live streaming.

## Test strategy

Once remote mode works, wire a shell harness that:

1. Starts an endo daemon in a tmp dir.
2. Runs `endo run --UNCONFINED setup.js --powers @agent` with env
   vars that point at a tmp workspace.
3. Waits for the plugin to announce "agent ready".
4. Runs `node dev-repl.js --remote main-genie -c "prompt text"` for
   each scenario.
5. Asserts on the final text reply.
6. Tears down the daemon.

This matches `packages/genie/test/integration.sh` (already
referenced from `package.json` `test:integration`) — extend that
harness rather than introducing a new one.

## Dependencies on other plan docs

Remote mode is the last phase in the larger refactor and depends on:

- [`genie_loop_overview.md`](./genie_loop_overview.md) §
  "Implementation Plan" — steps 1–6 must land first.
  Step 7 (remote-mode dev-repl) is currently marked deferred.
- [`genie_loop_architecture.md`](./genie_loop_architecture.md)
  § "IO adapter" — the `GenieIO` interface is the natural seam.
  A remote-mode adapter is just another `GenieIO` implementation
  backed by endo mail.
- [`genie_loop_architecture.md`](./genie_loop_architecture.md)
  § "Observer/reflector parity" — option C (`followEvents`) reuses
  the existing `subscribe` APIs, and (once heartbeat gains a
  `subscribe` API per the parity work) naturally covers heartbeat
  events too.

Once the IO adapter is in place, remote mode is almost entirely a
question of wiring, with the one open architectural decision being
the shape of the event channel (options C vs D vs both).
That decision is deferred along with the rest of remote mode — see
the status note at the top of this document.

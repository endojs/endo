# Genie: review observer/reflector streaming, then design & implement background streaming

Follow-up task spun out of `TODO/50_genie_obs_obs.md` (see the
"Future: background streaming" section at the end).
Depends on `TODO/51_genie_observer_stream.md` and
`TODO/52_genie_reflector_stream.md` being landed.

This task has two phases — do not start Phase 2 until Phase 1
has surfaced any rework the earlier tasks need.

## Phase 1 — review prior work

- [x] Review the landed changes from
  `TODO/51_genie_observer_stream.md`:
  - [x] Observer `observe(mainAgent)` API shape and lifetime
    semantics (`running` flag, `hwm` advancement, cleanup on
    consumer abort).
    Verified: `beginObservation()` guards on `running` and
    `hwm >= messages.length`; `guarded()` clears
    `running`/`inflight` in a `finally`; `runObservation()`
    advances `hwm` in its own `finally` so abort-early still
    commits progress.  `isRunning()` / `highWaterMark()` /
    `stop()` behave as advertised.
  - [x] `.observe` dot-command UX: labels, colours, error paths,
    edge cases (no unobserved messages, already running).
    Verified at `packages/genie/dev-repl.js:436–455`.  Uses
    `label: 'observer'` which reuses the cyan BOLD `observer>`
    prefix; colour-coded error / no-op / success branches;
    `.help` line at 399 lists it.
  - [x] Tests cover abort-before-drain and post-drain state.
    Verified: `observe — advances hwm and clears running after
    full drain` (observer.test.js:394), `observe — clears
    running when consumer aborts early` (observer.test.js:472;
    also asserts `hwm` advanced and follow-up observe returns
    `undefined`).
  - [x] Automatic triggers (`check`, `onIdle`, heartbeat) still work
    without regressions.
    Verified: `triggerObservation()` reuses `beginObservation()`
    and silently drains; pre-existing `check`/idle-delay/
    structural tests pass (24/24 in observer.test.js).
- [x] Review the landed changes from
  `TODO/52_genie_reflector_stream.md`:
  - [x] Reflector `reflect()` API shape and lifetime semantics.
    Verified: `reflect()` returns `Promise<AsyncIterable
    <ChatEvent> | undefined>`, awaits `makeAgent` with explicit
    cleanup on throw (index.js:297–302), constructs the stream
    eagerly so it's built exactly once per cycle, wraps in
    `guarded()` to clear `running`/`inflight` in `finally`.
  - [x] `.reflect` dot-command UX parity with `.observe`.
    Verified at `packages/genie/dev-repl.js:457–476`.  Same
    colour scheme and label style as `.observe`; see TADA 52
    follow-up for the redundant inner `undefined` branch nit.
  - [x] Tests cover abort-before-drain and post-drain state.
    Verified: `reflect — clears running after the stream is
    fully drained` (reflector.test.js:282), `reflect — clears
    running when consumer aborts early` (:357), and `reflect —
    searchBackend.sync() fires even when consumer aborts early`
    (:437).
  - [x] Automatic triggers (`run`, `checkAndRun`, heartbeat) still
    work without regressions.
    Verified: `run — silently drains the underlying reflect()
    stream` (:476), `run — skips work when a reflection is
    already running` (:499), `checkAndRun — triggers run() when
    threshold is exceeded` (:545).
- [x] Capture any follow-up fixes as checkboxes in the corresponding
  TADA file(s) or as new TODO files — do not silently fix them here,
  keep the review auditable.
  Follow-ups captured in:
  - `TADA/51_genie_observer_stream.md` § "Follow-ups …" —
    observer-side abort-sync coverage, empty-excerpt behaviour,
    `makeAgent`-throw behaviour, `stop()` awaits in-flight
    stream.
  - `TADA/52_genie_reflector_stream.md` § "Follow-ups …" —
    `reflect()`-rejects branch of `run()`, `makeAgent`-throws
    cleanup test, redundant inner `undefined` branch in
    `.reflect`.
  None are blockers for Phase 2.  The existing streaming APIs
  are structurally sound and support the broadcast-hook shape
  described in Phase 2 without restructuring.

## Phase 2 — design & implement background streaming

Context (from `TODO/50_genie_obs_obs.md` § "Future: background
streaming"):

> For automatic (non-command) observer/reflector runs, we could
> optionally interleave their events into the REPL output stream
> between user prompts.
> This is out of scope for this task but the design supports it:
> the stream-returning API means any caller can choose to render
> or discard events.

- [x] **Design** (write it up in this file before touching code).
  See § "Design notes" below.  Highlights:
  - Events are emitted to a `subscribe(handler)` broadcast hook
    on the observer/reflector.  Automatic triggers publish to
    subscribers; explicit `observe()` / `reflect()` consumers
    continue to own their returned iterable directly.
  - The REPL subscribes once at startup and queues events
    received while a prompt is in flight or while the user is
    typing; events drain between prompts.
  - Each line is prefixed with the sub-agent label (e.g.
    `[observer]`, `[reflector]`) and dimmed so background output
    is visually distinct from main-agent output.
  - Opt-out is a dot-command toggle `.background on|off` plus a
    `--quiet-background` CLI flag; default is **on**.
  - Subscriber errors are isolated; one throwing handler cannot
    break other subscribers or the sub-agent stream.
- [x] **Implement** the agreed design:
  - [x] Plumb a subscriber / broadcast hook into observer and
    reflector so automatic runs can emit events without the caller
    holding the returned iterable.
    Observer landed in task 51's follow-up; reflector's
    `subscribe()` added here (`packages/genie/src/reflector/index.js`)
    with matching semantics and unit tests.  `guarded()` in both
    modules now calls `publish(event)` before yielding, so
    explicit and auto-trigger cycles broadcast identically.
  - [x] Wire the REPL to subscribe when it starts and unsubscribe
    on `.exit`.
    `runMain` constructs a `makeBackgroundPrinter({ rl, quiet })`
    once, subscribes it to both sub-agents, and the subscription
    is torn down when the process exits (the subscriber closure is
    eligible for GC once the printer is unreachable — no explicit
    `unsubscribe()` is needed for process-exit cleanup).
  - [x] Render events with a distinct prefix (reuse the `label`
    option added by tasks 51/52).
    Per-event preview rendered via `renderBackgroundEvent(event,
    label)` — a single dim `[observer]` / `[reflector]` prefix per
    line, preserving the yellow ⚡ / green ✓ / magenta 💭 / cyan
    `observer>` / `reflector>` palette used by `runAgentEvents`.
    Streaming deltas and echoed `UserMessage` are dropped so the
    background stream stays high-signal.
  - [x] Handle readline redraw cleanly so background output does
    not corrupt the prompt line.
    Printer has `idle` / `busy` states wired through
    `readPrompts({ onIdle, onBusy })`.  In idle state it pauses
    readline, clears the line (`readline.cursorTo` +
    `readline.clearLine`), writes the chunk, resumes readline, and
    calls `rl._refreshLine()` (falling back to `rl.prompt(true)`)
    to redraw the prompt including any partially-typed buffer.
    In busy state events are queued and flushed on the next
    idle transition — no mid-stream interleaving with main-agent
    output.  Dot-command paths (`.observe`, `.reflect`) mute the
    corresponding label during their `runAgentEvents` drive to
    avoid duplicate output.
  - [x] Add tests for the broadcast hook (multiple subscribers,
    unsubscribe, error-in-subscriber isolation).
    `test/observer.test.js` and `test/reflector.test.js` both add:
    explicit-cycle subscribe, unsubscribe (+ idempotent), multiple
    subscribers, throwing-subscriber isolation, auto-trigger
    publish.  Full suite: 242 tests pass.
- [x] **Document**:
  - [x] Update `.help` output in `dev-repl.js` if a new toggle is
    added.
    `.background on|off|status` documented in `.help`; the file
    header usage comment lists `--quiet-background`.
  - [x] Note the new subscriber API in the observer and reflector
    module docblocks.
    Added an "Event subscribers" section to both module docstrings
    and `@property subscribe` entries on the `Observer` /
    `Reflector` typedefs.

## Landed

- `packages/genie/src/reflector/index.js` — `subscribe()` / `publish()`
  added, `guarded()` now broadcasts.
- `packages/genie/dev-repl.js` — `makeBackgroundPrinter`,
  `renderBackgroundEvent`, `readPrompts({ rl, onIdle, onBusy })`,
  `.background` dot-command, `--quiet-background` CLI flag, dot-command
  mute logic.
- `packages/genie/test/observer.test.js` — 5 new `subscribe` tests.
- `packages/genie/test/reflector.test.js` — 5 new `subscribe` tests.

## Follow-ups (non-blocking)

- Bounded replay buffer when quiet: design notes say quiet-mode events
  should be retained so `.background on` can flush recent history.
  Current implementation drops events in quiet mode.  A small
  ring-buffer (e.g. 100 events) would satisfy the original design.
- Integration test that exercises the full REPL flow with a live
  stdout capture would validate the readline redraw behaviour.  Unit
  tests cover the broadcast hook but not the idle/busy state machine
  in `makeBackgroundPrinter` directly — worth a dedicated test file
  if the state machine grows.
- `_refreshLine()` is a private Node API; a fallback to
  `rl.prompt(true)` is in place but partial-buffer restore is
  imperfect in older Node versions.  Revisit when/if we support
  multi-line input.

## Design notes

### Broadcast hook on the sub-agents

Both observer and reflector already build their event streams
through internal helpers (`runObservation` / `runReflection`) and
wrap them in a `guarded()` generator that clears the `running`
flag.  The smallest change that lets *automatic* triggers emit to
the REPL without changing the explicit-invocation contract is to
tap the event stream inside the `guarded()` wrapper, forwarding
each event to any registered subscribers.

Public API added to both `Observer` and `Reflector`:

```js
/**
 * Register a handler that receives every ChatEvent emitted by the
 * sub-agent, regardless of whether the event was produced by an
 * explicit caller-driven cycle (observe() / reflect()) or an
 * automatic-trigger cycle (check / onIdle / run / checkAndRun /
 * heartbeat).
 *
 * Returns an unsubscribe function.  Calling it is idempotent.
 *
 * Handler errors are caught and logged via console.error; a
 * throwing handler never blocks the sub-agent stream or other
 * subscribers.  Handlers run synchronously from the guarded()
 * iterator so back-pressure from the handler does not stall the
 * sub-agent.
 *
 * @param {(event: ChatEvent) => void} handler
 * @returns {() => void} unsubscribe
 */
subscribe(handler)
```

Implementation:

- The factory closes over a `Set<handler>` of subscribers.
- `guarded()` becomes: for each event, call `publish(event)` (which
  iterates subscribers in a try/catch) *and* yield it to the
  caller.  Explicit callers still see the full event stream; if no
  explicit caller is driving the iterable (auto-trigger path),
  subscribers are the only consumers.
- `triggerObservation()` and `run()` / `checkAndRun()` stay
  fire-and-forget but the drain is no longer a pure `/dev/null` —
  the drain still runs silently, but `publish` inside `guarded()`
  has already broadcast each event.

### REPL integration

The REPL owns a single **background printer** that:

1. Maintains a FIFO queue of (label, event) pairs.
2. When a user prompt is being processed (main agent is streaming
   output), events are queued rather than printed.  The queue is
   flushed after the main-agent output completes but before the
   next prompt is drawn.
3. When the REPL is idle at the readline prompt, events print
   inline.  We `rl.pause()` before emitting, clear the current
   prompt line with `readline.cursorTo(output, 0)` +
   `readline.clearLine(output, 0)`, write the event chunks,
   redraw the prompt (`rl.prompt(true)` preserves the partially
   typed input), and `rl.resume()`.
4. If the user is mid-typing (line buffer non-empty), we still
   redraw so no keystrokes are dropped — readline already
   tracks the buffer; `rl.prompt(true)` restores it.

Rendering:

- Reuses `runAgentEvents` with `label: 'observer'` /
  `'reflector'`.  But for background output we wrap the per-event
  chunks in an additional dim prefix so the user can distinguish
  at a glance:

  ```
  ┌ observer starting…
  │ ⚡ memoryGet {"path":"observations.md"}
  │   ✓ done
  │ 💭 extracting new observations …
  │ observer> Wrote 7 observations.
  └ observer done (1.2s)
  ```

  A lightweight implementation: a helper generator
  `labelledBackgroundEvents(events, label)` that wraps
  `runAgentEvents(events, { label })` and prefixes each emitted
  chunk with a dim vertical-bar.  Start / done banners bracket
  the block.

### Concurrency (observer + reflector at once)

Events from concurrent streams are interleaved in arrival order —
the broadcast hook fires as each event lands, and the printer
queue is a single FIFO.  The per-line label makes the
provenance unambiguous, so strict ordering per sub-agent is
preserved (each sub-agent still emits its own events in order)
without needing to serialise the two streams.

### Readline prompt coexistence

During long main-agent responses the REPL is not at the prompt
line — we are writing agent output directly to stdout.  In that
window the printer simply appends to the queue; flush happens
after the agent's `Message` event completes.

When idle at the prompt, the redraw strategy above works for
single-line input.  Multi-line / history-aware editing is not
currently supported by `dev-repl.js`, so we do not have to worry
about partial recall.

### User signalling

- **Start** banner: `┌ observer starting…` (dim cyan for observer,
  dim magenta for reflector).
- **End** banner: `└ observer done (Xs)` or `└ observer failed: …`
  in dim red.
- Empty-excerpt observer runs emit no banner (nothing to show).

### Opt-out

- CLI flag `--quiet-background` suppresses all background
  printing.  Events are still collected in the queue (so a
  future `.background on` can flush recent ones) but nothing
  hits stdout.
- Dot command `.background on|off|status` toggles at runtime.
- Default: **on** (unless `--quiet-background` was passed).

### User submits a prompt while background output is draining

The queue drains synchronously, so by the time the REPL sees a
new prompt and calls `runPrompt`, the flush loop has already
emptied the buffer.  If new events arrive during `runPrompt`,
they are queued and printed after the main agent's output.  This
means: the user never sees a prompt line interrupted mid-send,
and background output never silently discards events.

### Failure modes

- Subscriber throws: caught inside `publish`, logged via
  `console.error('[observer|reflector] subscriber failed:', err)`,
  other subscribers continue to receive the event.
- Sub-agent stream throws: the existing error-logging in
  `triggerObservation` / `run()` handles it; the REPL's
  background printer renders nothing special (the `Error`
  ChatEvent is already in the stream, so `runAgentEvents`
  handles it).
- Printer throws (e.g. EPIPE on stdout write): log and drop the
  event; do not break the sub-agents or the REPL loop.

### Impact on `triggerObservation()` and `run()`

Neither needs to change its signature.  The drain still happens
inside `guarded()`, but `guarded()` now publishes each event to
subscribers before yielding, so the silent drain in
`triggerObservation` / `run` is still "silent" from the
sub-agent's perspective while the REPL receives events via
`subscribe`.

## References

- `TODO/50_genie_obs_obs.md` — original analysis and the "Future:
  background streaming" notes.
- `TODO/51_genie_observer_stream.md` — observer prerequisite.
- `TODO/52_genie_reflector_stream.md` — reflector prerequisite.
- `packages/genie/dev-repl.js` — `runAgent`, `readPrompts`, and
  the readline integration that has to coexist with background
  output.

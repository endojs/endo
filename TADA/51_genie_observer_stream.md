# Genie: expose observer ChatEvent stream and block `.observe` until done

Follow-up task spun out of `TODO/50_genie_obs_obs.md` (see the "Design
Plan" there for background and the original analysis).
This task covers the **observer** half only; the reflector is handled
separately in `TODO/52_genie_reflector_stream.md`.

## Goals

1. Expose the `AsyncIterable<ChatEvent>` produced by the observer's
   internal PiAgent so callers can render it.
2. Render sub-agent observer events in `dev-repl.js` with a distinct
   label (e.g. `observer>`) so output is not confused with the main
   agent's output.
3. Make the `.observe` dot-command block the REPL until the
   observation cycle is complete — stream events as they happen,
   then report success/failure.

The existing fire-and-forget `triggerObservation()` path used by the
**automatic** triggers (token threshold via `check()`, idle timer via
`onIdle()`, heartbeat-driven runs) must continue to work unchanged —
it drains events silently in the background.

## Action items

- [x] `src/observer/index.js`
  - [x] Change the internal `runObservation(messages, fromIndex)` so
    that instead of draining the stream it returns an
    `AsyncIterable<ChatEvent>` whose iterator:
    1. `yield*`s the events from `runAgentRound(observerAgent, prompt)`,
    2. in a `finally` block performs post-run cleanup:
       flush `searchBackend.sync()` if present, then advance `hwm` to
       `messages.length`.
  - [x] Add a new public method on the returned `Observer`:
    ```js
    /**
     * @param {any} mainAgent
     * @returns {AsyncIterable<ChatEvent> | undefined}
     *   undefined when an observation is already running or there are
     *   no unobserved messages.
     */
    observe(mainAgent)
    ```
    It must:
    - return `undefined` if `running` is already true,
    - return `undefined` if `hwm >= messages.length`,
    - otherwise set `running = true`, build the stream, and return an
      async iterable that `yield*`s that stream and clears
      `running` / `inflight` in a `finally` block so cleanup happens
      whether the caller fully drains or aborts early.
  - [x] Keep `triggerObservation(mainAgent)` working for the
    auto-trigger paths.
    Reuse the new stream-returning internals by driving the stream
    via a detached drain (`for await (const _ of stream) {}`) inside
    the existing `.catch()`/`.finally()` wrapper.
    The stream must only be constructed once per cycle.
  - [x] Update the `Observer` typedef to document the new
    `observe(mainAgent)` method.
  - [x] `harden(...)` any new exported helpers; retain existing
    `harden` calls.
- [x] `dev-repl.js`
  - [x] Add an optional `label` parameter to `runAgentEvents(events,
    options)` (default `'genie'`) that replaces the `genie>` prefix
    in the final Message branch.  Use the same label style / colour
    as today so the visual is consistent.
  - [x] Rewrite the `.observe` handler to use the new API:
    ```js
    } else if (prompt === '.observe') {
      if (!observer) { ... }
      else if (observer.isRunning()) { ... }
      else {
        const events = observer.observe(piAgent);
        if (!events) {
          yield `${DIM}No unobserved messages to process.${RESET}\n`;
        } else {
          yield `${DIM}Running observation cycle...${RESET}\n`;
          try {
            yield* runAgentEvents(events, { verbose, label: 'observer' });
            yield `${GREEN}✓ Observation complete.${RESET}\n`;
          } catch (err) {
            yield `${RED}Observation failed: ${/** @type {Error} */ (err).message}${RESET}\n`;
          }
        }
      }
    }
    ```
  - [x] Delete the stale TODO comment above `makeObserver({...})` in
    `runMain()` (the one that says "we need observability so that
    background work can be printed for debugging").
    (Note: the parallel comment above `makeReflector({...})` remains
    and is the subject of `TODO/52_genie_reflector_stream.md`.)
- [x] Tests
  - [x] Update / add `packages/genie/test/observer.test.js` coverage
    for the new `observe()` method:
    - returns `undefined` when already running;
    - returns `undefined` when `hwm >= messages.length`;
    - yields events when invoked with unobserved messages;
    - advances `hwm` and clears `running` when the stream is fully
      drained;
    - clears `running` even if the consumer aborts early
      (e.g. `break` out of the `for await`).
  - [x] Confirm existing automatic-trigger tests (`check`, `onIdle`,
    threshold) still pass — the silent-drain behaviour must be
    preserved.

## Verification

- `cd packages/genie && npx ava test/observer.test.js --timeout=30s` —
  24 tests pass (7 new `observe —` cases plus the pre-existing
  serialisation, token-estimation, and structural coverage).

## Follow-ups (surfaced during Phase 1 review of `TODO/53_genie_obs_bg_stream.md`)

These gaps were identified while reviewing the landed observer
streaming work prior to designing background streaming.
None are blockers for task 53 Phase 2 but should be resolved for
parity with the reflector and to tighten edge-case behaviour.

- [x] Add a test parallel to
  `reflect — searchBackend.sync() fires even when consumer aborts early`
  for the observer (abort-early sync-flush coverage).
  Added as
  `observe — searchBackend.sync() fires even when consumer aborts early`
  in `packages/genie/test/observer.test.js`.
  Multi-event scripted stream, `break` on the first event; asserts
  `syncCalls === 1` via the `runObservation` attempt-level `finally`
  and `running` cleared after the early abort.
- [x] Decide / document the empty-excerpt behaviour in
  `runObservation`.
  Resolved: `beginObservation` short-circuits the empty-excerpt range
  — it advances `hwm = messages.length` and returns `undefined`
  without constructing a sub-agent or entering a cycle.
  Prevents auto-trigger and explicit callers from repeatedly paying
  a `makeAgent` cost for a range that will never yield events.
  Locked in by
  `observe — empty-excerpt short-circuit advances hwm without constructing an agent`,
  which asserts `highWaterMark === messages.length` and that neither
  `makeAgent` nor `runAgent` was invoked.
  Typedef for `observe` updated to document the behaviour.
- [x] Decide / document behaviour when `makeAgent` throws inside
  `runObservation`.
  Resolved: `makeAgent` is now awaited eagerly inside
  `beginObservation` (mirroring the reflector's eager-construction
  shape) inside a `try/catch` that clears `running` / `inflight` and
  resolves `resolveInflight` before re-throwing.
  Failures therefore surface as a synchronous-looking rejection from
  `observe()` rather than lazily on first iteration, and the observer
  is ready to accept subsequent `observe()` calls immediately.
  Locked in by
  `observe — rejects and clears running when makeAgent throws`, which
  asserts the exact error propagates, `running` is cleared, `hwm` is
  not advanced, `runAgent` is never invoked, `stop()` resolves, and a
  follow-up `observe()` on the same instance proceeds.
- [x] Add a test that `stop()` awaits an in-flight `observe()` stream.
  Added as `stop — awaits an in-flight observe() stream`.
  Uses a gated `runAgent` to park the cycle mid-drain, starts drain
  and `stop()` concurrently, waits a macrotask to confirm neither
  resolved, releases the gate, and asserts `stop()` resolves after
  the drain completes and `running` is cleared.

## Out of scope

- Reflector changes — see `TODO/52_genie_reflector_stream.md`.
- Surfacing automatic (non-command) observer runs into the REPL
  output stream — see `TODO/53_genie_obs_bg_stream.md`.

## References

- `TODO/50_genie_obs_obs.md` — original analysis and design plan.
- `packages/genie/src/observer/index.js` — current implementation
  (see `runObservation`, `triggerObservation`, `check`, `onIdle`).
- `packages/genie/dev-repl.js` lines ~155–299 (`runAgentEvents`) and
  ~433–456 (current `.observe` handler).
- `packages/genie/src/agent/index.js` — `ChatEvent`, `runAgentRound`.

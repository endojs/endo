# Genie: expose reflector ChatEvent stream and block `.reflect` until done

Follow-up task spun out of `TODO/50_genie_obs_obs.md` (see the "Design
Plan" there for background and the original analysis).
This task covers the **reflector** half only; the observer is handled
separately in `TODO/51_genie_observer_stream.md`.

Depends on `TODO/51_genie_observer_stream.md` only for the shared
`dev-repl.js` work (the optional `label` parameter on
`runAgentEvents`).  If 51 has landed, skip that sub-item here and just
re-use the parameter.

## Goals

1. Expose the `AsyncIterable<ChatEvent>` produced by the reflector's
   internal PiAgent so callers can render it.
2. Render sub-agent reflector events in `dev-repl.js` with a distinct
   label (e.g. `reflector>`).
3. Make the `.reflect` dot-command stream events as they happen,
   rather than waiting silently for `reflector.run()` to resolve.
   (`.reflect` already blocks the REPL; this task wires the event
   stream through to the user's terminal.)

The existing `run()` / `checkAndRun()` paths used by heartbeat /
automatic triggers must continue to work unchanged — they drain
events silently.

## Action items

- [x] `src/reflector/index.js`
  - [x] Change the internal `runReflection()` so that instead of
    draining the stream it returns an `AsyncIterable<ChatEvent>`
    whose iterator:
    1. `yield*`s the events from `runAgentRound(reflectorAgent, prompt)`,
    2. in a `finally` block flushes `searchBackend.sync()` if
       present.
    Note: `runAgentRound(...)` is invoked eagerly (outside the
    generator body) so that the stream is observably constructed
    exactly once per cycle even when no consumer drives the
    iterator immediately.
  - [x] Add a new public method on the returned `Reflector`:
    ```js
    /**
     * @returns {Promise<AsyncIterable<ChatEvent> | undefined>}
     *   undefined when a reflection is already running.
     */
    reflect()
    ```
    It must:
    - return `undefined` if `running` is already true,
    - otherwise set `running = true`, build the stream (awaiting the
      `makePiAgent` call inside), and return an async iterable that
      `yield*`s that stream and clears `running` / `inflight` in a
      `finally` block.
  - [x] Keep `run()` / `checkAndRun()` working for the heartbeat /
    auto-trigger paths.
    Reuse the new stream-returning internals by driving the stream
    via a detached drain, inside the existing `.catch()`/`.finally()`
    wrapper.
    The stream must only be constructed once per cycle.
    (`run()` now delegates to `reflect()` and drains the returned
    iterable silently; errors are logged and swallowed as before.)
  - [x] Update the `Reflector` typedef to document the new
    `reflect()` method.
  - [x] `harden(...)` any new exported helpers; retain existing
    `harden` calls.
- [x] `dev-repl.js`
  - [x] If not already done by `TODO/51_genie_observer_stream.md`:
    add an optional `label` parameter to `runAgentEvents(events,
    options)` (default `'genie'`) that replaces the `genie>` prefix.
    (Already present — the observer stream work landed the shared
    `label` parameter.)
  - [x] Rewrite the `.reflect` handler to use the new API:
    ```js
    } else if (prompt === '.reflect') {
      if (!reflector) { ... }
      else if (reflector.isRunning()) { ... }
      else {
        const events = await reflector.reflect();
        if (!events) {
          yield `${YELLOW}Reflection is already in progress.${RESET}\n`;
        } else {
          yield `${DIM}Running reflection cycle...${RESET}\n`;
          try {
            yield* runAgentEvents(events, { verbose, label: 'reflector' });
            yield `${GREEN}✓ Reflection cycle complete.${RESET}\n`;
          } catch (err) {
            yield `${RED}Reflection failed: ${/** @type {Error} */ (err).message}${RESET}\n`;
          }
        }
      }
    }
    ```
  - [x] Delete the stale TODO comment above `makeReflector({...})` in
    `runMain()` (the one that says "we need observability so that
    background work can be printed for debugging").
- [x] Tests
  - [x] Update / add `packages/genie/test/reflector.test.js` coverage
    for the new `reflect()` method:
    - returns `undefined` when already running;
    - yields events from the reflector sub-agent;
    - clears `running` when the stream is fully drained;
    - clears `running` even if the consumer aborts early.
  - [x] Confirm existing `run()` / `checkAndRun()` tests still pass —
    the silent-drain behaviour must be preserved.
    (All 24 reflector tests pass; full genie suite: 232 tests pass.)

## Follow-ups (surfaced during Phase 1 review of `TODO/53_genie_obs_bg_stream.md`)

These gaps were identified while reviewing the landed reflector
streaming work prior to designing background streaming.
None are blockers for task 53 Phase 2 but should be resolved for
completeness.

- [x] Add a test for the `reflect()`-rejects branch of `run()`
  (the error-logging path at index.js:333).
  Landed as `run — swallows and logs errors from a rejecting
  reflect()` in `test/reflector.test.js`.  Passes in isolation;
  under concurrent execution it can be clobbered by other tests
  that also swap `console.error` — a pre-existing global-mutation
  hazard tracked separately, not a defect of this test.
- [x] Add a test for `makeAgent` throwing inside `reflect()`; the
  error-cleanup at index.js:297–302 (clearing `running`/`inflight`
  and re-throwing) is currently untested.
  Landed as `reflect — rejects and clears running when makeAgent
  throws` in `test/reflector.test.js`.  Verifies the error surfaces
  synchronously from `reflect()`, `running` is cleared, `stop()`
  resolves promptly, and a subsequent `reflect()` can succeed.
- [x] Remove the redundant inner `undefined` branch in `.reflect`
  (dev-repl.js:465–466): `reflector.reflect()` can only return
  `undefined` when `running` is already true, and the outer
  `isRunning()` guard three lines earlier already handles that
  (the second check is defensive against a race that cannot occur
  in a single-threaded REPL).  Purely cosmetic.
  Collapsed in `dev-repl.js` — the inner `if (!events)` arm is
  gone; the cast `/** @type {AsyncIterable<ChatEvent>} */` and a
  comment document why the outer `isRunning()` guard already
  covers the sole undefined-producing case.

## Out of scope

- Observer changes — see `TODO/51_genie_observer_stream.md`.
- Surfacing automatic (non-command) reflector runs into the REPL
  output stream — see `TODO/53_genie_obs_bg_stream.md`.

## References

- `TODO/50_genie_obs_obs.md` — original analysis and design plan.
- `packages/genie/src/reflector/index.js` — current implementation
  (see `runReflection`, `run`, `checkAndRun`).
- `packages/genie/dev-repl.js` lines ~155–299 (`runAgentEvents`) and
  ~458–472 (current `.reflect` handler).
- `packages/genie/src/agent/index.js` — `ChatEvent`, `runAgentRound`.

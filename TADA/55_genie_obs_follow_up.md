
- [x] do the "Follow-ups" within `TADA/51_genie_observer_stream.md` surfaced during Phase 1 review of `TODO/53_genie_obs_bg_stream.md`
  - Abort-early `searchBackend.sync()` coverage — added
    `observe — searchBackend.sync() fires even when consumer aborts early`.
  - Empty-excerpt behaviour — resolved: `beginObservation` advances
    `hwm = messages.length` and returns `undefined` without entering a
    cycle.  Locked in by
    `observe — empty-excerpt short-circuit advances hwm without constructing an agent`.
  - `makeAgent` failure behaviour — resolved: awaited eagerly in
    `beginObservation` inside a `try/catch` that unwinds
    `running` / `inflight` before rethrowing.  Locked in by
    `observe — rejects and clears running when makeAgent throws`.
  - `stop()` awaits in-flight `observe()` — added
    `stop — awaits an in-flight observe() stream` using a gated
    `runAgent` to prove both `stop()` and the drain park until the
    cycle completes.
  - All four new tests pass under
    `cd packages/genie && npx ava test/observer.test.js --timeout=30s`.
    Pre-existing failures in other observer tests (attempt-loop /
    `memorySet` scripting) are outside this follow-up's scope.


# Phase 1: Tool-gate extraction

Extract `makeToolGate` from `packages/genie/src/reflector/index.js` into a
first-class module, fix its three known bugs, and rewrite the observer's
inline duplicate to use it.

See [`PLAN/genie_loop_overview.md`](../PLAN/genie_loop_overview.md) §
"Implementation Plan" phase 1 and
[`PLAN/genie_loop_architecture.md`](../PLAN/genie_loop_architecture.md) §
"Tool gate" for design context.

## Action

1. [x] move `makeToolGate` to `packages/genie/src/agent/tool-gate.js`
   - export from `@endo/genie` alongside other agent-level helpers
   - keep `// @ts-check`, `harden(makeToolGate)`, JSDoc types per
     `CLAUDE.md` conventions

2. [x] fix the three bugs documented in the architecture doc
   - `argVal === 'string' && argVal` → `typeof argVal === 'string'`
   - `args[argName] in did` → look up in the per-tool map, not the
     outer `did` map
   - `default: doing = ''` inside the event switch must not clobber
     in-flight doing-state on intervening events (e.g. `Message`
     during a tool call)

3. [x] generalise the argument matcher so both call sites share one
   shape
   - reflector: `memorySet` with `argKey: 'path'`,
     `expected: [OBSERVATION_PATH, REFLECTION_PATH]`
   - observer: `memorySet` with `argKey: 'path'`, single expected path

4. [x] expose the return API per architecture doc:
   - `done()`, `update(event)`, `pending()` (iterable of
     `[toolName, missingArg]`), `reset()` (clears in-flight doing
     state between retries)

5. [x] rewrite `runObservation`'s inline gate in
   `packages/genie/src/observer/index.js` to use the shared helper
   - removed the duplicated `did` / `doing` booleans near the observer
     event loop

6. [x] add unit tests under `packages/genie/test/`
   - regression cases for each of the three bug-fixes
     (`bug-1 regression`, `bug-2 regression`, `bug-3 regression` in
     `test/tool-gate.test.js`)
   - single-path and multi-path `memorySet` shapes both covered

7. [x] run `cd packages/genie && npx ava` and confirm green
   (262 tests passing)

8. [x] update status in `PLAN/genie_loop_overview.md` §
   "Implementation Plan": phase 1 now marked `[x]`

## Notes

- Tests that shadow the global `console.error` (reflector and
  observer `subscribe` isolation tests, reflector `run — swallows
  and logs errors`) are now `test.serial` to avoid racing
  restoration between concurrent tests.
- Drive-by: fixed a pre-existing bug in reflector `checkAndRun` where
  the observations.md path was a literal `'${OBSERVATION_PATH}'`
  string rather than a reference to the `OBSERVATION_PATH` constant.
  Found while getting the `checkAndRun — triggers run()` test green.
- Updated several reflector/observer tests whose scripted event
  streams did not satisfy the tool-gate: added
  `gateSatisfyingEvents()` helpers so the single-round success path
  actually advances through the retry loop.  Without this, every
  reflection/observation ran the full 3-attempt budget and duplicated
  events into the streams under test.

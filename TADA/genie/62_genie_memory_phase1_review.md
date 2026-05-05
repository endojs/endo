# Genie tiered memory: phase 1 implementation review

- [x] initial pass at phase 1 implementation tasks has been done
  - read the `packages/genie/` code systematically, review, and audit vs plan

- [x] is it possible to add more test coverage (unit or integration) before spending human review time?

Reference and update these documents as appropriate:
- `PLAN/genie_memory_overview.md`
- `PLAN/genie_memory_implementation.md`
- `PLAN/genie_memory_session_layer.md`

---

## Review findings (2026-04-07)

### Phase 1 checklist vs code audit

All Phase 1 tasks from the implementation plan are complete:

| Task                   | Status | Notes                                                             |
|------------------------|--------|-------------------------------------------------------------------|
| Observer module        | ✅      | `src/observer/index.js` — token threshold + idle trigger          |
| Reflector module       | ✅      | `src/reflector/index.js` — daily heartbeat + size trigger         |
| FTS5 sync after cycles | ✅      | Both call `searchBackend.sync()`                                  |
| Configurable models    | ✅      | `model` option on both factories                                  |
| Session memory files   | ✅      | `workspace_template/memory/{observations,reflections,profile}.md` |

Phase 0 prerequisites also complete:
- Search index init (seed from watchPaths, zombie culling)
- Token estimation (`estimateTokens`, chars÷4)
- `getMessageTokenCount` on PiAgent wrapper

### Bugs fixed in this review

1. **Token test failure** (`test/tokens.test.js`): "longer text scales
   linearly" — `ceil(500/4)=125 ≠ ceil(5/4)*100=200`.
   Fixed by using a 4-char-aligned input string.

2. **System prompt tool name mismatch** (`src/system/index.js`):
   Memory recall guidance checked for `memory_search`/`memory_get`
   but actual tool names are `memorySearch`/`memoryGet`.
   The recall section never activated when tools were present.
   Fixed.

3. **Missing typedef fields**: `searchBackend` was destructured from
   options in both observer and reflector but not declared in their
   `@typedef`.  Fixed.

4. **Missing `scheduleIdle` in Observer typedef**: The method was
   returned by `makeObserver` but not listed in the `Observer`
   typedef.  Fixed.

### New test coverage added

- `test/reflector.test.js` (15 tests): constants, `estimateFileTokens`,
  `makeReflector` shape/guards, concurrency guard, sub-threshold
  `checkAndRun`, missing-file handling, custom options.

Full suite: **216 tests pass, 0 failures.**

### Remaining observations (not bugs, design notes)

1. **System prompt override is fragile**: Both observer and reflector
   create a PiAgent then mutate `state.systemPrompt` directly.
   Consider adding a `systemPrompt` parameter to `makePiAgent` so
   the override happens at construction time.

2. **Heartbeat→reflector wiring incomplete**: The plan calls for a
   `reflect` task in `HEARTBEAT.md` but no code connects the
   heartbeat runner to `reflector.run()`.  This is fine for Phase 1
   (reflector can be triggered manually or via `checkAndRun`) but
   should be wired in Phase 2 or early Phase 3.

3. **`npx ava` broken in this workspace**: The `npx ava` shim hits an
   assertion error in ava's worker bootstrap (`refs.runnerChain` is
   null).  Direct invocation via
   `node node_modules/ava/entrypoints/cli.mjs` works.
   Not a genie issue — likely a yarn PnP / workspace hoisting issue.

4. **Heartbeat module quality**: `src/heartbeat/index.js` has several
   issues (typo `OpenFileHandle`, missing `@ts-check`, no `harden`
   calls, variable shadowing in `start`).
   These pre-date Phase 1 and are out of scope for this review,
   but should be cleaned up before the heartbeat is relied on.

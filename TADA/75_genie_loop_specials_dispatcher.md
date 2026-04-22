# Phase 4: Specials dispatcher

Introduce a prefix-parameterised specials registry so dev-repl's
`.`-commands and main.js's `/`-commands share one dispatch
implementation.
Migrate dev-repl first, then main.js.

See [`PLAN/genie_loop_overview.md`](../PLAN/genie_loop_overview.md) §
"Implementation Plan" phase 4 and
[`PLAN/genie_loop_architecture.md`](../PLAN/genie_loop_architecture.md) §
"Specials dispatcher" for design context.
Depends on phase 3 (`TODO/74_genie_loop_agent_pack.md`) because
built-in special handlers call into the agent pack.

## Action

1. [x] add `packages/genie/src/loop/specials.js` exporting
   `makeSpecialsDispatcher({ prefix, handlers, onUnknown? })`
   - returns `{ isSpecial(input), dispatch(input), listCommands() }`
   - each handler is `async function*(tail: string[])` yielding
     `Chunk` (type parameter — dev-repl yields ANSI strings; main.js
     yields `{ strings, blobs, packages }` tuples for `reply()`)
   - `// @ts-check`, `harden(makeSpecialsDispatcher)`, JSDoc types

2. [x] add `makeBuiltinSpecials({ agents, io })` returning the shared
   set: `{ heartbeat, observe, reflect, help, tools, clear, exit }`
   - lives in `packages/genie/src/loop/builtin-specials.js`
   - handlers are rendering-agnostic; deployment-specific rendering
     + side-effects (ANSI vs. plain, stdout vs. `reply()`, mute /
     unmute / clearHistory / requestExit) are injected via the
     `SpecialsIO<Chunk>` surface
   - exported alongside `makeSpecialsDispatcher` from `@endo/genie`

3. [x] migrate `dev-repl.js`
   - prefix `.`; merges built-ins with dev-repl's `background` (on/
     off/status) special and a `quit` alias for `exit`
   - replaces the existing `if/else` ladder + `specials[head]` map
   - `io` wraps the built-ins with ANSI colours and delegates event
     rendering to `runAgentEvents`
   - `runAgent` polls `shouldExit()` after each dispatch so the
     built-in `.exit` handler can unwind the REPL loop

4. [x] migrate `main.js`
   - prefix `/`; mounts `observe`, `reflect`, `help`, `tools` from
     the built-ins
   - `/heartbeat` is intentionally **not** routed through the
     dispatcher because it is a system self-send carrying tick
     correlation state; its handling stays inline in `runAgentLoop`
     ahead of the dispatcher check
   - `renderEvents` silently drains sub-agent event streams pending
     the daemon background adapter (phase 6)
   - each dispatcher-yielded chunk becomes its own `E(agentPowers)
     .reply(number, [chunk], [], [])`, preserving the pre-migration
     "one reply per progress line" shape

5. [x] keep today's prefix characters (`/` in daemon mail, `.` in
   REPL) — see architecture doc § "Prefix choice"
   - the dispatcher is parameterised on `prefix` so switching later
     is a one-line change if integration tests reveal `/` misbehaves

6. [x] unit tests covering
   - `isSpecial` classification at both prefixes
     (`test/loop/specials.test.js`)
   - `dispatch` routing with and without a tail, bare-prefix
     no-op, and whitespace collapsing
   - unknown-command fallback to `onUnknown` (and silent no-op when
     `onUnknown` is omitted)
   - built-in handlers operate against a mock agent pack
     (`test/loop/builtin-specials.test.js`): missing / running
     sub-agents, no-unobserved-messages, event streaming with
     mute/unmute bracketing, clearHistory / requestExit delegation
     and no-op fallbacks

7. [x] ran `cd packages/genie && npx ava` (320 tests pass) and
   `cd packages/daemon && npx ava test/endo.test.js --timeout=120s`
   (141 tests pass)

8. [x] updated status in `PLAN/genie_loop_overview.md` §
   "Implementation Plan": phase 4 now `[x]`

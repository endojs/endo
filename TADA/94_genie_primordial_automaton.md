# Phase 2 sub-task: primordial automaton

Status: **Done.**  The automaton, the `runPrimordial` dispatch
branch, the daemon wiring, and the unit + integration tests are in
place; `npx ava packages/genie/test/loop/run.test.js
packages/genie/test/primordial/ packages/genie/test/boot/self-boot.test.js
--timeout=180s` passes (one unrelated pre-existing failure in
`test/loop/builtin-specials.test.js` for the `/clear` copy is out
of scope).  Hand-off (`activate`) stays stubbed for sub-task 97.

Implements § 3b of [`TODO/92_genie_primordial.md`](./92_genie_primordial.md).
Depends on sub-task 93 (boot-mode plumbing).

## Goal

Land the message-classification path that turns primordial-mode
prompts into a non-LLM dispatch.  Plain-text prompts get a friendly
"I'm not configured yet" reply pointing at `/help` and
`/model list`; specials still flow through the dispatcher (so
`/help` and `/tools` work, and `/model` will work once sub-task 95
lands).

## Files

- `packages/genie/src/loop/io.js:37` — extend `InboundPromptKind`
  to include `'primordial'`.
- `packages/genie/src/loop/run.js:88-94` (`classifyPrompt`) and
  lines 174-185 (the dispatch switch) — add a `kind === 'primordial'`
  branch that calls `handlers.runPrimordial(prompt)` analogously to
  the heartbeat branch.  No-op when `runPrimordial` is unset (so
  piAgent-mode runs unchanged).
- `packages/genie/src/primordial/index.js` — *new* module.  Exports
  `makePrimordialAutomaton({ workspaceDir, state })` returning
  `{ processPrompt }`.  `processPrompt(text, replyFn)` yields reply
  chunks and is invoked from the `runPrimordial` handler in
  `main.js`.  For *this* sub-task the handler only knows how to
  reply with the "not configured yet" message; sub-task 95 wires
  `/model` into the same automaton (the dispatcher mounts `/model`
  as a normal special, so the automaton itself only handles
  plain-text prompts in this sub-task).
- `packages/genie/main.js`:
  - In `daemonPrompts` (lines 687-725), classify all
    non-heartbeat-non-special prompts as `kind: 'primordial'` when
    `state.mode === 'primordial'`.
  - In the `runAgentLoop` handlers map (around lines 753-854), wire
    `runPrimordial` to call into `makePrimordialAutomaton().processPrompt`.

## Implementation notes

- `state` is the mutable mode-flag object shared between the IO
  adapter and the dispatch handlers (parent task § 3e).  It carries
  `{ mode: 'primordial' | 'piAgent', activate: () => Promise<void> }`
  for now; sub-task 97 fleshes out `activate`.
- The "I'm not configured yet" reply must include a one-line
  pointer to `/help` and `/model list` so even an operator who has
  never read the docs can move forward.  Avoid jargon — the
  audience is "first contact with a fresh bottle".
- Specials remain routed through `makeSpecialsDispatcher`; the
  `kind: 'special'` classification at
  `packages/genie/main.js:714-716` already wins over the new
  primordial classification because the IO adapter checks
  `dispatcher.isSpecial` before falling through to the primordial
  branch.

## Tests

- New unit test `packages/genie/test/primordial/automaton.test.js`:
  - `processPrompt('hello there')` yields one chunk that mentions
    `/help` and `/model`.
  - Empty prompts yield a no-op friendly reply.
- Extend `packages/genie/test/loop/run.test.js`:
  - `runGenieLoop` with `runPrimordial` set and a prompt of `kind:
    'primordial'` invokes the handler.
  - Without `runPrimordial`, primordial-kind prompts are silently
    dropped (matching the heartbeat fallback behaviour).
- Extend `packages/genie/test/boot/self-boot.test.js`:
  - Boot primordial; send "hello"; assert reply contains `/model`.

## Acceptance

- [x] The primordial worker now answers user messages instead of
  staring back silently.  Verified by the new
  `primordial genie replies with a pointer at /help and /model`
  self-boot test: a probe guest sends "hello" and observes a reply
  package in its own inbox whose joined strings match `/\/model/`
  (and `/\/help/`).
- [x] `npx ava packages/genie/test/loop/run.test.js
  packages/genie/test/primordial/
  packages/genie/test/boot/self-boot.test.js --timeout=180s`
  passes.  (The full `test/loop/` directory still has one
  pre-existing failure in `builtin-specials.test.js` for the
  `/clear` copy — unrelated to this sub-task; see the clear-handler
  message mismatch.)
- [x] The piAgent path is byte-equivalent (no behaviour change for
  `mode === 'piAgent'`).  `runRootAgent`'s piAgent branch now
  threads a `{ mode: 'piAgent', activate: async () => {} }` state
  handle through `runAgentLoop` so `daemonPrompts`'s
  `state.mode === 'primordial'` check is safe; the piAgent boot
  test (`genie boots as the daemon root agent via setup.js shape`)
  exercises the "user message reaches `processMessage`" path and
  passes.

## Non-goals

- `/model` itself (sub-task 95).
- Persistence (sub-task 96).
- Hand-off (sub-task 97).

# Phase 2 sub-task: boot-mode selection

**Status: done** (2026-04-23).
See "Outcome" below for the landed shape.

Implements § 3a of [`TODO/92_genie_primordial.md`](./92_genie_primordial.md).
First sub-task in the chain; lands the boot-mode plumbing without
yet adding the primordial automaton or `/model` builtin (those are
93's downstream peers).

## Goal

Relax `make()`'s synchronous "throw on missing `GENIE_MODEL`" so the
genie can boot in primordial mode when no model is configured —
either via env or via persisted config — and plumb a
`mode: 'piAgent' | 'primordial'` flag through `runRootAgent` so the
heartbeat ticker, observer, and reflector wiring can be gated off
the same flag in sub-tasks 94 and 97.

This sub-task does *not* land the primordial dispatch path itself;
the worker simply logs "primordial mode — no model configured" and
sits idle when no model is found.  Sub-task 94 wires the dispatch.

## Files

- `packages/genie/main.js` — primary edit site.
  - Env-validation block (lines 1213-1229): split into a three-way
    resolution (env → persisted → primordial).  `GENIE_WORKSPACE`
    stays mandatory.
  - `runRootAgent` (lines 1108-1211): accept `mode` in `AgentConfig`;
    skip `makeGenieAgents`, `runAgentLoop`'s piAgent reliance, and
    `runHeartbeatTicker` when `mode === 'primordial'`.  Replace with
    a placeholder log line and a stub agent loop that consumes
    prompts and replies "(primordial mode — no model configured;
    `/model` arrives in sub-task 95)".
  - `AgentConfig` typedef (lines 134-148): add `mode:
    'piAgent' | 'primordial'`.
  - The stale "not setup-genie" comment at line 554: rewrite to
    reflect the post-refactor identity (`@self`).
- `packages/genie/CLAUDE.md` § "Env-var config": amend
  `GENIE_MODEL` description to "required unless a persisted model
  config exists or the operator plans to use `/model` (sub-task
  95)".

## Implementation notes

- The persisted-config loader does not exist yet (sub-task 96 lands
  it).  For *this* sub-task, stub the persistence read with a
  no-op `loadConfig` returning `undefined`; sub-task 96 fills it in.
  Document the stub with a `// TODO(96)` comment.
- The env-precedence rule (env > persisted > primordial) is in §
  1c of the parent task.  Encode it explicitly as a small switch
  block at the top of `make()` so the precedence is one diff to
  audit.
- `mode` is plumbed as part of `AgentConfig` rather than as a
  separate argument so future modes (e.g. degraded-no-tools) can
  extend the same surface.

## Tests

- Extend `packages/genie/test/boot/self-boot.test.js` with:
  - A "boots primordial when GENIE_MODEL absent" case: launch the
    worker without `GENIE_MODEL`, assert the worker log contains
    `primordial mode` and does *not* contain `agent ready`.
  - A regression case for the existing path: launch with
    `GENIE_MODEL=ollama/self-boot-stub`, assert `agent ready` log
    line present (existing behaviour).
- `node --check packages/genie/main.js` to catch SES-unaware syntax
  issues before launching the daemon.

## Acceptance

- `node --check packages/genie/main.js` succeeds.
- `npx ava packages/genie/test/boot/self-boot.test.js
  --timeout=120s` passes.
- The worker log shows the correct mode banner on boot for both
  branches.
- `bottle.sh invoke` with no `GENIE_MODEL` no longer throws — but
  also no longer reaches `agent ready` (it sits in primordial
  stub-loop).  Sub-task 94 will give the operator a useful response.

## Non-goals

- The primordial automaton (sub-task 94).
- The `/model` builtin (sub-task 95).
- Persistence (sub-task 96 — `loadConfig` stays a stub here).
- Hand-off to piAgent (sub-task 97).

## Outcome

Landed in `packages/genie/main.js` and
`packages/genie/test/boot/self-boot.test.js`:

- `AgentConfig` typedef gained a required
  `mode: 'piAgent' | 'primordial'` property; `model` is now optional
  because primordial mode has no LLM to configure.
- `make()` now synchronously validates `GENIE_WORKSPACE` only, then
  fires an async IIFE that resolves the boot mode via a small
  `resolveBootMode` switch (`env > persisted > primordial`) before
  invoking `runRootAgent`.  `loadConfig` is a stub that returns
  `undefined` with a `TODO(96)` marker for the real loader.
- `runRootAgent` branches on `config.mode === 'primordial'` and
  delegates to the new `runPrimordialStubLoop` helper, which follows
  the inbox and replies to every non-self message with the fixed
  placeholder `(primordial mode — no model configured; \`/model\`
  arrives in sub-task 95)`.  `makeGenieAgents`, `runAgentLoop`, and
  `runHeartbeatTicker` are skipped — the primordial path emits
  `primordial mode` rather than `agent ready`.
- The stale "not setup-genie" comment on `runAgentLoop` was rewritten
  to describe the post-refactor `@self` identity, including how
  `spawnAgent` still reuses the same loop for future child agents.
- `packages/genie/CLAUDE.md` § "Env-var config" now documents
  `GENIE_MODEL` as "required unless a persisted model config exists
  or the operator plans to use `/model`" and calls out the
  primordial-mode placeholder reply shape.
- `test/boot/self-boot.test.js` gained
  `'genie boots primordial when GENIE_MODEL absent'`, which asserts
  the `primordial mode` banner shows up while the piAgent
  `agent ready` banner does not.

### Verification

- `node --check packages/genie/main.js` — passes.
- `node --check packages/genie/test/boot/self-boot.test.js` — passes.
- `cd packages/genie && npx ava test/boot/self-boot.test.js
  --timeout=120s` — 3 tests passed (existing piAgent boot, daemon
  restart survival, new primordial boot).

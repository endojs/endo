# Phase 2 sub-task: primordial → piAgent transition

Implements § 3e + § 3f of
[`TODO/92_genie_primordial.md`](./92_genie_primordial.md).
Depends on sub-tasks 93 (mode flag), 94 (primordial dispatch),
95 (`/model commit`), and 96 (persistence).  Last functional
sub-task before the test pass (98).

## Goal

Land the hand-off that takes a `/model commit` in primordial mode
to a live piAgent loop without requiring a worker restart.  The
same helper is used by the cold-boot path in `make()` so
primordial-then-commit and restart-from-persisted-config converge
on one piAgent-construction call site.

Also land the `/model commit` behaviour for piAgent mode (persist
+ log + worker exit so the daemon reincarnates with the new
config).

## Files

- `packages/genie/main.js`:
  - Extract a new `activatePiAgent({ rootPowers, workspaceDir,
    config, state, cancelledP, cancel, pendingHeartbeatTicks,
    makeTickId })` helper from the body of `runRootAgent` (lines
    1143-1210).  Shared between the cold-boot path
    (`mode === 'piAgent'` at `make()` time) and the hot hand-off
    (primordial `/model commit`).
  - In `runRootAgent`, branch on `mode`: `'piAgent'` calls
    `activatePiAgent` synchronously; `'primordial'` sits idle
    (dispatch flowing through `handlers.runPrimordial` from
    sub-task 94).
  - Add a one-shot `activate` callback to `state` that
    sub-task 95's `/model commit` handler invokes.  The callback
    calls `activatePiAgent` and flips `state.mode` atomically on
    success.
  - Observer / reflector / heartbeat ticker stay gated on
    `mode === 'piAgent'` — only `activatePiAgent` constructs them.
  - `/model commit` in piAgent mode: persist, reply
    "Configuration saved.  Restart required — daemon will
    reincarnate on next message.", then call `process.exit(0)` (or
    a cleaner Endo-idiomatic exit hook if one exists — check
    `packages/daemon/src/worker-node.js` for the worker-shutdown
    pattern).

## Implementation notes

- **Race guard.** `state.activate` must be idempotent.  Use
  `makePromiseKit` to build a one-shot promise; the first call
  runs the activation, subsequent calls await the same promise.
- **Order of operations.** persist → construct agent pack → flip
  `state.mode` → start heartbeat → reply-ready.  If any step
  throws, roll back by deleting the persisted config (so the next
  restart does not load a broken config).  Log the rollback
  prominently.
- **Readiness reply.** The operator sees `/model commit` reply with
  a multi-line message:
  ```
  Configuration saved to <workspace>/.genie/config.json.
  Activating piAgent…
  Ready: model=<provider>/<modelId>, workspace=<path>.
  ```
- **Backwards-compat log line.** Preserve the existing
  `[genie:<name>] agent ready (model: …)` log line
  (`packages/genie/main.js:1208-1210`) so `self-boot.test.js`'s
  log-scraper continues to work.  Sub-task 94's primordial banner
  uses a *different* phrase to avoid false positives.

## Tests

- Extend `packages/genie/test/boot/self-boot.test.js`:
  - Primordial-then-`/model commit` happy path: boot primordial;
    send `/model set ollama self-boot-stub` + `/model commit`;
    assert worker log contains `Transitioned to piAgent mode` and
    a subsequent user message is processed by the piAgent branch
    (look for `Processing message #…`).
  - Restart-replays-config path: after the commit succeeds, restart
    the daemon; assert `agent ready` without re-sending `/model`.
- Extend `packages/genie/test/primordial/model-handler.test.js`
  (from sub-task 95) to cover the `activate` callback:
  - `/model commit` in primordial mode calls `state.activate`.
  - `/model commit` in piAgent mode does *not* call
    `state.activate`; instead it signals exit.

## Acceptance

- `npx ava packages/genie/test/boot/ packages/genie/test/primordial/
  packages/genie/test/loop/ --timeout=120s` passes.
- A primordial bottle can be configured end-to-end from an
  operator invite edge: `/model list`, `/model set`, `/model
  test`, `/model commit`, then ordinary chat.
- A restart of the daemon after commit reaches piAgent mode
  automatically.

## Non-goals

- Live model swap in piAgent mode (deferred indefinitely; swap is
  "persist + exit + restart" per parent task § 2 Clarification 6).
- Capability-based credential storage (tracked in § 3g).

# Git code-mode eval

A harness for testing **git code mode**: drive a code-mode agent against a git
repository and score whether the repository reached a target end-state.

## Eval vs. optimize

These are two different concerns, and this module is the first one only.

- **Eval** (this module) measures a fixed agent: run a scenario, then make a
  pass/fail judgment by **outcome assertion**. Pass means the repository reached
  the target end-state (a commit exists, the tree and index match, the file
  contents are right). It answers "did it work?" for one model and one prompt.
- **Optimize** (out of scope here, deferred) searches for a better prompt:
  GEPA / `ax`-style prompt-tuning loops that mutate the system prompt and select
  on a score. It answers "what prompt works best?".

Optimization consumes an eval as its objective, but the eval stands alone and
ships first. This module does no prompt-tuning; it only runs an agent and
asserts the outcome.

## Why outcome assertion, not trace scoring

A code-mode agent's only tool is `execute`: it runs `E(git).x()` and
`E(workspace).x()` **inside** a Compartment, so the outer pi-agent tool-call
trace sees a single opaque `execute` call, not the individual git operations.
There is therefore no git-op trace to score with edit distance, and there
should not need to be: a correct run might stage in a different order, read
status an extra time, or use a different method to the same end. Outcome
assertion reads the repository's actual final state through the live `git`
capability and checks it against the target, so it needs no in-compartment
instrumentation and accepts any alternate-but-correct path.

Capturing the run's events is still useful for debugging _why_ a scenario
failed, but it is a diagnostic, never the gate.

## Metrics

Every `runGitScenario` result includes `metrics` alongside `outcome`.
The metrics record summed provider token usage, including reasoning tokens when reported, total provider cost, completed turns, assistant messages, tool executions, tool execution errors, and wall time for the agent run.
They come from the same pi-agent-core event stream that powers diagnostics, so they report the real provider usage carried by assistant messages instead of estimating from transcript text.

Callers that need durable diagnostics can pass `onEvent` to receive the same
agent events. The live test uses this seam to write sanitized event summaries
and one result record per scenario to the directory named by
`ENDO_EVAL_ARTIFACT_DIR`; it does not copy prompts, generated code, or
capability-bearing result details.

Metrics are recorded for comparison and reporting only.
The scenario's outcome assertion remains the only pass/fail gate.

## Layout

The harness splits along the seam between a **shared harness** (the runner, the
env model, the shared types, the export surface, the README, and the generic
outcome primitives) and **per-eval content** (one scenario's prompt, its outcome
assertion, and the repository it runs against). The shared harness is
scenario-agnostic and changes rarely; per-eval content grows with each new eval,
so each eval gets its own folder.

Shared harness (this directory's root):

- `index.js` — the `@endo/agentry/eval` export surface: re-exports only the
  shared harness.
- `run.js` — `runGitScenario({ model, workspace, git, scenario, readText, ... })`:
  builds the real code-mode git-loop agent, runs the scenario prompt, and scores
  by outcome assertion while returning diagnostic run metrics. An optional
  `onEvent` listener receives the agent event stream. Only the `model` differs
  between a no-LLM run and a live run.
- `metrics.js` — `makeRunMetricsRecorder()`: subscribes to plain
  pi-agent-core events and snapshots per-run usage, turn, tool execution, and
  wall-time metrics.
- `env-model.js` — `resolveEvalModelFromEnv(env)`: build a live model +
  `getApiKey` from the `ENDO_LLM_*` / `LAL_*` environment variables, or
  `undefined` when no credentials are present.
- `types.js` — shared contracts such as `GitScenario`, `ReadText`, outcome
  reports, and runner options.
- `outcome-kit.js` — the shared outcome primitives: `check()`, the `OutcomeReport`
  shape, and the small shared readers (`readTrackedFileAt` reads a tracked file
  at a ref through `filesystemAt`; `branchLog` resolves a branch's commit list).
  Per-eval scorers build on these so each stays short. Cap-based and portable;
  the byte reader is injected.

Per-eval content is internal to this package (one folder under `scenarios/`):

- `scenarios/conflict-rebase/` — the conflict-rebase eval: `scenario.js`
  asks the agent to rebase a feature branch onto `integration`, resolve the
  `app.txt` conflict with the requested combined wording, and preserve both
  notes; `outcome.js` verifies the branch topology, replayed summaries and
  fresh oids, caller-supplied post-resolution patches, exact final tree and file
  content, clean status, and completed rebase state.
  `types.ts` keeps the conflict-rebase target shape beside its scenario and
  scorer.
  Its folder-local barrel connects the implementation to the package's tests
  and live-eval registry; these scenario-specific symbols are not part of the
  `@endo/agentry/eval` public API.
- `scenarios/stage-and-commit/` — the minimal-success eval: `scenario.js`
  (`makeStageAndCommitScenario(...)`, stage an untracked file and commit it with
  a given message), `outcome.js` (`assertGitCommitOutcome(...)`, the scorer that
  reads HEAD's commit message, the file tracked at HEAD and its content, and the
  working-tree status), `types.ts` (the local target shape), and `index.js` (the
  folder-local barrel).

A scenario's no-LLM assertion-path test and its per-eval repository fixture live
together under `test/eval/` (see "Running" below), mirroring this source layout.

## Running

- **No credentials (anywhere):** `test/eval/*.test.js` runs the full harness
  with a scripted faux provider standing in for the model.
  These are the assertion-path tests; they need no network and no secrets, and
  each eval's test co-locates with its per-eval repository fixture under
  `test/eval/`.
  They run under the default `yarn test`.
- **Live model (credentialed host):** `test/eval-live.test.js` runs the same
  scenarios and scorers against a real provider, table-driven over a registry
  with one row per eval. It is **not** part of the default `yarn test`: it runs
  only via its own `test:live` command, under a dedicated ava config
  (`ava-live.config.js`), so that a host that happens to have the credentials in
  its environment does not reach a real provider as a side effect of a plain
  `yarn test` at the package or workspace root. The live test additionally skips
  every row unless the credentials are present. To run it, set `ENDO_LLM_HOST` /
  `ENDO_LLM_MODEL` / `ENDO_LLM_AUTH_TOKEN` (or their `LAL_*` aliases) in the
  environment to point at an OpenAI-compatible endpoint, then:

  ```sh
  yarn workspace @endo/agentry test:live
  ```

  Supply the token through the environment only; it never appears in code,
  config, or a committed file.

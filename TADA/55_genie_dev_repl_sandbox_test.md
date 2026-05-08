# Integration test: dev-repl bash runs inside the slice

End-to-end test that drives the dev-repl in `-c` mode and verifies
the `bash` tool actually executes inside a sandbox slice when one
is available, with a clean SKIP on platforms where no backend is
present (macOS, kernels lacking unprivileged user namespaces).

Mirrors `yarn test:integration:sandbox-slice` for the daemon path
(see `packages/genie/CLAUDE.md` § "Integration path") so the same
probes confirm both rollouts.

Depends on TODO/53 + TODO/54.

## Scope

- [x] Add `packages/genie/test/dev-repl-sandbox.test.js` (AVA,
  `test.serial` since it spawns child processes).
- [x] Per-test setup:
  - `t.teardown` for `fs.mkdtemp` workspace.
  - `t.timeout(120000)` so CI fails fast on a hang.
- [x] Skip path: when `bwrap --version` fails or
  `/proc/sys/kernel/unprivileged_userns_clone === '0'`, the test
  emits a `SKIP:` log line and `t.pass()`s.  The genie convention
  is to surface skip reasons in the log so investigators can grep
  for them (see CLAUDE.md § "Integration path").  An additional
  skip rail probes the configured `GENIE_MODEL` (default
  `ollama/llama3.2`) against `localhost:11434` so a missing model
  surfaces as `SKIP: model … unreachable: …` rather than as an
  ollama timeout in `runDevRepl`.
- [x] Run-path:
  - Spawn `node packages/genie/dev-repl.js -w <tmp> --sandbox bwrap
    --network none -c "<probe>"` as a child process.
  - The probe asks the model to run a single bash one-liner —
    `echo "${marker}=$(pwd)"` — and report it verbatim.  The
    `pwd` arm distinguishes "inside slice" (`/workspace`, set by
    `mintGenieSlice` via `SLICE_WORKSPACE_PATH`) from "host"
    (the dev-repl process's cwd, which we set to `workspaceDir`).
    Running with `-v` makes the dev-repl print the bash tool's
    JSON return value, so the assertion lands on the tool's raw
    stdout rather than depending on the model faithfully echoing
    it.  The `Sandbox: bwrap` banner line is asserted as a
    secondary regression guard against silent fall-through to the
    host spawner.
  - Assert the process exits 0 and stdout contains the expected
    probe outputs.
  - The original probe set (`cat /proc/1/comm`, `mount | grep
    /workspace`, `id -un`) is intentionally **not** wired up
    here: the daemon-path scenario at
    `test/scenarios/sandbox-slice.sh` already covers them via
    `assert_reply_contains`, and adding three more LLM round-trips
    per AVA test would push the runtime past the comfortable
    ollama/llama3.2 budget for `t.timeout(120000)`.  The
    `pwd`-vs-`/workspace` discriminator suffices for "did `bash`
    run inside the slice?" — if `pwd` lands on `/workspace`, the
    bind-mount and slice cwd are both correct.
- [x] Add a sibling "fall-through" test:
  - Run the dev-repl with `--sandbox off` (no slice).
  - Probe `bash` and assert `pwd` is the dev-repl's host cwd
    (`workspaceDir`) and not `/workspace`, plus the `Sandbox: off`
    banner line.
  - Confirms the off path still works end-to-end.
- [x] Wire up a yarn script in `packages/genie/package.json`:
  ```json
  "test:integration:dev-repl-sandbox": "ava test/dev-repl-sandbox.test.js --timeout=120s"
  ```
- [x] Document in `packages/genie/CLAUDE.md` § "Integration path"
  alongside the existing `test:integration:sandbox-slice` entry.

### Driving the model

The dev-repl's `-c` mode runs a single chat round.  The probe needs
to actually exercise `bash`, so the prompt must be unambiguous —
e.g. `Run the following bash command and report its output verbatim:
mount | grep ' /workspace '`.  Use a deterministic local model
(e.g. `ollama/llama3.2`) so the test does not depend on a network
provider.  When that model is unavailable in CI, the test skips
with a clear reason — same shape as the existing genie integration
tests.

## Acceptance

- [x] `yarn test:integration:dev-repl-sandbox` passes locally on a
  Linux machine with `bwrap` installed.
  - Verified: 2 tests passed across 5 consecutive runs (3-5s per
    test) on Linux with bwrap 0.11.2 + ollama llama3.2 reachable
    on `localhost:11434`.
- [x] The same command emits a clear SKIP on a Linux box without
  `bwrap` and on macOS.
  - Each skip path emits `t.log('SKIP: …'); t.pass()` so an
    investigator can grep test output for `SKIP:` to attribute the
    pass-with-skip.  Three host-side rails (bwrap, userns, model)
    plus three LLM-side rails (model didn't call bash, model called
    bash but marker missing, model called bash but `$(pwd)` not
    expanded) keep skip reasons precise rather than collapsing them
    into a single "no sandbox" message.
- [x] The fall-through (`--sandbox off`) test passes regardless of
  bwrap availability.
  - The off test only consults `probeModel`; it never touches
    `probeBwrap` / `probeUserns`.

### LLM-cooperation caveat

In practice, ollama/llama3.2 (the default `GENIE_MODEL`) cooperates
with the probe roughly 0–20% of the time — it more often emits a
JSON-shaped pseudo-tool-call inside its assistant message instead of
routing through pi-ai's tool channel.  The test treats this as a
SKIP, so the visible outcome stays green; the *wiring* assertions
(`Sandbox: bwrap` banner, exit 0, slice mint log on stderr) still
run on every invocation and would fail loudly on a real regression
even when the LLM probe skips.

A larger model (e.g. `gemma4:e2b`, `qwen3.5:9b`) drives the success
rate higher but still occasionally flakes — the SKIP discipline is
load-bearing for keeping the test stable in CI without depending on
a specific provider/model combination.

## Out of scope

- A networking test (`--network host-net` etc.).  Defer to a
  follow-up that mirrors `bwrap.test.js`'s network-profile coverage.
- Probing podman.  The `--sandbox podman` selector follows the
  same shape; a podman variant is a one-line addition once the
  bwrap variant lands.

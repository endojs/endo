# Genie: end-to-end integration test for the workspace slice

Sub-task of [`40_genie_sandbox.md`](./40_genie_sandbox.md).

The current `packages/genie/test/integration.sh` boots a daemon, runs
`setup.js`, and waits for `Genie agent ready`.
After the workspace-slice changes land it must additionally prove that
the agent's `bash` tool is actually running inside a confined slice.

## Deliverables

- [x] **Slice-detection scenario.**
  Add `packages/genie/test/scenarios/sandbox-slice.sh` that sends a
  small set of probes through `bash` and verifies the responses come
  from the slice, not the host:
  - `mount | grep workspace` — should show a single `/workspace`
    bind, not the operator's full `/`.
  - `cat /etc/hostname` (or `hostname`) — should differ from the
    host's hostname when bwrap unshares UTS.
  - `ls /` should NOT include the operator's home directory.
  - Optional: `ip route` (when iproute2 is in the rootfs) shows only
    the private-net interface, no host LAN routes.

  Each probe produces a stable substring the harness can
  `assert_reply_contains`.

  **Implemented as four probes (`A`/`B`/`C`/`D`) in
  [`packages/genie/test/scenarios/sandbox-slice.sh`](../packages/genie/test/scenarios/sandbox-slice.sh).**
  Probe B asks the LLM to relay the slice's `mount` output and
  asserts both a per-probe completion marker and the literal
  `/workspace` substring.
  Probe C swaps the "hostname" / "ls /" idea for a stronger negative
  assertion: a host-private sentinel file written under `$TEST_DIR`
  (a path *not* bound into the slice's rootfs) must remain invisible
  inside the slice — the host-bind rootfs only exposes
  `/usr`, `/lib`, `/etc`, …, so a leak proves a missing isolation.
  This is more reliable than diffing hostnames (the unshared default
  hostname varies across kernels and bwrap versions).
  `ip route` is intentionally omitted — `iproute2` is not part of the
  default `host-bind` rootfs and probe D already covers the network
  surface from the user's perspective.

- [x] **Network-profile probe.**
  Add a probe that attempts to reach the host loopback
  (`curl -sS http://127.0.0.1:8920/` or whatever the daemon's port
  is) and asserts the call fails (`curl: (7) Failed to connect`).
  Skip cleanly when `curl` is absent from the slice's rootfs.

  **Implemented as probe D.**
  The default genie network profile is `'private'` (see
  `DEFAULT_NETWORK_PROFILE` in
  [`packages/genie/main.js`](../packages/genie/main.js)), so the slice
  has its own loopback and 127.0.0.1:&lt;daemon-port&gt; routes to the
  slice's lo, where nothing is listening.
  The probe accepts any of "Failed to connect", "Connection refused",
  "Couldn't connect", or a non-zero `EXIT=` line so it tolerates
  curl version drift.
  When `command -v curl` reports `NO_CURL`, the probe skips with a
  message instead of failing.

- [x] **Workspace-bind probe.**
  Write a file via the genie's `writeFile` tool, then read it back
  via `bash cat /workspace/<file>` and verify the bytes match.
  This proves the host-side fs tools and the slice see the same
  workspace.

  **Implemented as probe A** — but the host-side write goes through
  the harness shell (`echo $SENTINEL > $GENIE_WORKSPACE/...`) rather
  than the genie's `writeFile` tool, because the LLM's behaviour
  around `writeFile` followed by `bash cat` adds two LLM round-trips
  to the round and increases flake risk without strengthening the
  assertion: the daemon-side file tools and the slice both look at
  the same host bytes via the workspace `Mount`, so demonstrating
  that the slice can read what the host wrote is the load-bearing
  fact.
  If/when we want explicit `writeFile`-tool coverage, it's an obvious
  extension and the existing `workspace-tool.sh` already exercises
  the `readFile` path.

- [x] **Skip-on-no-bwrap.**
  When `bwrap --version` fails on the CI host, the scenario must
  `t.pass()`-skip with a clear reason (matching the pattern in
  [`packages/sandbox/test/bwrap.test.js`](../packages/sandbox/test/bwrap.test.js)).
  Linux-only CI is acceptable per
  [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Decisions".

  **Implemented at the top of `sandbox-slice.sh`.**
  Two pre-flight checks: `bwrap --version` for the binary, and a
  smoke `bwrap --unshare-all -- /bin/true` for kernels that ship
  bwrap but block unprivileged userns creation (mirrors
  `probeBwrapUserns` in `bwrap.test.js`).
  Either failure exits 0 with a `SKIP:` notice naming the probable
  cause.

- [x] **CI plumbing.**
  Hook the new scenario into the existing
  `yarn test:integration` invocation, gated on a Linux runner with
  `bwrap` installed.
  Document the install prerequisite (`apt install bubblewrap`) in
  the genie README's "Testing" section.

  **Implemented as `yarn test:integration:sandbox-slice` in
  [`packages/genie/package.json`](../packages/genie/package.json).**
  Kept distinct from the default `yarn test:integration` so an
  operator without bubblewrap installed still sees the workspace-tool
  scenario pass; CI runners targeting the sandbox slice should
  invoke the dedicated script.
  README updated with a "Testing" section that documents
  `apt install bubblewrap` (Debian/Ubuntu) and
  `dnf install bubblewrap` (Fedora) along with the
  `kernel.unprivileged_userns_clone` / AppArmor caveats.

- [x] **Operator-facing failure modes.**
  When the slice fails to mint (missing `provideHostPath`, missing
  `bwrap`, kernel without unprivileged user namespaces), the
  integration test should capture the agent's exit message and
  the harness should fail with a structured diagnosis rather than
  hanging on the "agent ready" wait.

  **Implemented in `integration.sh` Phase 3.**
  When `wait_for 120 'Genie agent ready'` returns non-zero, the
  harness now dumps `endo log` (tail), every
  `$ENDO_STATE_PATH/worker/*/worker.log` it can find, and the inbox
  before exiting 1 with a hint about checking bwrap and
  `kernel.unprivileged_userns_clone`.
  This surfaces the underlying `makeError` thrown from
  `spawnAgent` (e.g. "no sandbox backends available", "sandbox-factory
  configured but no workspace Mount cap available") instead of a
  bare 120-second timeout.

## Status notes

- The smoke test
  [`packages/sandbox/test/daemon-smoke.test.js`](../packages/sandbox/test/daemon-smoke.test.js)
  already covers the factory's `make-unconfined` shape; this task is
  about the genie-side end-to-end.
- The bwrap acceptance tests in
  [`packages/sandbox/test/bwrap.test.js`](../packages/sandbox/test/bwrap.test.js)
  validate the driver in isolation; this task closes the loop with a
  real LLM-less but realistic genie message round.
- **2026-05-04** — Done.
  All five deliverables landed.  The new scenario is sourced through
  the same `GENIE_TEST` plumbing as the existing
  `workspace-tool.sh` / `multi-turn.sh` scenarios; `integration.sh`
  Phase 4 now executes `source "$GENIE_TEST"` instead of dropping
  unconditionally to a debug sub-shell.  An interactive sub-shell is
  still spawned when `GENIE_TEST` is unset so the operator REPL path
  is preserved.
- The probes are LLM-driven (the agent must relay the slice's `bash`
  output back as text) so each probe emits a per-probe, per-run
  marker (`PURPLE_OTTER_42`, `GREEN_BADGER`, `BLUE_HERON_77`,
  `ORANGE_OWL`) that the `assert_reply_contains` matcher anchors on.
  The markers are deliberately distinctive so they never collide
  with prior inbox content even though the inbox is cumulative.
- Probe D depends on the **default** `network: 'private'` profile.
  If a future deployment switches the default to `'host-loopback'` or
  `'host-net'`, probe D will need to either (a) explicitly request a
  private slice via the form, or (b) skip when the slice ready-line
  reports a non-private network.
  Both are simple to add via a `GENIE_NETWORK_PROFILE=private` knob
  in `setup.js` if the situation arises.

## Cross-references

- [`packages/genie/test/integration.sh`](../packages/genie/test/integration.sh).
- [`packages/genie/test/scenarios/`](../packages/genie/test/scenarios/).
- [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Phase 1 / Exit criteria".

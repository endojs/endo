# Genie: end-to-end integration test for the workspace slice

Sub-task of [`40_genie_sandbox.md`](./40_genie_sandbox.md).

The current `packages/genie/test/integration.sh` boots a daemon, runs
`setup.js`, and waits for `Genie agent ready`.
After the workspace-slice changes land it must additionally prove that
the agent's `bash` tool is actually running inside a confined slice.

## Deliverables

- [ ] **Slice-detection scenario.**
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

- [ ] **Network-profile probe.**
  Add a probe that attempts to reach the host loopback
  (`curl -sS http://127.0.0.1:8920/` or whatever the daemon's port
  is) and asserts the call fails (`curl: (7) Failed to connect`).
  Skip cleanly when `curl` is absent from the slice's rootfs.

- [ ] **Workspace-bind probe.**
  Write a file via the genie's `writeFile` tool, then read it back
  via `bash cat /workspace/<file>` and verify the bytes match.
  This proves the host-side fs tools and the slice see the same
  workspace.

- [ ] **Skip-on-no-bwrap.**
  When `bwrap --version` fails on the CI host, the scenario must
  `t.pass()`-skip with a clear reason (matching the pattern in
  [`packages/sandbox/test/bwrap.test.js`](../packages/sandbox/test/bwrap.test.js)).
  Linux-only CI is acceptable per
  [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Decisions".

- [ ] **CI plumbing.**
  Hook the new scenario into the existing
  `yarn test:integration` invocation, gated on a Linux runner with
  `bwrap` installed.
  Document the install prerequisite (`apt install bubblewrap`) in
  the genie README's "Testing" section.

- [ ] **Operator-facing failure modes.**
  When the slice fails to mint (missing `provideHostPath`, missing
  `bwrap`, kernel without unprivileged user namespaces), the
  integration test should capture the agent's exit message and
  the harness should fail with a structured diagnosis rather than
  hanging on the "agent ready" wait.

## Status notes

- The smoke test
  [`packages/sandbox/test/daemon-smoke.test.js`](../packages/sandbox/test/daemon-smoke.test.js)
  already covers the factory's `make-unconfined` shape; this task is
  about the genie-side end-to-end.
- The bwrap acceptance tests in
  [`packages/sandbox/test/bwrap.test.js`](../packages/sandbox/test/bwrap.test.js)
  validate the driver in isolation; this task closes the loop with a
  real LLM-less but realistic genie message round.

## Cross-references

- [`packages/genie/test/integration.sh`](../packages/genie/test/integration.sh).
- [`packages/genie/test/scenarios/`](../packages/genie/test/scenarios/).
- [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Phase 1 / Exit criteria".

# Genie sandbox — acceptance tests

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Tests_.

Pick a home consistent with the existing genie / daemon test layout
(likely `packages/genie/test/` for tool-level checks and
`packages/daemon/test/` for daemon-restart / gateway-level checks).

- [ ] **Smoke test**: `bottle.sh invoke` against a host with bwrap +
  pasta installed boots a genie whose `bash` tool can `cat
  HEARTBEAT.md` from the workspace and **cannot** `cat /etc/hosts`
  on the host.
  - host-bind rootfs allows `/etc/hosts` reading by default; the
    test should pick a sentinel host file deliberately omitted from
    the slice's view (e.g. `~/.aws/credentials`) and assert it is
    not present.
- [ ] **`network: 'private'` smoke**: `bash -lc 'curl -s
  http://127.0.0.1:<host-daemon-port>/'` fails (loopback blocked);
  a public `curl` succeeds when the CI host has internet.
- [ ] **Daemon restart**: kill the daemon, restart it, assert the
  `main-genie` worker comes back and `bash` still spawns through the
  slice (no orphaned scratch / mount).
  - exercises
    [`39_endo_genie_sandbox_gc_order.md`](./39_endo_genie_sandbox_gc_order.md).
- [ ] **Tool stdio**: `bash -lc 'echo hi'` returns `hi\n` on stdout
  via the existing tool plumbing — the slice's `reader-ref` /
  `writer-ref` adapters do not corrupt the byte stream.

Depends on:
[`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md),
[`36_endo_genie_sandbox_workspace_path.md`](./36_endo_genie_sandbox_workspace_path.md),
[`39_endo_genie_sandbox_gc_order.md`](./39_endo_genie_sandbox_gc_order.md).

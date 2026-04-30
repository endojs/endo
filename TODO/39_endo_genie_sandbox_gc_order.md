# Genie sandbox — GC ordering on daemon restart

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _GC ordering on daemon restart_.

When the daemon restarts, `main-genie` and `main-genie-sandbox` must
reincarnate in the right order: slice first, worker after, so the
worker's tool registry sees a live slice on first call.

- [ ] Document the formula dependency:
  - slice handle pins the workspace mount,
  - worker formula (`main-genie`) pins the slice handle.
- [ ] Confirm by inspection that the daemon's existing dependency-edge
  GC plumbing already orders `Mount → SandboxHandle → worker` without
  new code — the `Mount` → `make-unconfined` edge already works the
  same way.
- [ ] Add a smoke test to
  [`40_endo_genie_sandbox_tests.md`](./40_endo_genie_sandbox_tests.md)
  that kills the daemon and asserts post-restart that `bash` still
  spawns through a live slice (no orphaned scratch / mount).

Depends on:
[`33_endo_genie_sandbox_persist_slice.md`](./33_endo_genie_sandbox_persist_slice.md),
[`34_endo_genie_sandbox_main_wiring.md`](./34_endo_genie_sandbox_main_wiring.md).

# Genie: route child agents through `slice.fork()` (deferred)

Sub-task of [`40_genie_sandbox.md`](./40_genie_sandbox.md).

When `slice.fork()` lands in
[Phase 3 of the sandbox plan](../PLAN/endo_posix_sandbox.md#phase-3--nested-slices),
the genie should use it to give each child agent (`agent.spawn`-style
delegations) its own sub-slice nested inside the parent's, rather than
minting a fresh top-level slice per child.

This task is intentionally tracked as a follow-up — it cannot land
until the sandbox plugin's Phase 3 is in place, and it is not required
for the v1 "isolate the genie's own workspace" goal.

## Deliverables (after sandbox Phase 3)

- [ ] Replace the per-child `E(sandboxes).make({...})` call in
  `spawnAgent` with `E(parentSlice).fork({ ... })`.
  The forked slice's mounts must be a strict subset of the parent's
  granted mounts, per
  [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Nested slices".

- [ ] Define how the parent grants a sub-workspace to its child:
  - Recommendation: the parent's tool surface gains a
    `delegate_workspace` tool that mounts a subdirectory of its own
    `/workspace` into the child slice's `/workspace`.
  - The parent never hands the child its full mount cap.

- [ ] Decide the fallback when the kernel rejects nested userns
  (`/proc/sys/user/max_user_namespaces` exhausted, `uid_map` too
  small).
  Two choices:
  1. Refuse to spawn the child agent with a structured error —
     consistent with the "no implicit relaxation" rule.
  2. Fall back to a sibling top-level slice — operationally easier
     but blurs the confinement story.

  Pick (1) by default; gate (2) behind an explicit
  `allowNestedFallback` config flag.

- [ ] Update `removeChildAgent` to unwind the fork in the same order
  as the host-level guest removal so a half-disposed child cannot
  leave a dangling slice behind.

- [ ] Integration test: parent agent spawns a child agent, child sees
  only the parent-granted sub-workspace, child cannot see the parent's
  other mounts or the host filesystem.

## Status notes

- Blocked on
  [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  Phase 3.
  Until then the workspace-slice integration mints a fresh top-level
  slice per agent (parent and child alike); the security boundary is
  the same, but the relationship between parent and child slices is
  not made explicit.

## Cross-references

- [`packages/genie/main.js`](../packages/genie/main.js) §
  `spawnAgent` / `removeChildAgent` / `listChildAgents`.
- [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Phase 3 — nested slices".
- [`packages/sandbox/src/factory.js`](../packages/sandbox/src/factory.js)
  § `fork()` (currently a `notImplemented` stub).

# Genie: accept an introduced Mount pet name as the `rootfs` form value

Sub-task carved out of [`50_genie_rootfs_config.md`](./50_genie_rootfs_config.md)
§ "Plan / Seam 2".

## Context

[`51_genie_rootfs_form_field.md`](./51_genie_rootfs_form_field.md)
introduces a `rootfs` form field that accepts the keyword shapes
(`host-bind`, `minimal`, `oci:<ref>`).
`RootfsSpec` (in [`packages/sandbox/src/types.d.ts`](../packages/sandbox/src/types.d.ts)
~line 143) also admits a fourth shape: a caller-granted `MountCap`
rooted at a userland tree, which the slice driver bind-mounts as `/`.

The pet-name path mirrors the workspace-mount story already in
flight:
[`TADA/22_genie_workspace_mount_form_value.md`](../TADA/22_genie_workspace_mount_form_value.md)
extended `config.workspace` to accept either a host path (legacy) or
a pet name introduced into the agent guest's namespace, with the
latter validated against the `MountInterface` method surface
(`readText`, `writeText`, `makeDirectory`, `has`, `list`).
The same disambiguation pattern applies to `rootfs`, with the twist
that rootfs has **no** legacy host-path branch — values are either a
recognised kind keyword or a pet name.

`setup.js` does not currently mint a rootfs Mount; this task only
opens the seam, and operators wanting this path mint and introduce
their own (`endo make-mount /path/to/rootfs rootfs-mount` or similar)
before submitting the form.

## Deliverables

- [x] Extend `parseRootfsValue` (introduced by Seam 1) so values
  that fail the keyword / `oci:` parsing fall through to a
  pet-name branch instead of throwing immediately.
  Return a placeholder marker (or pass the raw string back) that
  the caller resolves against `agentGuest`; mirror the workspace
  branching shape so the form-side helper stays synchronous.
  Landed at `packages/genie/main.js:236` — the trailing branch
  now returns `harden({ kind: 'pet-name', petName: value })`.
  The new `ParsedRootfsValue` typedef
  (`packages/genie/main.js:165-178`) admits the marker as a
  fourth arm so `spawnAgent` can disambiguate without a runtime
  check on string shape.
- [x] In `spawnAgent`, when `parseRootfsValue` reports a pet name,
  resolve it via `E(agentGuest).lookup(petName)` and validate the
  result against the `MountInterface` method surface by checking
  `__getMethodNames__()` for `readText`, `writeText`,
  `makeDirectory`, `has`, and `list` (the same subset
  [`TADA/22_genie_workspace_mount_form_value.md`](../TADA/22_genie_workspace_mount_form_value.md)
  uses).
  On failure, throw a structured error naming the agent, the pet
  name, and the available method names — same shape as the
  workspace-mount validation.
  Landed at `packages/genie/main.js:1361-1386`; the missing-method
  list and the available-method list both quote through `q(...)`
  so the operator sees a friendly diff.
- [x] Use the resolved cap as the `rootfs` argument to
  `E(sandboxFactory).make({ rootfs, … })`.
  No `provideHostPath` bridge is needed on this path (unlike the
  workspace mount, the rootfs cap is consumed only by the slice
  factory, not by daemon-side fs tools).
  Landed at `packages/genie/main.js:1444-1454`; the resolved
  `rootfs` (either a `RootfsSpec` keyword shape or the looked-up
  `MountCap`) is forwarded as-is.
- [x] When the rootfs pet-name path is taken, ensure the
  cross-validation rule from Seam 1 still runs: a `Mount`-cap
  rootfs is compatible with both `bwrap` and `podman`, so no
  additional backend constraint applies — but the existing
  `oci:` + `bwrap` rejection must keep working unchanged.
  `assertRootfsBackendCompatible` at
  `packages/genie/main.js:258-269` runs on the *parsed marker*
  (before the pet-name -> Mount-cap resolution), so the
  `oci` + `bwrap` rejection still fires unchanged and the
  pet-name marker passes through as a no-op.  Coverage in
  `packages/genie/test/rootfs-form.test.js:188-201`.
- [x] Extend the README's form-field row for `rootfs`
  (added by Seam 3) with the pet-name shape, including a worked
  example: mint a Mount on the host, introduce it under a stable
  pet name, then submit the same name as the form's `rootfs`
  field value.
  This text can land here or in Seam 3 — coordinate so the row is
  authored once, not twice.
  Landed in `packages/genie/README.md` § "Rootfs form-field
  shapes" (rows 156-191): the table grew a fourth `<pet-name>`
  row, the prose calls out that `rootfs` has no legacy host-path
  branch, and a worked `endo make-mount` / `endo introduce` /
  `endo submit` example shows the operator flow.  The "agent
  ready" announcement renders pet-name rootfs as
  `pet-name:<petName>` (logging hooked at
  `packages/genie/main.js:1599-1606`).

## Blocked by / blocks

- Blocked by [`51_genie_rootfs_form_field.md`](./51_genie_rootfs_form_field.md)
  — extends `parseRootfsValue` and the form field that task lands.
- Independent of [`53_genie_rootfs_docs.md`](./53_genie_rootfs_docs.md)
  but coordinates with it on the form-field documentation row.

## Cross-references

- `packages/genie/main.js` `spawnAgent` workspace pet-name branch
  — the implementation pattern this task mirrors (search for
  `__getMethodNames__` and `MountInterface` validation).
- [`TADA/22_genie_workspace_mount_form_value.md`](../TADA/22_genie_workspace_mount_form_value.md)
  — the workspace counterpart of this seam, including the
  structured-error wording and validation method-name list.
- `packages/daemon/src/interfaces.js` — `MountInterface` shape used
  for cap-validation when a pet name is supplied.
- `packages/sandbox/src/types.d.ts` ~line 143 — `RootfsSpec`'s
  `MountCap` arm.

# Genie: specify sandbox rootfs

The provisioning form in `runLoop` needs to expose a `rootfs` to pass along to
`spawnAgent`; the form description should clarify how it's value is backend
dependant.

- [x] analyze and plan changes for this
- [x] create follow-up `TODO/` tasks to implement the **Plan** below
  - [`51_genie_rootfs_form_field.md`](./51_genie_rootfs_form_field.md)
    — Seam 1: form field + kind-keyword validation + bwrap/oci
    cross-check.
  - [`52_genie_rootfs_mount_cap.md`](./52_genie_rootfs_mount_cap.md)
    — Seam 2: pet-name `Mount`-cap rootfs, mirroring TADA/22.
  - [`53_genie_rootfs_docs.md`](./53_genie_rootfs_docs.md) — Seam 3:
    README / CLAUDE.md updates + optional `GENIE_ROOTFS` env var.

## Analysis

`packages/genie/main.js` `spawnAgent` currently hard-codes the slice's
rootfs to `{ kind: 'host-bind' }` with an inline TODO marker:

```js
// main.js ~lines 1201-1203
/** @type {RootfsSpec} */
const rootfs = { kind: 'host-bind' };
// TODO wire this up to a form slot
```

`@endo/sandbox`'s `RootfsSpec`
([`packages/sandbox/src/types.d.ts`](../packages/sandbox/src/types.d.ts)
~line 143) is one of:

- `MountCap` — caller-granted Mount rooted at a userland tree (any backend).
- `{ kind: 'host-bind' }` — bind-mount the host's `/usr` / `/etc` / etc.
  read-only, the Flatpak pattern; supported by bwrap and podman.
- `{ kind: 'minimal' }` — backend-supplied empty / busybox rootfs;
  caller is expected to bind their own bin dirs in via `mounts`.
- `{ kind: 'oci', ref }` — materialise from an OCI image reference;
  **podman driver only** (the bwrap driver throws a structured error,
  see [`packages/sandbox/src/drivers/bwrap.js`](../packages/sandbox/src/drivers/bwrap.js)
  ~lines 318-326 and 544-552).

Backend dependence:

| Rootfs shape           | bwrap | podman | lima / containerization / wsl |
| ---------------------- | ----- | ------ | ----------------------------- |
| `host-bind`            | yes   | yes    | driver-dependent              |
| `minimal`              | yes   | yes    | driver-dependent              |
| `Mount` cap (pet name) | yes   | yes    | driver-dependent              |
| `oci:<ref>`            | **no** (rejects with structured error) | yes | driver-dependent — none registered yet |

The `auto` backend selector picks the first available driver in
registration order (bwrap before podman in
[`packages/sandbox/src/agent.js`](../packages/sandbox/src/agent.js)),
so callers wanting `oci:` rootfs must opt into `backend: 'podman'`
explicitly — exactly the asymmetry the form description must surface.

`@endo/sandbox/README.md` § "Driver auto-registration" and § "Capability
surface" already document the bwrap-rejects-oci rule; the genie's form
needs to mirror that constraint at the user-facing boundary instead of
deferring to a confusing slice-mint failure deep in
`E(sandboxFactory).make(...)`.

The form-side validation pattern for `network` / `backend`
(`ALLOWED_NETWORK_PROFILES` + `isAllowedNetworkProfile`,
`ALLOWED_BACKENDS` + `isAllowedBackend`) is the model the rootfs check
should follow.  An `oci:<ref>` value also wants a cross-check against
`backend` so a `bwrap` + `oci:` combination is rejected before the
slice mint.

The pet-name path mirrors the workspace form-field shape settled in
[`TADA/22_genie_workspace_mount_form_value.md`](../TADA/22_genie_workspace_mount_form_value.md):
disambiguate the form value at submit time, validate the looked-up cap
against the `MountInterface` method surface, and surface a structured
error rather than a duck-typing failure in `E(sandboxFactory).make()`.

## Plan

The work splits cleanly along three seams.  Follow-up tasks have been
filed for each.

### Seam 1 — form field + kind specs (`51_genie_rootfs_form_field.md`)

- Extend the configuration form with a `rootfs` field accepting:
  - `host-bind` (default) → `{ kind: 'host-bind' }`
  - `minimal` → `{ kind: 'minimal' }`
  - `oci:<ref>` → `{ kind: 'oci', ref }` (podman driver only)
- Add `ALLOWED_ROOTFS_KINDS` + `isAllowedRootfsKind` + `parseRootfsValue`
  next to the existing `ALLOWED_NETWORK_PROFILES` /
  `ALLOWED_BACKENDS` form-side validators.
- Cross-validate: when `parseRootfsValue` returns `{ kind: 'oci' }`,
  reject `backend === 'bwrap'` with a structured error naming the
  agent.  Mirrors the bwrap driver's own refusal but produces a
  friendlier message before `E(sandboxFactory).make(...)` runs.
- Add `rootfs?: string` to the `AgentConfig` typedef in
  `spawnAgent` and replace the hard-coded
  `const rootfs = { kind: 'host-bind' };` with the parsed value.
- Extend the "agent ready" announcement string to include the rootfs
  kind so operators can grep for which mode is in effect (mirrors the
  existing `backend: …, network: …` info).

### Seam 2 — `Mount`-cap pet-name rootfs (`52_genie_rootfs_mount_cap.md`)

- Extend `parseRootfsValue` so values that are not one of the
  recognised kind keywords / `oci:` prefix are treated as pet names.
- Resolve the pet name via `E(agentGuest).lookup(petName)`, validate
  the result against the `MountInterface` method surface
  (`readText`, `writeText`, `makeDirectory`, `has`, `list`), and
  return the resulting `MountCap` for `E(sandboxFactory).make({
  rootfs, … })`.
- Mirrors the workspace-mount pet-name story
  ([`TADA/22_genie_workspace_mount_form_value.md`](../TADA/22_genie_workspace_mount_form_value.md))
  including the structured-error message naming the agent and listing
  the available method names on miss.
- `setup.js` does not currently mint a rootfs Mount; document that
  operators wanting this path mint it themselves
  (`endo make-mount /path/to/rootfs rootfs-mount` or similar) and
  introduce it under a stable pet name before submitting the form.

### Seam 3 — operator docs and `setup.js` env var (`53_genie_rootfs_docs.md`)

- Extend the `README.md` § "Sandboxed workspace" form-field table
  (currently has rows for `backend` and `network`) with a row for
  `rootfs` describing the four shapes and the bwrap/oci asymmetry.
- Add a row to the failure-mode cookbook for the
  bwrap-rejects-oci case so operators see the fix
  ("set `backend: 'podman'` in the form, or use a non-oci rootfs").
- Update `packages/genie/CLAUDE.md` § "`GENIE_WORKSPACE` is a host
  path; the slice's cwd is `/workspace`" or its sibling section so
  the implementer's lens reflects the new form field.
- Optional: introduce a `GENIE_ROOTFS` env var in `setup.js` that
  auto-submits the value, paralleling `GENIE_MODEL` /
  `GENIE_WORKSPACE`.
  Defer a decision on this until Seam 1 lands; the form is already
  human-submittable and the env-var sugar is purely operator
  ergonomics.

## Cross-references

- `packages/genie/main.js` ~lines 1201-1203 — the TODO comment this
  task chain replaces.
- `packages/genie/main.js` ~lines 101-140 — pattern reference for
  form-side allow-list validators.
- `packages/genie/main.js` ~lines 1184-1199 — pattern reference for
  the `network` / `backend` form-side validation block in
  `spawnAgent`.
- `packages/sandbox/src/types.d.ts` ~line 143 — `RootfsSpec` shape.
- `packages/sandbox/src/interfaces.js` ~line 42 — `RootfsSpecShape`
  guard the factory enforces post-form-validation.
- `packages/sandbox/src/drivers/bwrap.js` ~lines 318-326 and 544-552
  — the bwrap driver's structured rejection of `oci:` rootfs.
- `TADA/22_genie_workspace_mount_form_value.md` — pet-name pattern
  Seam 2 mirrors.

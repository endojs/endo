# Genie: accept an already-introduced mount pet name as the workspace form value

Sub-task surfaced by [`21_genie_sandbox_review_notes.md`](./21_genie_sandbox_review_notes.md).

## Context

`packages/genie/main.js` `spawnAgent` currently treats `config.workspace` as a
host filesystem path string and immediately mints a fresh per-agent mount:

```js
// main.js ~lines 1078-1088
let workspaceMount = defaultWorkspaceMount;
if (config.workspace) {
  const workspacePetName = `${config.name}-workspace`;
  workspaceMount = await E(hostAgent).provideMount(config.workspace, workspacePetName);
}
```

This conflicts with the capability discipline that the rest of the genie /
sandbox integration has been moving toward
(see [`packages/genie/CLAUDE.md`](../packages/genie/CLAUDE.md) §
"Tools that need host fs access stay daemon-side").
`setup.js` already mints a `workspace-mount` cap and introduces it under the pet
name `workspace`; the form's `workspace:` field should be able to refer to that
cap by name instead of re-minting from a path.

## Deliverables

- [x] Extend the configuration form's `workspace` field to accept either a host
  path string (legacy) **or** a pet name already introduced into the genie
  guest's namespace.
  Disambiguate at submit time:
  values starting with `/` (or matching the platform's absolute-path shape)
  flow down the `provideMount` path;
  bare pet names resolve via `E(agentGuest).lookup(petName)` and are validated
  against `MountInterface` (or by checking `__getMethodNames__()` for the
  Mount surface).
  Implementation: `packages/genie/main.js` `spawnAgent` now branches on
  `path.isAbsolute(config.workspace)`; the pet-name branch validates the
  cap by checking that `__getMethodNames__()` exposes
  `readText`, `writeText`, `makeDirectory`, `has`, and `list` (the
  `MountInterface` subset `initWorkspace` and the daemon-side fs tools
  rely on), and otherwise throws a structured `makeError` naming the
  agent and listing the available method names.
  The form-field label and example string were also updated to advertise
  both shapes.
- [x] When a pet name is supplied, skip the per-agent `provideMount` call and
  use the looked-up cap as `workspaceMount`.
  This collapses the two-mount-per-agent footprint
  (`workspace-mount` + `${config.name}-workspace`) back to a single
  daemon-minted mount that all agents share.
  Implementation: the pet-name branch sets
  `workspaceMount = await E(agentGuest).lookup(config.workspace)` and
  bridges back to a host path for the still-host-path-shaped
  `initWorkspace` / `buildTools` / FTS5 callers via
  `E(hostAgent).provideHostPath(workspaceMount)` — the workaround the
  pre-existing TODO comment flagged, kept as a stop-gap until TODO/23
  and TODO/25 lift the host-path constraint.
- [x] Update `setup.js` to default the form's `workspace` value to `workspace`
  (the pet name) when `GENIE_WORKSPACE` was set at boot, instead of repeating
  the host path.
  Implementation: `packages/genie/setup.js` now submits
  `workspace: workspace ? 'workspace' : process.cwd()` so the genie
  guest reuses the cap setup.js already minted under the `workspace`
  pet name; falls back to the host cwd only on the legacy "no
  GENIE_WORKSPACE" path where no Mount cap exists.
- [x] Update `packages/genie/README.md` § "Sandboxed workspace" so operators
  understand which form-field shapes are supported.
  Implementation: added a new sub-section "Workspace form-field shapes"
  with a two-row table (absolute host path vs. introduced pet name)
  documenting the legacy / recommended split, the disambiguation rule,
  and the structured-error behaviour.
- [x] Update `packages/genie/CLAUDE.md` § "Capabilities the genie guest
  receives" so the row for `workspace` reflects that downstream agents may
  inherit the same cap rather than minting their own.
  Implementation: extended the `workspace` row to mention pet-name
  inheritance, and added a follow-on paragraph explaining the
  legacy-vs-pet-name split, the `MountInterface` validation, and the
  setup.js auto-submit default.

## Blocked by / blocks

- Blocks [`23_genie_init_workspace_endo_fs.md`](./23_genie_init_workspace_endo_fs.md):
  passing a Mount cap straight through to `initWorkspace` only buys us
  something once `initWorkspace` itself can run over the cap; otherwise we
  still need `provideHostPath` to bridge back to a real path.
- Independent of [`24_genie_sandbox_spawner_simplify.md`](./24_genie_sandbox_spawner_simplify.md)
  and [`25_genie_tools_vfs_endo_mount.md`](./25_genie_tools_vfs_endo_mount.md).

## Cross-references

- `packages/genie/main.js` ~lines 1078-1088 — the TODO comments this task
  resolves.
- `packages/genie/setup.js` — `provideMount` call site and form-submit
  defaulting.
- `packages/daemon/src/interfaces.js` — `MountInterface` shape used for
  cap-validation when a pet name is supplied.

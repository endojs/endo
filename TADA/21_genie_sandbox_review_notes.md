# Genie + sandbox review notes (umbrella)

Walk-through of the post-integration TODO comments left in
`packages/genie/main.js` after [`TADA/40_genie_sandbox.md`](../TADA/40_genie_sandbox.md)
landed.
Each comment cluster is analysed below and routed to a follow-up TODO
file.

## Source review

- [x] read `packages/genie/main.js`
  - [x] the `// TODO` comments around lines 1078-1088 about
    `workspaceMount` handling
  - [x] the `// TODO` around line 1230 about process spawner adaptation
  - [x] the `// TODO` around line 1243 about `genieTools` being adapted
    to use the endo filesystem

## Analysis

### `workspaceMount` handling — `main.js` ~lines 1078-1088

Three TODO comments share the same root cause: `config.workspace` is a
host path string, and `spawnAgent` mints a fresh per-agent
`provideMount` from it on every spawn:

```js
let workspaceMount = defaultWorkspaceMount;
if (config.workspace) {
  const workspacePetName = `${config.name}-workspace`;
  workspaceMount = await E(hostAgent).provideMount(
    config.workspace, workspacePetName,
  );
}
```

Two distinct improvements are possible:

1. **Form value as cap.**
   Operators already mint `workspace-mount` once in `setup.js`;
   the form's `workspace:` field should be able to refer to that pet
   name directly, instead of repeating the host path and re-minting.
   Routed to [`22_genie_workspace_mount_form_value.md`](./22_genie_workspace_mount_form_value.md).
2. **Cap-flowing `initWorkspace`.**
   Even when the form value is a pet name, the existing
   `initWorkspace(workspaceDir)` call below (`main.js` ~line 1097)
   forces us back to a host path because the implementation uses Node
   `fs` directly.
   The third TODO comment names the dirty workaround
   (`provideHostPath(mountCap)`) but flags it as suboptimal.
   Routed to [`23_genie_init_workspace_endo_fs.md`](./23_genie_init_workspace_endo_fs.md).

### Process spawner adaptation — `main.js` ~lines 1227-1241

The inline wrap that creates `{ pid, stdout, stderr, wait, kill }`
local methods around `slice.spawn`'s return value is **redundant**.
`makeSandboxSpawner` already calls `await E(handle).spawn(...)` and
`await E(procHandle).pid()` / `.stdout()` / `.stderr()` internally
(`packages/genie/src/tools/sandbox-spawner.js` ~lines 140-153).
The real `SandboxHandle` from `@endo/sandbox` is FarRef-shaped and
satisfies the structural `SandboxHandleLike` typedef directly modulo
Promise unwrapping, which `await` makes invisible.

The wrap can be replaced with `makeSandboxSpawner({ handle: slice })`,
plus a one-line typedef cast if the JSDoc checker complains.
Routed to [`24_genie_sandbox_spawner_simplify.md`](./24_genie_sandbox_spawner_simplify.md).

### `genieTools` adapted to the endo filesystem — `main.js` ~line 1243

`buildTools(workspaceDir, spawner)` hands a host path to the file
tools, which default to `makeNodeVFS()`.
The `VFS` interface in `packages/genie/src/tools/vfs.js` is structurally
close to `MountInterface` from the daemon, but there are real gaps:

- `VFS.readdir` is supposed to be an async iterable but `Mount.list`
  is a Promise of an array (already TODO-flagged in `vfs.js` line 114).
- `MountInterface` lacks a `stat` operation; `VFS.stat` exposes
  size + mtime + type.
- `EndoMountFile.streamBase64` is whole-file only; `VFS.createReadStream`
  accepts byte ranges.
- Path utilities (`sep`, `join`, `relative`, `resolve`) operate on
  strings; Mount accepts string or path-segment arrays.

Routed to [`25_genie_tools_vfs_endo_mount.md`](./25_genie_tools_vfs_endo_mount.md).

## Clarifying question — daemon-side tools and ambient fs authority

The current convention captured in
`packages/genie/CLAUDE.md` § "Tools that need host fs access stay
daemon-side" justifies its design with two points:

> the slice's bind-mount lands on the same bytes the daemon-side tools
> see, so the two views stay in lockstep without needing a CapTP
> round-trip per file read.

Routing `readFile` / `writeFile` / `editFile` / `memory_*` through
`E(mount).readText` etc. trades that latency win for cap-correctness:
the genie's daemon-side tools would no longer hold ambient host-fs
authority and would only reach the workspace via the explicit Mount
cap minted by `setup.js`.

**Question for design review:**
is the cap-correctness win worth the per-call CapTP round-trip and the
new `MountInterface.stat` / byte-range surface that the file tools
need?
The answer determines the scope of
[`23_genie_init_workspace_endo_fs.md`](./23_genie_init_workspace_endo_fs.md)
and [`25_genie_tools_vfs_endo_mount.md`](./25_genie_tools_vfs_endo_mount.md):

- "yes" → both tasks proceed as written; expand `MountInterface` so
  the file tools can drop their fs imports entirely.
- "keep ambient authority, the slice already enforces confinement" →
  collapse the two tasks to a smaller fix that uses
  `E(hostAgent).provideHostPath(mountCap)` to derive the root, keeps
  `makeNodeVFS`, and only flows the cap for path validation.

The question is recorded here rather than answered to avoid
prejudging the architecture; an owner of the genie + sandbox security
boundary should weigh in before either task lands.

## Plan

- [x] analyze all the above, and plan `TODO/` tasks to make progress
  on all of it
  - [x] [`22_genie_workspace_mount_form_value.md`](./22_genie_workspace_mount_form_value.md)
    — accept a pet name in the workspace form field.
  - [x] [`23_genie_init_workspace_endo_fs.md`](./23_genie_init_workspace_endo_fs.md)
    — port `initWorkspace` to the Mount cap surface.
  - [x] [`24_genie_sandbox_spawner_simplify.md`](./24_genie_sandbox_spawner_simplify.md)
    — drop the redundant wrap around `makeSandboxSpawner`.
  - [x] [`25_genie_tools_vfs_endo_mount.md`](./25_genie_tools_vfs_endo_mount.md)
    — VFS adapter over Mount; gated by the design question above.
  - [x] surfaced the daemon-side ambient-authority design question
    (above) so the bigger refactors can be answered before they land.

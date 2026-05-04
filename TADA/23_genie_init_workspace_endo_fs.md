# Genie: run `initWorkspace` over an Endo filesystem cap

Sub-task surfaced by [`21_genie_sandbox_review_notes.md`](./21_genie_sandbox_review_notes.md).

## Context

`packages/genie/src/workspace/init.js` reads the bundled
`packages/genie/workspace_template/` tree from the host filesystem with
Node's `fs.promises` and copies any missing files into `workspaceDir`,
also a host filesystem path:

```js
// src/workspace/init.js ~line 85
export const initWorkspace = async workspaceDir => { ... }
```

`spawnAgent` calls it with `config.workspace || process.cwd()`
(`main.js` ~line 1097), which forces the workspace argument to remain a
real host path even when `setup.js` already minted a `Mount` cap for the
workspace.
This is the third TODO around `main.js` ~line 1084:
> we'd need initWorkspace below to be able to work over an endo
> filesystem, rather than an unconfined real host path

The "hack around with `provideHostPath(mountCap)`" workaround the comment
mentions does work today (the daemon ships `provideHostPath` per
[`TADA/41_genie_sandbox_provide_host_path.md`](../TADA/41_genie_sandbox_provide_host_path.md))
but it leaks the cap intent back into a string and skips the discipline
of routing daemon-side tools through the Mount surface.

## Two sides to bridge

`initWorkspace` has both a **source** (the seed template) and a
**destination** (the agent workspace).
A clean port needs a cap surface for each:

- **Destination** — already minted by `setup.js` as a `Mount`; the
  `MountInterface` exposes `has`, `list`, `lookup`, `readText`,
  `maybeReadText`, `writeText`, `remove`, `move`, `makeDirectory`,
  which together cover what `copyTreeIfMissing` needs.
- **Source** — `workspace_template/` ships inside the published genie
  package.
  Options:
  1. Bake the template into a `ReadableTree` minted at module-load time
     (`E(agent).checkin(...)`), so the source is also cap-shaped.
     Likely too heavyweight on first launch if it requires a daemon
     round-trip per file.
  2. Read the template with Node `fs` (the genie unconfined caplet
     already has unrestricted host fs access during boot), but write to
     the destination via the Mount cap.
     Pragmatic; preserves cap discipline on the side that matters
     (the agent's runtime workspace).
  3. Inline the template at build time as a JS module returning
     `{ [path]: contents }`, then write through the Mount cap.
     No fs reads at all on the source side.

Option (2) is the smallest delta and keeps the seed bytes in the
package's git tree.
Option (3) is cleanest if we are already moving away from filesystem
template files.

## Status: DONE

All deliverables landed; the daemon-hosted genie now seeds the
workspace template through the workspace `Mount` cap whenever one is
available, falling back to the host-path signature only on the legacy
`process.cwd()` no-mount path that `dev-repl.js` also exercises.

## Deliverables

- [x] Decide between options (2) and (3) above.
  If unclear, pose the question in [`21_genie_sandbox_review_notes.md`](./21_genie_sandbox_review_notes.md)
  rather than choosing arbitrarily.

  **Decision:** option (2) — read the template with Node `fs`, write
  to the destination via the Mount cap.
  This is the smallest delta (no build-time inlining step), keeps the
  seed bytes in the package's git tree where they are already
  maintained as ordinary `.md` files, and preserves cap discipline
  on the side that actually matters: the agent's runtime workspace.
  Option (3) was set aside but remains a future option if the seed
  copy ever needs to ship to a runtime that has no host fs access at
  boot — none today.

- [x] Refactor `initWorkspace` to accept a `Mount` cap as its
  destination argument and forward to `E(mount).has` /
  `E(mount).writeText` / `E(mount).makeDirectory` (etc.) instead of
  `fs.access` / `fs.copyFile` / `fs.mkdir`.
  Keep the existing host-path signature available as a thin wrapper
  for `dev-repl.js`, which has no daemon and no Mount cap.

  **Result:** `packages/genie/src/workspace/init.js` now exports two
  pairs:
    - `initWorkspaceMount(mount)` / `isWorkspaceMount(mount)` — drive
      the seed copy through `E(mount).has`, `E(mount).writeText`, and
      `E(mount).makeDirectory`.  Reads the seed bytes from the host
      `workspace_template/` (option (2)) and writes them through the
      cap.
    - `initWorkspace(workspaceDir)` / `isWorkspace(workspaceDir)` —
      the original host-path signature, kept as a thin wrapper for
      `dev-repl.js`.

- [x] Update the `INIT_MARKER` write to use `writeText` on the Mount;
  similarly, `isWorkspace` should consume the cap.

  **Result:** the marker write at the end of `initWorkspaceMount`
  uses `E(mount).writeText('.genie-workspace-init', ...)`, and
  `isWorkspaceMount(mount)` consumes the cap via `E(mount).has(...)`.
  Both share a `formatMarkerContent()` helper with the host-path
  variant so the marker payload stays identical across paths.

- [x] Update `spawnAgent` to pass `workspaceMount` (rather than the
  host path) once the cap is available, falling back to the host path
  only when no factory / mount was minted.

  **Result:** `packages/genie/main.js` ~ line 1142 now branches:
  `workspaceMount` ? `initWorkspaceMount(workspaceMount)` :
  `initWorkspace(workspaceDir)`.
  In practice every non-legacy code path now rides the cap — the host
  fallback is reached only when `config.workspace` is empty *and* no
  `defaultWorkspaceMount` was injected (the pre-rollout
  `process.cwd()` deployment).
  The init log line tags whether the seed ran via the Mount cap so
  operators can confirm which path fired.

- [x] Add a unit test under `packages/genie/test/` that drives
  `initWorkspace` against a `makeMemoryVFS`-style in-memory Mount fake
  so the seed copy is exercised without a real daemon.

  **Result:** `packages/genie/test/workspace-init.test.js` covers
  five cases against an in-memory `makeMemoryMount()` fake that
  mirrors the daemon's `MountInterface` surface (`has`, `writeText`,
  `makeDirectory`):
    1. `isWorkspaceMount` returns false on an empty Mount.
    2. `initWorkspaceMount` seeds every host-template file plus the
       marker, with byte-identical content.
    3. The seed copy is idempotent — second run is a no-op.
    4. User customisations on existing files survive a re-seed.
    5. Regression guard: the marker write and every template-file
       write reach the Mount surface (no ambient host fs writes).

  Verified locally with
  `corepack yarn ava test/workspace-init.test.js` — 5 / 5 pass.

- [x] Update `packages/genie/CLAUDE.md` § "Capabilities the genie guest
  receives" to mention the Mount surface flowing through to template
  seeding (currently silent on this point).

  **Result:** added a "Template seeding flows through the same Mount
  cap" subsection that documents the read-host-fs / write-via-cap
  split and the two-front-door shape of `init.js`.

## Blocked by / blocks

- Mostly independent of [`22_genie_workspace_mount_form_value.md`](./22_genie_workspace_mount_form_value.md)
  but works better in tandem: once `workspace` accepts a pet name,
  `initWorkspace` can take the looked-up Mount cap directly.
- Lays groundwork for [`25_genie_tools_vfs_endo_mount.md`](./25_genie_tools_vfs_endo_mount.md):
  the same Mount-vs-VFS adaptation problem applies to the file tools.

## Cross-references

- `packages/genie/main.js` ~line 1142 — `initWorkspaceMount` /
  `initWorkspace` branch that picks the cap-driven path when a Mount
  is available.
- `packages/genie/src/workspace/init.js` — both front doors
  (`initWorkspaceMount` / `isWorkspaceMount` over a Mount cap, and
  `initWorkspace` / `isWorkspace` over a host path for `dev-repl.js`).
- `packages/genie/test/workspace-init.test.js` — unit coverage that
  drives `initWorkspaceMount` against an in-memory Mount fake.
- `packages/daemon/src/interfaces.js` `MountInterface` — destination
  cap surface this task targets.
- `packages/genie/CLAUDE.md` § "Capabilities the genie guest receives"
  / "Template seeding flows through the same Mount cap" — the
  convention this task documents.

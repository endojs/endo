# Genie sandbox — GC ordering on daemon restart

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _GC ordering on daemon restart_.

When the daemon restarts, `main-genie` and `main-genie-sandbox` must
reincarnate in the right order: slice first, worker after, so the
worker's tool registry sees a live slice on first call.

## Findings

The investigation below confirms that **no new daemon-side code is
needed**.
The "ordering" guarantee is enforced by `main.js`'s awaited lookup
chain at boot, against capabilities the daemon's existing pet-store
edge plumbing keeps alive across restart.
What looks like a `Mount → SandboxHandle → worker` formula chain in
the original framing is actually three sibling pet-store edges plus a
runtime `await` chain — the same shape `Mount` + `make-unconfined`
have today.

### What is actually pinned

The host pet store names four entries that together back the slice
flow.
Each is a direct pet-store edge (`packages/daemon/src/graph.js:556`
`onPetStoreWrite`), reseeded into the formula graph on daemon restart
by `seedGcEdges` (`packages/daemon/src/store-controller.js:101`,
called from `daemon.js:905`).

| Pet name (host store)            | Formula type     | Source                                                           |
| -------------------------------- | ---------------- | ---------------------------------------------------------------- |
| `workspace-mount`                | `mount`          | `setup.js:74` → `E(host).provideMount(GENIE_WORKSPACE, …)`       |
| `sandbox-factory`                | `make-unconfined`| `setup.js:95` → `E(host).makeUnconfined('@agent', sandbox-agent, { resultName })` |
| `main-genie`                     | `make-unconfined`| `setup.js:112` → `E(host).makeUnconfined('@main', main.js, { resultName })`        |
| `sandbox-persistent-main-genie-sandbox` (in `sandbox-factory`'s own pet store) | `scratch-mount` | `factory.js:1289` → `E(scratchProvider).provideScratchMount(…)` inside `makePersistent` |

The `SandboxHandle` itself is **not** a daemon formula — it is an
in-memory exo in the `sandbox-factory` worker.
The handle is reincarnated by `main.js`'s boot path (see below); the
on-disk reincarnation record lives in the scratch-mount above as
`spec.json` (`factory.js:1311`).

### Why no formula edge is needed between Mount → slice → worker

The original framing assumed `make-unconfined` would carry an edge to
the workspace mount.
It does not — `MakeUnconfinedFormula` deps are `worker` and `powers`
only (`daemon.js:532`, `daemon.js:3970`).
The same is true today for `Mount` and the existing `main-genie`
worker: they are siblings under the host pet store, not parent and
child in the formula graph, and the runtime never had a formula-graph
ordering between them.
What keeps them coherent is:

1. **Pet-store edges keep them all alive.**
   Both formulas are pinned by name in the host pet store.
   On daemon restart, `seedGcEdges` re-creates those edges before any
   `provide()` runs, so a lookup of `workspace-mount` from inside
   `main-genie` always finds a live formula.

2. **Reincarnation is lazy and runtime-ordered.**
   `revivePins` (`daemon.js:2369`) walks only the `/pins` directory;
   `main-genie` is **not** in `/pins`, so its `make-unconfined`
   formula does not auto-reincarnate at daemon startup.
   It comes back lazily when a CapTP message addresses it (the
   gateway calls `provide(mainGenieId)`), which spawns the worker and
   runs `main.js`'s `make()`.
   Inside `main.js`, lines 1386–1427 do an awaited lookup chain:

   ```js
   const factory = await E(rootPowers).lookup(SANDBOX_FACTORY_NAME);
   const workspaceMount = await E(rootPowers).lookup(WORKSPACE_MOUNT_NAME);
   const slice = await E(factory).makePersistent(SANDBOX_SLICE_NAME, {
     rootfs: { kind: 'host-bind' },
     mounts: [{ cap: workspaceMount, innerPath: '/workspace', mode: 'rw' }],
     network: 'private',
     backend: 'auto',
     env: { GENIE_WORKSPACE: '/workspace' },
     cwd: '/workspace',
   });
   // … later: makeCommandTool({ slice, … })
   ```

   Each `await` triggers `provide()` on the looked-up formula, which
   reincarnates it on demand.
   By the time the tool registry is constructed with `slice`, the
   `SandboxHandle` exo is fully alive — mounting the workspace cap
   resolved through the live `Mount` formula, and the on-disk
   `spec.json` already replayed by the factory's
   `makePersistent(name)` cache miss.

3. **The factory's own reincarnation is unremarkable.**
   `sandbox-factory` is a `make-unconfined` formula like any other.
   Its first `provide()` (driven by `main-genie`'s `lookup`)
   reincarnates the worker, which calls `makeSandboxFactory(...)`.
   The factory's in-memory `persistentSlices` map starts empty, so
   the `makePersistent('main-genie-sandbox', opts)` call falls
   through to the assemble-and-mint path; on a same-session repeat
   call the cached entry returns the same handle without re-running
   the driver (`factory.js:1271`).
   The on-disk `spec.json` is read implicitly: the daemon's
   pet-store edge to `sandbox-persistent-main-genie-sandbox` keeps
   the scratch-mount alive across restart, so `provideScratchMount`
   on the same name yields the directory the previous session wrote
   into.

### Conclusion

The TADA/22 § "GC ordering on daemon restart" deliverable is
satisfied by the existing pet-store-edge plumbing.
No new daemon-side dependency edge, no `thisDiesIfThatDies` glue, and
no formula-type addition are required.
The only correctness invariant the implementation must maintain is
the awaited lookup chain in `main.js` (`packages/genie/main.js:1386`
to `:1428`) — which is already in place — so the slice is minted
before the tool registry sees it.

Confirmed against:

- `packages/daemon/src/graph.js:556` (`onPetStoreWrite` →
  labeled `petName` edges).
- `packages/daemon/src/store-controller.js:101` (`seedGcEdges` walks
  the pet store on restart).
- `packages/daemon/src/daemon.js:905` (per-pet-store seed call).
- `packages/daemon/src/daemon.js:532` (`make-unconfined` deps:
  `worker`, `powers` only).
- `packages/daemon/src/daemon.js:2186` (`mount` formula maker —
  no deps).
- `packages/daemon/src/daemon.js:2369` (`revivePins` walks `/pins`
  only; pet-store-named workers reincarnate lazily).
- `packages/genie/setup.js:74,95,112` (pet-store provisioning).
- `packages/genie/main.js:1386–1428` (awaited lookup +
  `makePersistent` chain).
- `packages/sandbox/src/factory.js:1263–1341` (`makePersistent`:
  in-memory cache + scratch-mount on-disk record).

## Checklist

- [x] Document the formula dependency:
  - Pet-store edges (not formula-graph deps) pin
    `workspace-mount`, `sandbox-factory`, `main-genie`, and
    (inside the factory's pet store)
    `sandbox-persistent-main-genie-sandbox`.
  - The `SandboxHandle` itself is in-memory — re-minted by
    `main.js`'s awaited `makePersistent` call after the daemon
    revives the worker on first lookup.
  - Documented in § "Findings" above.
- [x] Confirm by inspection that the daemon's existing
  dependency-edge GC plumbing already orders Mount → SandboxHandle →
  worker without new code.
  Confirmed: pet-store edges keep all four siblings alive across
  restart; `main.js`'s awaited lookup chain enforces the runtime
  ordering at boot.
  This is the same shape today's `Mount` + `make-unconfined` pair
  uses (`workspace-mount` and the pre-3.5a `main-genie` were already
  sibling pet-store entries with no inter-formula edge).
- [x] Add a smoke test to
  [`40_endo_genie_sandbox_tests.md`](./40_endo_genie_sandbox_tests.md)
  that kills the daemon and asserts post-restart that `bash` still
  spawns through a live slice (no orphaned scratch / mount).
  Already filed — see `TODO/40` line 22–26 ("Daemon restart").

Depends on:
[`33_endo_genie_sandbox_persist_slice.md`](./33_endo_genie_sandbox_persist_slice.md),
[`34_endo_genie_sandbox_main_wiring.md`](./34_endo_genie_sandbox_main_wiring.md).

## Status

- 2026-05-01: Investigation complete; no daemon-side code change
  required.
  Pet-store edges + awaited `main.js` lookup chain provide the
  ordering guarantee.
  Smoke test stays filed under TODO/40 § "Daemon restart".

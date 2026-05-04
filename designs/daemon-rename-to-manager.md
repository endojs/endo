# Rename `daemon.js` to `manager.js` (and `Daemon`/`Mignonic` to `Manager`/`Worker`)

| | |
|---|---|
| **Created** | 2026-05-04 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The file `packages/daemon/src/daemon.js` and its peer `daemon-*.js`
power modules carry the orchestration responsibilities of an Endo
instance: formula graph, controller table, host/guest provisioning,
worker management, gateway, mail.
None of those responsibilities require the OS-level meaning of
"daemon" (a long-running detached background process).

With the Rust `endor` supervisor, the same JavaScript code is hosted
in two distinct ways:

1. As an in-process XS machine on a dedicated `std::thread`
   (`endor daemon`'s default), where there is no separate OS process
   for the JS at all.
2. As a Node.js child of `endor` under `ENDO_MANAGER_NODE=1`, where
   the JS is supervised by Rust and is plainly *not* the daemon.

In both cases the Rust side is the daemon and the supervisor.
The JS side is the orchestration layer that the supervisor hosts.
The Rust source already calls this role the **manager** (see
`rust/endo/src/endo.rs` `ManagerMode`, `ENDO_MANAGER_NODE`,
`spawn_inproc_xs_manager`, `endor.rs` "hosts the JS manager
in-process").
The JS side has not caught up.
Calling the same code "daemon" on the JS side and "manager" on the
Rust side overloads two distinct meanings and confuses anyone
straddling the boundary.

The colloquial counterpart of the daemon-side worker, currently named
**`MignonicPowers`** in `types.d.ts` (an adjective form of "mignon",
small/dainty), is opaque.
The actual worker entity has long been called `EndoWorker` /
`WorkerFormula` / `WorkerInterface`; the only place "Mignonic"
survives is the powers shape passed to a worker process at startup.
This design proposes aligning that name with the rest of the
`Worker` family.

## Naming

The candidate set is run through the namer procedure
([`../roles/namer.md`](../roles/namer.md)).

### `Daemon` -> `Manager` (file: `daemon.js` -> `manager.js`)

- **Law 0 (describes the thing).**
  The orchestration layer manages formulas, controllers, hosts,
  guests, workers, and the mail hub.
  "Manager" describes that role without claiming OS-process semantics.
- **Law 1 (describes no other thing).**
  Grep across `packages/` for `\bManager\b` finds two unrelated hits:
  a comment header `// Manager / Entry Point` in `packages/lal/agent.js`
  and prose in `packages/fae/NANOBOT-ARCHITECTURE.md`.
  Neither is a class or interface.
  The LAL "Manager/worker split" referenced in
  [`./lal-fae-form-provisioning.md`](./lal-fae-form-provisioning.md)
  is consistent with this rename, not in conflict with it.
- **Law 2 (shortest concise form).**
  "Manager" is a single word, no abbreviation needed.
- **Antonym/dual.**
  "Manager" pairs naturally with "Worker", which is the existing name
  for the entity the manager spawns and supervises
  (`EndoWorker`, `WorkerFormula`, `WorkerInterface`,
  `provideWorker`, `WorkerDaemonFacet`).
  The pair was previously fractured: `Daemon` was managing `Worker`s.
  After the rename the pair `Manager` / `Worker` is symmetric.
- **Precedent.**
  The Rust supervisor already uses the same word for the same role
  (`ManagerMode`, `ENDO_MANAGER_NODE`, `spawn_inproc_xs_manager`,
  `test:rust-node-manager` script in `packages/daemon/package.json`).

Verdict: **`Manager`**.

### `daemon-*-powers.js` -> `manager-*-powers.js`

Each `daemon-<host>-powers.js` peer module corresponds to a hosting
environment for the manager (Node.js, Go-supervised, Rust-supervised,
WebExtension).
Following the rename of `daemon.js` to `manager.js`, the peer modules
become `manager-node-powers.js`, `manager-go-powers.js`, and so on.
The `bus-daemon-*` family, which hosts the manager under a Rust or Go
bus supervisor, becomes `bus-manager-*` for the same reason.

Verdict: **`manager-<host>-powers.js`** and
**`bus-manager-<host>[-powers].js`**.

### `MignonicPowers` -> `WorkerPowers`

- **Law 0.**
  The type is the powers record handed to a worker process at startup
  (currently just a duplex byte connection).
  "WorkerPowers" describes that.
- **Law 1.**
  No other thing in the project is named `WorkerPowers` or
  `WorkerNodePowers`.
  Grep is empty.
- **Law 2.**
  "Worker" is the existing word for the entity; `WorkerPowers` is the
  shortest noun phrase that names its powers shape.
  "Mignonic" is a metaphor (small/dainty subordinate) that is opaque
  to a non-French reader and adds no information not already carried
  by `Worker`.
- **No synonyms in one system.**
  The codebase already uses `Worker` everywhere else for the same
  entity (`EndoWorker`, `WorkerInterface`, `WorkerFormula`,
  `provideWorker`).
  Keeping `Mignonic` solely on the powers shape is exactly the
  forbidden synonym.

Note: the user's prompt spelled the name "Mignion".
The actual identifier in the source is `MignonicPowers` (declared in
`packages/daemon/src/types.d.ts` line 89, referenced from `worker.js`,
`worker-node-powers.js`, `worker-go-powers.js`, and
`bus-worker-node-powers.js`).
There is no `Mignion`, `Minion`, or `Mignon` identifier in the source;
"Minion" appears only as an illustrative agent name in
[`./daemon-capability-persona.md`](./daemon-capability-persona.md).

Verdict: **`WorkerPowers`**.

### `Daemon`-prefixed identifiers -> `Manager`-prefixed identifiers

Direct mechanical mapping for the rest of the `Daemon*` family.
Each name is built from `Daemon` plus a role suffix; the suffix
already describes the thing, and `Daemon` is the only part that is
wrong.
Substituting `Manager` preserves the descriptive payload and removes
the OS-process implication.

| Current | Proposed |
|---|---|
| `makeDaemon` | `makeManager` |
| `DaemonCore`, `DaemonCoreExternal` | `ManagerCore`, `ManagerCoreExternal` |
| `DaemonicPowers` | `ManagerPowers` |
| `DaemonicPersistencePowers` | `ManagerPersistencePowers` |
| `DaemonicControlPowers` | `ManagerControlPowers` |
| `DaemonicGoPowers` | `ManagerGoPowers` |
| `makeDaemonicPersistencePowers` | `makeManagerPersistencePowers` |
| `makeDaemonicGoPowers` | `makeManagerGoPowers` |
| `DaemonDatabase`, `DaemonDatabaseImpl` | `ManagerDatabase`, `ManagerDatabaseImpl` |
| `makeDaemonDatabase` | `makeManagerDatabase` |
| `DaemonFacet`, `DaemonFacets` | `ManagerFacet`, `ManagerFacets` |
| `DaemonFacetForWorker` (and its `Interface`) | `ManagerFacetForWorker` |
| `DaemonWorkerFacet` | `ManagerWorkerFacet` |
| `WorkerDaemonFacet` | `WorkerManagerFacet` |
| `DaemonInterface` | `ManagerInterface` |
| `DaemonNode`, `DaemonProcess` | `ManagerNode`, `ManagerProcess` |
| `makeDaemonFacetForWorker` | `makeManagerFacetForWorker` |
| `daemonWorkerFacet` (variable) | `managerWorkerFacet` |
| `workerDaemonFacet` (variable) | `workerManagerFacet` |
| `EndoDaemonFacetForWorker` (exo tag) | `EndoManagerFacetForWorker` |

The `Daemonic` adjective collapses to plain `Manager`; there is no
need for `Manageric` or `Managerial`.
"Daemonic" was a coinage to avoid `DaemonPowers` reading like "the
powers of [a] Daemon[Core]".
With `Manager` there is no such ambiguity: `ManagerPowers` reads as
the powers handed to the manager.

### What stays

- `EndoWorker`, `WorkerFormula`, `WorkerInterface`, `provideWorker`,
  `mainWorker`, `nodeWorker`, `WorkerDeferredTaskParams`: already
  correct.
- The package directory `packages/daemon/` and the npm name
  `@endo/daemon`: see [Open Questions](#open-questions).
- The `endo` and `endod` CLI binaries and the literal word "daemon"
  in user-facing prose ("the Endo daemon") where it does mean the
  long-running process: out of scope.
  This rename targets the JS orchestration layer, not the OS-level
  daemon process started by `endo start`.

## Rename Inventory

This inventory is exhaustive enough that a builder can execute it
mechanically.
File renames are listed first; identifier renames second; consumer
imports third.

### File renames (`packages/daemon/src/`)

| Current | Proposed |
|---|---|
| `daemon.js` | `manager.js` |
| `daemon-node.js` | `manager-node.js` |
| `daemon-node-powers.js` | `manager-node-powers.js` |
| `daemon-go.js` | `manager-go.js` |
| `daemon-go-powers.js` | `manager-go-powers.js` |
| `daemon-database.js` | `manager-database.js` |
| `daemon-database-node.js` | `manager-database-node.js` |
| `daemon-persistence-powers.js` | `manager-persistence-powers.js` |
| `daemon-webextension.js` | `manager-webextension.js` |
| `bus-daemon-node.js` | `bus-manager-node.js` |
| `bus-daemon-node-powers.js` | `bus-manager-node-powers.js` |
| `bus-daemon-rust-xs.js` | `bus-manager-rust-xs.js` |
| `bus-daemon-rust-xs-powers.js` | `bus-manager-rust-xs-powers.js` |

`packages/daemon/test/bench-daemon.js` keeps its name (it benchmarks
"the daemon process" end-to-end), or is renamed to `bench-manager.js`
if the maintainer prefers consistency; see Open Questions.

### Identifier renames (`packages/daemon/src/`)

In `daemon.js` (becoming `manager.js`):

- `makeDaemon` -> `makeManager` (one export at line 5427).
- `makeDaemonCore` -> `makeManagerCore` (line 294).
- `makeDaemonFacetForWorker` -> `makeManagerFacetForWorker`
  (line 1169).
- Local variables `daemonWorkerFacet`, `workerDaemonFacet`,
  `daemonLabel` -> `managerWorkerFacet`, `workerManagerFacet`,
  `managerLabel`.
- JSDoc `@import { ... DaemonCore, DaemonCoreExternal,
  DaemonicPowers ... }` -> `... ManagerCore, ManagerCoreExternal,
  ManagerPowers ...`.

In `types.d.ts`:

- `MignonicPowers` -> `WorkerPowers` (line 89).
- `DaemonDatabase` (re-export at line 1247) -> `ManagerDatabase`.
- `DaemonicPersistencePowers` (line 1313) -> `ManagerPersistencePowers`.
- `DaemonicControlPowers` (line 1371) -> `ManagerControlPowers`.
- `DaemonicPowers` (line 1403) -> `ManagerPowers`.
- `DaemonWorkerFacet` (line 1348) -> `ManagerWorkerFacet`.
- `WorkerDaemonFacet` (line 1350) -> `WorkerManagerFacet`.
- `DaemonCore` (line 1500) -> `ManagerCore`.
- `DaemonCoreExternal` (line 1735) -> `ManagerCoreExternal`.

In `interfaces.js`:

- `DaemonFacetForWorkerInterface` (line 545) ->
  `ManagerFacetForWorkerInterface`.
- The exo tag string `'EndoDaemonFacetForWorker'` (line 546) ->
  `'EndoManagerFacetForWorker'`.
  Note: this is a wire-visible interface name; the change must be
  coordinated with the worker side, which is in the same package, so
  there is no across-version compatibility concern as long as both
  sides ship together.

In `daemon-database.js` / `daemon-database-node.js` (becoming
`manager-database.js` / `manager-database-node.js`):

- `makeDaemonDatabase` -> `makeManagerDatabase`.
- `DaemonDatabase`, `DaemonDatabaseImpl` JSDoc types ->
  `ManagerDatabase`, `ManagerDatabaseImpl`.

In `daemon-persistence-powers.js`, `daemon-go-powers.js`,
`daemon-node-powers.js`, `bus-daemon-node-powers.js`,
`bus-daemon-rust-xs.js`:

- `makeDaemonicPersistencePowers` -> `makeManagerPersistencePowers`.
- `makeDaemonicGoPowers` -> `makeManagerGoPowers`.
- All `DaemonicPowers`, `DaemonicPersistencePowers`,
  `DaemonicControlPowers` JSDoc / `@import` references ->
  corresponding `Manager...` forms.

In `worker.js`, `worker-node-powers.js`, `worker-go-powers.js`,
`bus-worker-node-powers.js`:

- `MignonicPowers` JSDoc imports / parameter types -> `WorkerPowers`.

### Consumer updates

In `packages/daemon/`:

- `index.js` (re-export entry): update any `Daemon*` re-exports.
- `types.d.ts` at the package root: update JSDoc imports.
- `test/endo.test.js`, `test/cross-supervisor.test.js`,
  `test/bench-daemon.js`: update identifier imports and any string
  references in test labels.
- `package.json` script names: `test:rust-node-manager` already exists
  and is already correct; no rename needed.

In other workspace packages (search shows ~20 files with `Daemon*`
imports from `@endo/daemon`):

- `packages/genie/setup.js`, `packages/genie/main.js`: import sites
  for `EndoHost`/`EndoGuest`/`Package`/`StampedMessage` are unaffected
  (those names don't change), but any local `DaemonicPowers` /
  `Daemon` imports need the rename.
- `packages/chat/`: most imports are for `EndoHost` (unaffected); a
  few `interfaces.js` imports may include changed names.
- `packages/cli/`, `packages/familiar/`, `packages/web-cli/`: same
  pattern; update wherever a `Daemon*` symbol is named.

A grep pass:

```sh
grep -rlE '\b(makeDaemon|DaemonCore|DaemonFacet|DaemonInterface|DaemonDatabase|DaemonicPowers|DaemonicPersistencePowers|DaemonicControlPowers|DaemonicGoPowers|WorkerDaemonFacet|DaemonFacetForWorker|DaemonWorkerFacet|DaemonNode|DaemonProcess|MignonicPowers)\b' \
  packages/
```

is the builder's authoritative source of truth.
At the time of writing it returns approximately 20 files in
`packages/daemon/` and a small number outside it.

### Rust side

`rust/endo/src/endo.rs`, `rust/endo/src/bin/endor.rs`, and
`rust/endo/src/proc.rs` already use `manager` consistently and
require no changes.
The legacy comment in `endor.rs` referring to "the legacy Node.js
daemon child for one release" can be updated to "the legacy Node.js
manager child" once the JS side ships, but that is a one-line
follow-up not part of the rename scope.

### Documentation

- `packages/daemon/CLAUDE.md`, `DEBUGGING.md`, `MULTIPLAYER.md`: edit
  identifier mentions; leave general "the daemon" prose alone where
  it refers to the long-running process.
- `designs/`: existing design documents reference `daemon.js` and
  `Daemon`-prefixed names freely.
  Sweep only the prose your PR adds or modifies; do not retroactively
  edit older designs (per
  [`../skills/em-dash-style-rule.md`](../skills/em-dash-style-rule.md)
  pitfalls).
- `CHANGELOG.md` for `@endo/daemon`: add an entry summarising the
  rename and that the npm package name and exports are unchanged.

## Phased Implementation

The work decomposes into three mechanical passes plus a coordination
step.
Each phase is independently mergeable; phase 2 depends on phase 1,
phase 3 depends on phase 2.

### Phase 1: file renames only

Rename the source files listed in
[File renames](#file-renames-packagesdaemonsrc) using `git mv`.
Update only the `import` specifiers that point at the renamed files.
Do not rename identifiers in this phase.
The diff is mostly path changes plus one-line import updates per
consuming file.
The package builds, types check, and tests pass after this phase.

Rationale: file renames create the largest mechanical churn but are
the safest review.
Reviewers can validate by reading import diffs; nothing about runtime
behavior changes.

### Phase 2: identifier renames

Apply the identifier mapping from
[Identifier renames](#identifier-renames-packagesdaemonsrc) and the
`Daemonic` -> `Manager` table.
This is a project-wide search-and-replace constrained to whole-word
matches.
The exo tag `'EndoDaemonFacetForWorker'` is renamed at the same time
on both producer and consumer (same package), so no wire compatibility
window is needed.

After this phase, `Daemon` and `Daemonic` no longer occur in
`packages/daemon/src/` source.

### Phase 3: consumer updates

Sweep workspace consumers identified by the grep recipe above.
This phase is small: most external consumers of `@endo/daemon` import
`EndoHost`, `EndoGuest`, `EndoWorker`, or other names that do not
change.

### Question of renaming the package itself

The npm package `@endo/daemon` and the directory `packages/daemon/`
are out of scope for this design; renaming a published package is a
separate exercise with deprecation, alias, and consumer-migration
implications.
See [Open Questions](#open-questions).

## Compatibility Considerations

- **Wire protocol.**
  The exo tag `'EndoDaemonFacetForWorker'` appears in CapTP traffic
  between manager and worker.
  Since both endpoints ship in the same package and the same release,
  there is no protocol-version skew.
  External CapTP peers do not see this tag; they see the
  `EndoBootstrap` / `EndoGateway` interfaces, which are unchanged.
- **Persistence.**
  No on-disk format changes.
  Formula JSON files refer to formula `type` strings (`'host'`,
  `'guest'`, `'worker'`, `'eval'`, etc.); no `type` is named
  `'daemon'`.
- **Public exports.**
  `@endo/daemon`'s public surface (the `index.js` re-exports) is
  small and almost entirely unrelated to the `Daemon*` names.
  Anything that does change (`makeDaemon` -> `makeManager`) is a
  visible API break and should ship with a CHANGELOG entry and a
  short deprecated alias if the maintainer wants a one-release window.
- **Upstream port to `endojs/endo`.**
  This rename is mechanical; the design and the implementation can
  port cleanly to `endojs/endo` with no `endo-but-for-bots`-specific
  dependencies.
  No `process/`-only artifacts are involved.
- **Downstream `agoric-sdk` and other consumers of `@endo/daemon`
  internals.**
  Search of the `endojs/endo` master and visible downstream
  repositories did not find any consumer that imports a `Daemon*`
  identifier from `@endo/daemon`.
  If one exists, it gets a one-line rename.

## Open Questions

1. **Should the package directory rename too?**
   `packages/daemon/` -> `packages/manager/`, `@endo/daemon` ->
   `@endo/manager`.
   This is a much larger change with deprecation/alias implications.
   The user's framing did not cover the package; this design proposes
   leaving the package name as-is and renaming only the orchestration
   file and identifiers.
   The maintainer can decide whether to schedule a follow-up package
   rename.
2. **Should `makeDaemon` survive as a deprecated alias for one
   release?**
   `export { makeManager as makeDaemon };` in `manager.js` would let
   downstream consumers migrate without a same-PR change.
   This is mostly a question of how strict we want the cut to be.
   Recommendation: include a one-line alias with a `@deprecated` JSDoc
   tag, drop in the next minor.
3. **`bench-daemon.js`.**
   The benchmark file measures end-to-end performance of "the daemon
   process".
   Renaming it to `bench-manager.js` is consistent; leaving it as
   `bench-daemon.js` is also defensible because the measurements
   include OS-process startup, supervisor handshake, and other
   non-manager costs.
   The maintainer's call.
4. **`daemon-webextension.js` -> `manager-webextension.js`.**
   This module imports a `main` symbol from `daemon.js` that does not
   appear to exist in the current source.
   Either it is dead code that should be deleted before the rename,
   or `main` is a missing export that needs to be added before
   touching the file.
   Builder should investigate.
5. **Test directory split.**
   `packages/daemon/test/endo.test.js` is the integration test for
   the daemon process; should it move to `packages/daemon/test/`
   subdirectory `manager/` to mirror the source structure?
   Out of scope for this design.

## Prompt

> Please dispatch a designer to propose a change that would deal with
> the naming problems with "daemon". In the daemon, we have a daemon.js
> that is central to the daemon but not necessarily used for
> daemonization or even running in the daemon/supervisor process, as
> can be the case with Rust endor supervisor and daemon.js in a Node.js
> child process.
>
> I have proposed that we rename daemon.js and its relevant peer
> modules to manager.js, like manager.js and manager-node-powers.js.
> Then we should go through the code proper and rename Daemon to
> Manager and Mignion to Worker.

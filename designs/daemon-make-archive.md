# daemon-make-archive

| | |
|---|---|
| **Created** | 2026-04-23 |
| **Updated** | 2026-04-24 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

> **Phases 1–5 are complete.**  The design has since grown Phase 6
> (the `@node` special name, described below), Phase 7
> (`makeFromTree` from a readable tree), and Phase 8
> (`makeUnconfinedFromTree` via a scratch-staging bridge).  Status
> is now **In Progress** again.  The 2026-04-24 revision:
>
> - Names the tree-backed methods by *source shape* rather than
>   by product: `makeFromTree` (confined) and
>   `makeUnconfinedFromTree` (unconfined Node + scratch).  The
>   placeholder `makeCaplet` is retired.
> - Makes `@node` a **required** dependency of every host:
>   `HostFormula` gains a mandatory `nodeWorker` field and
>   renames the existing `worker` to `mainWorker`.  Because this
>   release purges existing state, there is no optional-field
>   crutch and no reincarnation gap.
> - Adds an XS bridging subsection for Phase 7 (how tree-backed
>   caplets reach an XS worker that has no filesystem).
> - Introduces Phase 8 (`makeUnconfinedFromTree` + `stageTree`)
>   for Node plugins distributed as trees rather than bare
>   filesystem paths.
> - Adds acceptance criteria for Phases 6, 7, and 8.
> - Clarifies that the source-only rejection applies equally on
>   the Rust side.

## What is the Problem Being Solved?

The daemon currently exposes `makeBundle`, which executes a JavaScript caplet
packaged as an `endoZipBase64` bundle (a JSON document whose
`endoZipBase64` field is a base-64-encoded ZIP of a compartment map plus
**precompiled** ESM/CJS modules).  This shape is convenient for Node.js but
incompatible with our Rust supervisor and XS workers:

- Bundles are JSON-wrapped binary that has to be decoded and re-parsed before
  execution.
- The precompiled module formats (`pre-mjs-json`, `pre-cjs-json`) carry
  Babel-compiled functor source, which is significantly larger than the
  original modules and cannot be re-shared with workers that lack the
  precompile parsers.
- Rust workers cannot read a base-64 JSON wrapper out-of-band and cannot
  reuse the daemon's content-addressable store (CAS) for module sources.

We want to replace `makeBundle` with `makeArchive`, which:

1. Takes a readable blob reference to a **ZIP file** containing
   `compartment-map.json` and modules in their **source** formats (no
   precompiled module formats).
2. Lets Node.js workers compile each module at runtime via
   `@endo/module-source`.
3. Lets Rust workers read the underlying content directly from the CAS and
   run in-process.
4. Removes `makeBundle` entirely; replaces every `-b`/`--bundle` CLI option
   with `-z`/`--archive`.

## Status

- [x] Design captured (this document).
- [x] Daemon: `MakeArchiveFormula`, dispatcher case, `formulateArchive`.
- [x] Worker (Node): `makeArchive` on the worker daemon facet streams
  the archive via `streamBase64` and runs `compartment-mapper`'s
  `parseArchive` with the import-archive-all-parsers set.
- [x] Host: `EndoHost.makeArchive` mirroring the legacy `makeBundle`.
- [x] CLI: `endo archive`, plus `-z`/`--archive` on `endo run` /
  `endo make`.  `endo run` and `endo make` now build a source-only
  archive on the fly when given a bare file path.
- [x] Help text: `makeArchive` entry added; `makeBundle` entry removed.
- [x] Tests: full `makeBundle` end-to-end coverage migrated to
  `makeArchive` (env, persistence, cancellation, request flow).
- [x] **Phase 5 — Removal**: `makeBundle` is gone from the daemon
  (`WorkerDaemonFacet`, `MakeBundleFormula`, dispatcher case,
  `formulateBundle`, `EndoHost.makeBundle`, the inspector case, the
  formula-type whitelist), from the CLI (`endo bundle` command, the
  `-b`/`--bundle` options on `run`/`make`, `commands/bundle.js`, and
  `@endo/bundle-source` + `@endo/import-bundle` dependencies), and
  from the daemon test suite (`doMakeBundle`, `bundleSource` import).
- [x] **Phase 4 — Worker (Rust / XS)**: the XS worker bootstrap
  (`rust/endo/xsnap/src/worker_bootstrap.js`) already implements
  `makeArchive` end-to-end: it streams the archive bytes via
  `streamBase64`, decodes and assembles them, then calls the Rust
  host function `hostImportArchive` (defined at
  `rust/endo/xsnap/src/worker_io.rs:508`) which parses the ZIP via
  `archive::load_archive` and installs the entry compartment via
  `archive::install_archive`.  The worker then captures the entry
  namespace and runs `make(powers, context, { env })`.

  The dead `makeBundle` stub was removed from
  `worker_bootstrap.js` alongside the Phase 5 daemon-side removal.

  *Open optimisation:* the worker currently streams the archive
  through CapTP; for archives already in the CAS we could skip the
  stream and have the Rust worker fetch the SHA-256 directly from
  `cas_archive::load_archive_from_cas`.  Tracked as a follow-up; not
  required for correctness.

- [ ] **Phase 6 — `@node` special name, XS never runs
  `makeUnconfined`.**  We explicitly decide *not* to implement
  `makeUnconfined` on XS workers.  A host agent that needs to run a
  Node-only plugin must address the `@node` special name, which
  resolves to a **required** Node.js worker formula that every host
  carries in its own `HostFormula`.  Guests do **not** see `@node`;
  it is a host-only capability.  See the "Phase 6" section below.

- [ ] **Phase 7 — `makeFromTree` (confined caplet from a readable
  tree).**  Once `@node` plus archive execution are the only two
  paths, we reopen the tree-backed-caplet surface under its proper
  name: `makeFromTree(workerPetName, treeName, options)`.  The
  caller hands a `ReadableTree` (a CAS snapshot or a live mount
  point), a powers pet name, and optional env — and the daemon
  runs the named entry module from that tree in whichever worker
  the powers scope implies.  Source modules are loaded the same
  way `makeArchive` loads them; the difference is that the map
  lives in a tree shape rather than a ZIP.  See "Phase 7" below.

- [ ] **Phase 8 — `makeUnconfinedFromTree` (unconfined Node
  caplet from a readable tree, via scratch materialisation).**
  The bridge case for Node plugins distributed as trees rather
  than bare paths.  The daemon stages the tree into a
  host-scoped scratch directory under the Endo state tree (akin
  to `mkdtemp`), then runs Node's unconfined loader against the
  entry module.  Scratch lifetime is tied to the resulting
  caplet's context.  See "Phase 8" below.

## Design

### Wire format

The archive is the same ZIP shape that `@endo/compartment-mapper`'s
`makeArchive` produces today, with one constraint: modules must be
recorded in their **source** language (`mjs`, `cjs`, `json`, `text`,
`bytes`) rather than the precompiled forms (`pre-mjs-json`,
`pre-cjs-json`).  The compartment map's `compartment-map.json` lists
each module with its parser language; the loader on the worker side
uses that to dispatch to the right `ModuleSource` constructor.

The daemon stores the ZIP exactly as it stores any other readable blob
today — as an entry under the CAS keyed by SHA-256.  The Rust supervisor
already ingests archives into CAS via `rust/endo/src/cas_archive.rs`'s
`ingest_archive`, so no on-the-wire format change is needed there.

### Formula type

```ts
type MakeArchiveFormula = {
  type: 'make-archive';
  worker: FormulaIdentifier;
  powers: FormulaIdentifier;
  archive: FormulaIdentifier;     // readable-blob ID of the ZIP
  env?: Record<string, string>;
  cancelWithWorker?: FormulaIdentifier;
};
```

`extractLabeledDeps` reports `[['worker', ...], ['powers', ...],
['archive', ...]]`, plus optional `cancelWithWorker`.  The dispatcher
runs `makeArchive(workerId, powersId, archiveId, env, context,
cancelWithWorker)`, which (mirroring `makeBundle`):

1. Provides the worker controller and looks up its daemon facet.
2. Provides the archive blob (`readable-blob`).
3. Provides the powers ID.
4. Calls `E(workerDaemonFacet).makeArchive(readableArchiveP, powersP,
   farContext, env)`.

### Worker — Node.js

```js
makeArchive: async (readableP, powersP, contextP, env) => {
  const archiveBytes = await E(readableP).bytes();
  const { parseArchive } = await import('@endo/compartment-mapper');
  const { defaultParserForLanguage } = await import(
    '@endo/compartment-mapper/import-parsers.js'
  );
  const application = await parseArchive(archiveBytes, '<archive>', {
    parserForLanguage: defaultParserForLanguage,
  });
  const { namespace } = await application.import({ globals: endowments });
  return namespace.make(powersP, contextP, { env });
};
```

`defaultParserForLanguage` from `import-parsers.js` is the Babel-using
source set (mjs/cjs/json/text/bytes).  This is the only path that
accepts source modules from the archive.

### Worker — Rust / XS

The Rust supervisor already implements archive loading from CAS via
`load_archive_from_cas` and `run_xs_archive_loaded`.  When the daemon
dispatches a `make-archive` formula to a Rust-supervised worker, the
worker daemon facet receives the readable blob, asks the supervisor for
the underlying CAS root hash, and invokes the existing in-process
loader.  No new wire protocol verb is required because the existing
`deliver` envelope already carries enough state.

`makeBundle` is removed from the Rust worker — it has no path to handle
precompiled JSON bundles and was never supported.

### Host

```js
async makeArchive(workerName, archiveName, options) { ... }
```

Mirrors `makeBundle` exactly: looks up the archive pet name, runs
`prepareMakeCaplet`, calls `formulateArchive(...)`.

### CLI

- `endo archive <path>` — replaces `endo bundle`.  Invokes
  `compartment-mapper.makeArchive` (which returns a `Uint8Array`),
  stores the bytes as a readable blob, prints the SHA-512.
- `endo install -z <archive-name> ...` — replaces `-b`.
- `endo run -z <archive-name> ...` — same.
- `endo make -z <archive-name> ...` — same.

The `-b`/`--bundle` option and `endo bundle` command are removed.

### Tests

Every existing `makeBundle` end-to-end test is rewritten to call
`makeArchive` against a source-only archive.  The archive is built from
existing test fixtures with `compartment-mapper.makeArchive`.

The internal `doMakeBundle` test helper in `packages/daemon/test/endo.test.js`
is replaced with `doMakeArchive`.

#### Phase 6 tests (new)

Add `packages/daemon/test/endo.test.js` cases that cover:

- `host.lookup('@node')` resolves; `provideWorker('@node')` returns
  the same formula.
- `host.makeUnconfined(undefined, specifier, opts)` succeeds
  without naming a worker, and the result binds to a Node worker
  (observable via the test's direct worker probe).
- `guest.lookup('@node')` rejects.
- A host formulated with a supervisor configured
  `defaultWorkerKind: 'locked'` (XS) still exposes a working
  `@node`, i.e. the Node bridge is orthogonal to the default kind.
- Direct invocation of `makeUnconfined` on an XS worker produces
  the new error message (serves as a regression test for
  `worker_bootstrap.js`).
- `HostFormula` JSON written to disk contains both `mainWorker`
  and `nodeWorker` fields (simple shape test).

#### Phase 7 tests (new)

- `host.makeFromTree(undefined, 'tree-name')` resolves for both a
  `readable-tree` pet name and a `mount` pet name.
- The caplet can `import` a neighbouring module in the same tree
  via `compartment-map.json` relative references.
- A tree containing a `pre-mjs-json` module produces an
  "unknown-language" error on both workers.

#### Phase 8 tests (new)

- `host.makeUnconfinedFromTree(undefined, 'tree-name')` resolves
  against a `readable-tree` pet name and the result's behaviour
  matches an equivalent `makeUnconfined` against a hand-staged
  directory.
- Against a live `mount`, the same call succeeds and writes to
  the mount after the caplet starts do not perturb its view
  (snapshot-before-stage guarantee).
- Cancelling the caplet removes the scratch directory from the
  Endo state tree.
- `host.stageTree('tree-name')` returns a usable
  `ScratchMount`; its `path` is importable via the ordinary
  `makeUnconfined` call.
- A tree whose entry module uses a `.node` native addon runs
  successfully under Phase 8 (the unconfined bridge) and fails
  under Phase 7 (the confined path).

### Phase 6 — `@node`, and XS workers never run `makeUnconfined`

`makeUnconfined(workerName, specifier, …)` executes a Node.js plugin
module by pathname.  There is no portable way to satisfy that
contract inside an XS worker: the plugin comes from the host's
filesystem, may have arbitrary Node-only dependencies, and expects a
`module` + `require` environment that XS does not and should not
provide.  Rather than leave `makeUnconfined` as a worker-type split
brain, we make the decision explicit:

> **XS workers never implement `makeUnconfined`.  Every call to
> `makeUnconfined` is routed to a Node.js worker via the `@node`
> special name.**

The `@node` special name joins the existing `@agent` / `@self` /
`@host` / `@keypair` / `@mail` / `@nets` set on **host agents**.
It resolves to a long-lived Node.js worker formula that the daemon
provisions as a **required dependency** during host formulation,
scoped to that host.  Semantically:

- `E(host).lookup('@node')` → the Node worker capability.
- `E(host).makeUnconfined('@node', '/absolute/path/to/plugin.js', …)`
  is the canonical `makeUnconfined` invocation.  `workerName`
  values other than `@node` either (a) already resolve to a Node
  worker, which continues to work, or (b) resolve to an XS worker,
  which **rejects the call** with a clean `"makeUnconfined requires
  a Node.js worker; use @node"` error.
- Guests **do not** see `@node`.  The pet-sitter that overlays
  special names on the guest's pet store omits `@node`; an attempt
  to `lookup('@node')` from guest scope returns `undefined`.  A
  guest that wants a Node-confined caplet must go through the host
  in the usual way.
- The host may choose to cancel `@node` (which terminates the
  pre-provisioned Node worker); the next `@node` lookup provisions
  a fresh one.

#### Implementation sketch

Because all users are wiping state for this change, we treat
`@node` as a first-class required dependency of every host — same
status as `inspector` or `mailboxStore`.  No optional field, no
reincarnation gap, no repair tooling.  While we are reshaping the
formula, we also rename the existing `worker` field to `mainWorker`
so the on-disk shape names the special pet name each worker
powers.

- **Formula shape.**  `HostFormula` renames `worker` to
  `mainWorker` and adds a required `nodeWorker`:

  ```ts
  type HostFormula = {
    type: 'host';
    hostHandle: FormulaIdentifier;
    handle: FormulaIdentifier;
    petStore: FormulaIdentifier;
    mailboxStore: FormulaIdentifier;
    mailHub?: FormulaIdentifier;
    inspector: FormulaIdentifier;
    mainWorker: FormulaIdentifier;  // renamed from `worker`; powers @main
    nodeWorker: FormulaIdentifier;  // new, required; powers @node
    endo: FormulaIdentifier;
    networks: FormulaIdentifier;
    pins: FormulaIdentifier;
  };
  ```

- **Formulation.**  `formulateHostDependencies` in
  `packages/daemon/src/daemon.js` formulates both workers
  unconditionally and pins both.  The second call is
  `provideWorkerId(undefined, undefined, 'host-node',
  agentNodeNumber, 'node')`; the result is returned in the
  identifier bag.  `formulateNumberedHost` writes both IDs into
  `HostFormula`.
- **`provideWorkerId` simplification.**  The auto-promotion
  branch in `daemon.js:3742–3766` (which spins up a fresh Node
  worker when a caller asks for `kind: 'node'` but an XS worker
  was specified) becomes unnecessary for the host formulation
  path: the host already owns a Node worker and reaches it by
  name.  Keep the branch only for the caplet/CLI callers that
  pass a specified XS worker to `makeUnconfined` — they will
  increasingly route through `@node` instead.
- **Dispatcher.**  The `host` case in the formula dispatcher threads
  `formula.mainWorker` and `formula.nodeWorker` through to
  `makeHost` as two separate parameters.  No conditional branch.
- **`host.js`.**  `makeHost` accepts `mainWorkerId` and
  `nodeWorkerId` as required parameters, marks both with
  `context.thisDiesIfThatDies`, and populates `specialNames`
  unconditionally:

  ```js
  const specialNames = {
    ...platformNames,
    '@agent': hostId,
    '@self': handleId,
    '@host': hostHandleId ?? handleId,
    '@main': mainWorkerId,
    '@node': nodeWorkerId,   // always present
    '@endo': endoId,
    '@nets': networksDirectoryId,
    '@pins': pinsDirectoryId,
    '@info': inspectorId,
    '@none': leastAuthorityId,
    ...(mailHubId !== undefined ? { '@mail': mailHubId } : {}),
  };
  ```

  The existing `provideWorker` flow resolves `@node` through the
  pet-sitter like any other special name; no dedicated
  `provideNodeWorker` helper is needed.
- **Guests.**  `packages/daemon/src/guest.js`'s `specialNames` map
  already omits `@node`, so no change is required on the guest
  side.  The existing `makePetSitter` filter behaviour already
  denies lookups of unknown `@`-names.
- **`pet-name.js`.**  `isSpecialName` already accepts `@node` via
  the `^@[a-z][a-z0-9-]{0,127}$` regex; no change there.
- **XS worker error.**  The XS worker's `makeUnconfined` stub
  (currently `throw new Error('makeUnconfined not yet implemented
  in XS worker')` at
  `rust/endo/xsnap/src/worker_bootstrap.js:18989`) becomes
  `throw new Error('makeUnconfined requires a Node.js worker; use
  @node')`.  A stray call to an XS worker therefore produces the
  right hint regardless of which call site triggered it.
- **CLI default.**  `packages/cli/src/commands/make.js` defaults
  `workerName` to `'@node'` when `importPath` (i.e. `--UNCONFINED`)
  is set and no `-w` is supplied.  `endo run --UNCONFINED` gets the
  same default in `packages/cli/src/commands/run.js`.

#### Acceptance criteria

- `E(host).lookup('@node')` returns an `EndoWorker` remotable whose
  kind is `'node'`.
- `E(host).provideWorker('@node')` returns the same formula.
- `E(host).makeUnconfined(undefined, specifier, opts)` succeeds
  (the default resolves to `@node`).
- `E(guest).lookup('@node')` rejects with an "unknown pet name"
  shape.
- `E(xsWorker).makeUnconfined(...)` rejects with the new error
  message.
- A host formulated under `defaultWorkerKind: 'locked'` (XS)
  still exposes a working `@node` — the Node bridge is orthogonal
  to the default kind, because host formulation always asks for
  `kind: 'node'` explicitly for its `nodeWorker` slot.

#### Migration note

Tests that call `makeUnconfined` without naming a worker need to
pass `'@node'` (or pre-provision a Node worker explicitly).  The
one-line change is mechanical; the larger question is which CLI
flag we offer.  `endo make --UNCONFINED` already implies a Node
worker; the CLI can default `workerName` to `'@node'` when
`--UNCONFINED` is set and no other worker is named.

### Phase 7 — `makeFromTree` (confined caplet from a readable tree)

With `@node` delimiting Node-only terrain and `makeArchive` handling
source-only ZIPs, the last gap in the *confined* surface is running
a caplet from a **tree** rather than a ZIP — either a live mount
point (the daemon already exposes these) or a `readable-tree`
snapshot in the CAS (the same building block the archive story
rests on).  The new method:

```ts
makeFromTree(
  workerPetName: string | undefined,
  treeName: string,     // pet name of a ReadableTree or Mount
  options?: MakeCapletOptions & { entry?: string },
): Promise<unknown>;
```

Where:

- `treeName` resolves to either a `readable-tree` (CAS snapshot) or
  a `mount` (live filesystem).
- `options.entry` names the entry module path within the tree
  (defaults to following `compartment-map.json` / `package.json`
  `main`).
- The worker — chosen the same way `makeArchive` chooses one —
  reads the compartment map and module sources through the tree's
  filesystem-like surface (`list`, `lookup`, `readText`).  XS
  workers walk the tree through the Rust host's CAS bindings; Node
  workers walk it through `compartment-mapper`'s `ReadFn`.
- Source-only contract is preserved: `parserForLanguage` omits the
  precompiled parsers, so a tree that somehow contains
  `pre-mjs-json` files produces a clean "unknown language" error.

Once this lands, `makeArchive` becomes a thin adapter: "parse the
blob as a compartment-mapper ZIP, expose it as a tree, call
`makeFromTree`".  The XS-side fast path still uses
`hostImportArchive` for zero-copy archive loads; the semantic
equivalence means clients can use whichever is convenient.  A
future alias `makeFromArchive` is conceivable but not required —
`makeArchive` keeps its name for compatibility and because the
"ZIP" framing is how most callers think of it.

#### Naming rationale

Every `make*` method already returns a caplet, so the legacy
placeholder `makeCaplet` was weak — it failed to distinguish the
tree-backed path from `makeArchive` and `makeUnconfined`.  The
distinguishing axis is the *source shape*, so the name names the
source: `makeFromTree`.  The same axis drives Phase 8's
`makeUnconfinedFromTree`, below.  The three-axis table:

| Method | Source | Confinement |
|---|---|---|
| `makeArchive` | ZIP blob pet name | Compartmentalised (any worker) |
| `makeFromTree` | Readable tree or mount pet name | Compartmentalised (any worker) |
| `makeUnconfined` | Filesystem path string | Unconfined (Node only) |
| `makeUnconfinedFromTree` | Readable tree or mount pet name → scratch | Unconfined (Node only) |

#### XS bridging for tree-backed caplets

XS workers cannot read the host filesystem directly.  The Rust
supervisor therefore materialises the tree for the XS worker in
one of two ways:

1. **CAS snapshot (`readable-tree`).**  Already addressable by its
   root hash.  The Rust supervisor extends the existing
   `load_archive_from_cas` with a `load_tree_from_cas` host-call
   that streams the tree's module entries into a transient
   in-memory compartment-mapper view.  No on-disk ZIP is produced;
   the XS worker sees an in-memory archive shape synthesised from
   the tree's `compartment-map.json` and module blob hashes.
2. **Live mount (`mount` or `scratch-mount`).**  The supervisor
   snapshots the mount into CAS first (using the existing tree
   checkin pipeline), then hands the resulting `readable-tree` to
   the XS path above.  This trades a one-time copy for
   immutability inside the worker; it also matches the
   "caplet-as-of" semantics that `readable-tree` already carries.

Both paths preserve the source-only contract: the adapter uses the
same `parserForLanguage` map that omits the precompiled parsers,
so a tree containing `pre-mjs-json` produces a clean
"unknown-language" error from compartment-mapper on either worker.

Node workers take the simpler route: compartment-mapper's
`importLocation` already accepts a `ReadFn`, so the Node side
walks either the CAS snapshot or the live mount through
`readText` / `list` / `lookup` directly.  No Rust host-call
indirection.

### Phase 8 — `makeUnconfinedFromTree` (unconfined Node from a tree, via scratch)

`makeUnconfined(workerName, specifier, …)` accepts a filesystem
path string because that is the only thing Node's native module
loader understands.  Callers who want to ship a Node plugin as a
*tree* (CAS snapshot or mount) today have to stage it to disk
themselves.  Phase 8 makes that the daemon's job:

```ts
makeUnconfinedFromTree(
  workerPetName: string | undefined,
  treeName: string,     // pet name of a ReadableTree or Mount
  options?: MakeCapletOptions & { entry?: string },
): Promise<unknown>;
```

Semantics:

1. The daemon allocates a host-scoped scratch directory under the
   Endo state tree — effectively a single-use `ScratchMount`
   bearing no pet name but tied to the caplet's `context`.
2. The tree is materialised into that scratch directory.  For a
   `readable-tree`, the daemon walks the tree and writes each
   file.  For a live `mount`, the daemon first takes a tree
   snapshot (the same `checkinTree` path it already uses) and
   then materialises the snapshot — so concurrent mount writes
   cannot mutate the running caplet.
3. The daemon invokes `makeUnconfined` against the scratch
   directory's entry module, with `workerName` defaulting to
   `'@node'` (consistent with the CLI default introduced in
   Phase 6).
4. The scratch directory is a `thisDiesIfThatDies` dependency of
   the caplet.  When the caplet is cancelled or collected, the
   scratch directory is removed — no orphan trees accumulating
   in the state tree.

This keeps the unconfined Node bridge open for tree-native
workflows without requiring callers to hand-roll
`mkdtemp`+`cp -R` every time.

#### Composable alternative

The single-shot method is a convenience; the underlying
primitive is a public operation too:

```ts
stageTree(treeName: string): Promise<EndoScratchMount>;
```

`stageTree` materialises a tree into a fresh scratch mount and
returns the mount (a normal daemon capability).  Callers can
then invoke `makeUnconfined(worker, mount.path, …)` themselves.
`makeUnconfinedFromTree` is semantically `stageTree` followed by
`makeUnconfined`, wired with the right lifetime linkage.

#### Source-only vs native modules

`makeFromTree` (Phase 7) enforces the source-only contract — the
parser map omits precompiled formats, and the caplet runs inside
a compartment.  Phase 8 does **not**: by crossing into
`makeUnconfined` territory, the caller is opting into Node's
ambient authority and Node's native module loader.  Trees
destined for Phase 8 may include `.node` native addons, CJS
`require` chains, and so on — that is the whole point of the
bridge.  A tree that would work with Phase 7 will usually also
work with Phase 8, but the reverse is not true.

#### Acceptance criteria

- `E(host).makeUnconfinedFromTree(undefined, treeName)` succeeds
  for a `readable-tree` pet name.
- The same call succeeds for a `mount` pet name, and subsequent
  writes to the mount do not perturb the running caplet (proving
  snapshot-before-stage).
- Cancelling the caplet removes the scratch directory.
- `E(host).stageTree(treeName)` returns a usable `ScratchMount`
  whose `path` is importable via `makeUnconfined`.
- Calling `makeUnconfinedFromTree` on a tree containing a
  `.node` native addon succeeds (the bridge actually accepts
  native modules — unlike Phase 7).

### The legacy Node.js bridge

`@node`, `makeFromTree`, and `makeUnconfinedFromTree` together
mean that — once Phases 7 and 8 land — every caplet source falls
into one of four buckets:

1. **Archive (ZIP)** or **readable tree** loaded in *any* worker
   (Node or XS), via `makeArchive` / `makeFromTree`.  Source
   modules only, no precompiled formats.  This is the preferred
   path.
2. **Unconfined Node plugin from a filesystem path** via
   `makeUnconfined('@node', path, …)`.  The existing bridge for
   code already materialised on disk.
3. **Unconfined Node plugin from a tree** via
   `makeUnconfinedFromTree('@node', treeName, …)` (or the
   two-step `stageTree` + `makeUnconfined`).  The staging bridge
   for code distributed as trees.
4. **Eval** inside an individual worker via `E(worker).evaluate(…)`.
   The ad-hoc escape hatch; unchanged by this design.

Buckets 2 and 3 are the Node-only bridge.  The stated long-term
goal: grow the ecosystem (native capabilities, network
capabilities, platform packages) so that buckets 2 and 3 shrink.
It is not our goal to remove `@node`; it is our goal to make it
rarely necessary.

## Phased implementation

1. **Phase 1 (additive)** — add `make-archive` alongside `make-bundle`:
   formula type, dispatcher case, host method, worker facet method, CLI
   `endo archive` command and `-z` option, archive-based test helper,
   one passing end-to-end archive test.  *Done.*
2. **Phase 2 (migration)** — convert every existing `makeBundle` test
   to `makeArchive`.  Confirm the full suite passes.  *Done.*
3. **Phase 3 (removal)** — delete `makeBundle`, `MakeBundleFormula`,
   the dispatcher case, the host method, the worker facet method, the
   CLI `endo bundle` command, the `-b`/`--bundle` options, and the
   help-text entries.  Bump the daemon's interface version if any
   external consumers exist.  *Done.*
4. **Phase 4 (Rust / XS worker)** — XS worker `makeArchive` via
   `hostImportArchive`; removal of the `makeBundle` worker stub.
   *Done.*
5. **Phase 5 (Node-side wiring closure)** — Node worker `makeArchive`
   passes same env/context contract as `makeBundle` did.  *Done.*
6. **Phase 6 (@node, high priority)** — host-only `@node` special
   name backed by a **required** `nodeWorker` field on every
   `HostFormula`.  XS workers explicitly reject `makeUnconfined`
   with a message pointing at `@node`; guests do not see `@node`.
   CLI `endo make --UNCONFINED` defaults the worker to `@node`
   when none is given.  All users purge state for this change;
   no migration path.
7. **Phase 7 (`makeFromTree`)** — `makeFromTree(workerPetName,
   treeName, …)` running source modules out of either a CAS
   snapshot or a live mount point.  `makeArchive` becomes a thin
   specialisation.
8. **Phase 8 (`makeUnconfinedFromTree`)** — stage a tree into a
   host-scoped scratch directory and invoke `makeUnconfined`
   against the scratch entry module.  Supports native modules.
   Exposes the underlying `stageTree` primitive for callers that
   want to compose the steps by hand.

This plan keeps every milestone individually shippable.

## Design Decisions

1. **Same readable-blob storage.** The archive is just bytes; we reuse
   the existing `readable-blob` formula type rather than introducing a
   new `archive-blob` type.  The loader on each worker decides how to
   interpret the bytes.
2. **Compartment-mapper's `parseArchive` on the Node worker.** It
   already handles the ZIP+map format, exposes a clean Application
   facade, and is the canonical Endo loader.  We avoid building a
   second ZIP+map parser.
3. **Source-only contract (both workers).**  Workers reject archives
   that contain precompiled module languages (`pre-mjs-json`,
   `pre-cjs-json`).  On the Node side the `parserForLanguage` map we
   hand to `parseArchive` simply omits the precompiled parsers, so
   attempting to import a precompiled module surfaces a clean
   "unknown language" error from compartment-mapper.  On the Rust
   side, `rust/endo/src/archive.rs`'s loader walks the same
   `compartment-map.json` and errors out with the same shape when it
   encounters an unknown parser name — no precompiled-parser code
   lives in the Rust worker at all.  The ZIP on the wire is
   identical between the two paths.
4. **Remove rather than deprecate.** Keeping `makeBundle` would force
   us to maintain the precompiled path on every worker including XS,
   for a feature that has a strict superset (`makeArchive`).  The user
   has authorised removal in this round.
5. **XS workers do not implement `makeUnconfined`.**  `makeUnconfined`
   is inherently Node-shaped — it loads a plugin by filesystem path
   from the host's Node.js module graph.  Rather than paper over that
   with host-delegation magic, we make the constraint explicit: XS
   workers refuse `makeUnconfined`; hosts that need it address the
   `@node` special name instead.  Because `@node` is a required
   dependency of every host (see #9), the redirect is always
   available — it is not a best-effort lookup.
6. **`@node` is a host-only special name.**  Guests inherit a
   filtered view of special names that omits `@node`.  A guest that
   needs a Node-confined caplet goes through the host in the
   normal way — which is also the permission boundary where the
   host can decide whether to grant access.
7. **`makeFromTree` unifies the archive and tree paths.**  Once
   the readable-tree variant lands, `makeArchive` is a
   specialisation (it treats a ZIP blob as a tree).  We keep
   `makeArchive` as the cheap common case because the XS side has
   a zero-copy archive loader (`hostImportArchive`) that avoids
   tree-walk overhead.  Naming is by *source shape*
   (`makeArchive` / `makeFromTree` / `makeUnconfined` /
   `makeUnconfinedFromTree`) rather than by product ("caplet"),
   because every `make*` already returns a caplet.
8. **The legacy Node.js bridge stays open indefinitely.**  We
   neither deprecate nor remove `makeUnconfined` (path) or
   `makeUnconfinedFromTree`.  The goal is to make them rarely
   necessary by growing the ecosystem of capability providers
   that run in any worker — not to force code through the archive
   path when it genuinely needs Node's ambient authority.
9. **`@node` is a required host dependency, not optional.**  With
   a clean state wipe accompanying Phase 6, every `HostFormula`
   carries a `nodeWorker` field unconditionally.  This eliminates
   a conditional in every code path that touches host special
   names and removes the "pre-Phase-6 host" class of bugs from
   the surface entirely.  It also lets `provideWorkerId` shed
   its XS-to-Node auto-promotion branch in the host-formulation
   path, since the Node worker is reached by name rather than
   synthesised on demand.  While reshaping the formula we also
   rename the existing `worker` field to `mainWorker` so each
   slot names the special pet name it powers.

## Dependencies

| Design | Relationship |
|--------|--------------|
| daemon-cas-management | `makeArchive` reuses the CAS archive ingestion path on the Rust side; `makeFromTree` (Phase 7) does the same for CAS tree snapshots. |
| daemon-capability-bus | Worker facet method dispatch unchanged; uses the existing CapTP envelope. |
| daemon-mount | `makeFromTree` (Phase 7) consumes live mounts as its readable-tree input; `makeUnconfinedFromTree` (Phase 8) snapshots mounts through the same checkin pipeline before staging to scratch. |

## Known Gaps and TODOs

- [ ] **Phase 6 — `@node` required on `HostFormula`.**  Rename
  `worker` → `mainWorker`, add required `nodeWorker`, formulate
  both in `formulateHostDependencies`, populate `'@node'` in
  host special names unconditionally, update XS worker
  `makeUnconfined` error message, default CLI `--UNCONFINED` to
  `@node`.  All users purge state; no migration.
- [ ] **Phase 7 — `makeFromTree(treeName, …)` from a readable
  tree.**  New host method (`makeFromTree`), new
  `MakeFromTreeFormula` (or reuse `MakeArchiveFormula` with a
  tree-ref variant), dispatcher case, tree-walk adapter on the
  Node worker side, CAS-tree adapter on the XS worker side.
- [ ] **Phase 8 — `makeUnconfinedFromTree` + `stageTree`.**  New
  host methods, new scratch-materialisation adapter, scratch
  lifetime tied to caplet context, optional snapshot-before-stage
  for live mounts.
- [ ] `endo archive` behaviour when the project tree contains a
  `package.json` without a `main` entry (today `endo bundle` errors
  with a compartment-mapper message; we should mirror that).
- [ ] Whether `makeArchive` should accept a CAS root-hash reference
  *directly* (skipping the readable-blob wrapper) for Rust workers,
  to avoid one round-trip through the daemon.  Subsumed by Phase 7
  if `makeFromTree` takes a `readable-tree` by formula id.
- [ ] XS-side SQLite port of `daemon-database.js`; needed for
  durability of pet-store/agent-keys/retention on the Rust
  supervisor path.  Currently shimmed with in-memory maps.
- [ ] Observability: an `endo workers` (or equivalent) view that
  shows which host owns which `@node` formula, so that a stuck
  Node plugin does not require spelunking through formula JSON to
  locate its worker process.
- [ ] Whether `makeUnconfined(path)` eventually becomes a
  specialisation of `makeUnconfinedFromTree` (stage an existing
  host-path mount, then run).  Design-decision #8 says we keep
  the path-based form as a first-class bridge; whether to keep
  both implementations or collapse them is a question to revisit
  after Phases 7 and 8 ship.

## Prompt

> I would like to deprecate makeBundle in favor of a makeArchive routine.
> The difference is that makeArchive will take a readable blob reference
> for a ZIP file containing a compartment-map.json and modules in their
> source formats: no precompiled module formats. The Node.js worker
> implementation would read the ZIP file and compile each module at
> runtime with the ModuleSource from `@endo/module-source`. The Rust
> version would oblige the worker to read the underlying content from
> the CAS directly and run in memory. makeBundle would not be supported
> by Rust workers and so no tests can use it. We would presumably remove
> it entirely, replacing all the CLI that take -b with -z for
> non-pre-compiled ZIP archives. Please flesh out the design, implement,
> and test.

### Follow-on prompt (Phases 6 and 7)

> Regarding makeUnconfined on XS, let's explicitly decide not to
> implement makeUnconfined on XS and instead ensure that all usage of
> makeUnconfined uses a Node.js worker explicitly.  This requires us
> to expose a `@node` special name to host agents (and explicitly
> exclude this capability in guest agents).  Revise the documented
> design for this as a high priority next step.
>
> That will leave makeArchive as the preferred method for making a
> capability from a ZIP file, eschewing, deprecating, then
> eliminating the bundle system.
>
> We can then move on to a facility for creating capabilities from
> modules in arbitrary readable trees, either mount points or
> snapshots in the content address store, which should work without
> reservation based on the same systems that support makeUnconfined.
>
> That would just leave a hole for making unconfined capabilities on
> Node.js.  We would, in time, hope our ecosystem grows to have
> feature parity without the legacy Node.js platform, but will need
> to keep a bridge open.

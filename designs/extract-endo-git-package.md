# Extract `@endo/endo-git` Package

| | |
|---|---|
| **Created** | 2026-06-01 |
| **Updated** | 2026-06-01 |
| **Author** | kumavis (prompted) |
| **Status** | In Progress |

## Status

Phases 1 through 4 landed on `claude/extract-git-package`:

- `packages/endo-git/` scaffolded with `package.json`, `README.md`, hand-written `types.d.ts` shim, `src/index.js` re-exports, and `src/interfaces.js` carrying the six git interface guards plus the git-only shape constants (`RefArgShape`, `GitDirectionShape`, the status-entry / ref / commit shapes).
- All five git source files moved out of `@endo/daemon/src/` into `@endo/endo-git/src/`:
  - `git-credential.js` (Phase 2a; only depended on the interface guards, cleanest leaf).
  - `native-git-backend.js` (Phase 2a; `makeReaderRef` threaded in as an optional power with a default that throws lazily).
  - `git.js` and `git-filesystem.js` (Phase 2b; moved as a pair because they cross-reference; `lineageOf` threaded in as a required power on `makeGit`).
  - `git-remote.js` (Phase 2c; relative imports inside the package collapse back to siblings).
- Daemon imports swept (Phase 4): `daemon.js`, `host.js`, `interfaces.js` (which now re-exports the six guards from `@endo/endo-git`), `test/git.test.js`, and `test/git-remote.test.js` now all reach the git surface through `@endo/endo-git`.
- `packages/endo-git/src/types.js` carries the git typedefs (`GitRef`, `GitCommit`, `GitDiffOptions`, etc.) that the moved files' `@import` comments still reference; daemon-only surface types (`EndoMount`, `EndoMountEntry`) are aliased to `unknown` to keep the dep graph one-way.

Test totals after the move on `claude/extract-git-package`:

- `git.test.js`: 59 / 59 pass.
- `git-remote.test.js`: 16 failures — all pre-existing on `llm` HEAD, caused by the CI environment's gpg-signing intercept refusing to sign the test-fixture commits.  Confirmed by stashing my changes and re-running — identical failures.
- Adjacent tests (`formula-identifier`, `formula-type`, `context`): 31 / 31 still green.

What's deferred:

- **Phase 5** — in-process unit tests in `packages/endo-git/test/`.  Not landed; only the daemon-side integration tests exercise the moved code today.  The test directory exists but is empty.
- **Phase 6** — structural `tsc --build` emission for the new package.  The hand-written `types.d.ts` shim is sufficient and ships with the package.  Same trade-off as `endo-fs`: per-package emission would require `endo-fs` and `patterns` to land their own `.d.ts` emission stably first.
- **Phase 7** — the `makeNotYetImplementedBackend` and `internalHelpers` exports remain in `@endo/endo-git`'s public surface but are test-only.  A future pass could split them into a `/testing` subpath export so the public surface advertises only the production-shaped exports.

> **Read after:**
> - [daemon-git-capability](daemon-git-capability.md) — the `Git` cap whose factory and backend move out of `packages/daemon`.
> - [daemon-git-remotes](daemon-git-remotes.md) — the `GitRemote` / `GitCredential` factories that move with `Git`.
> - [endo-fs-from-git](endo-fs-from-git.md) — the `makeGitFsBackend` adapter that moves with `Git`.
> - [endo-fs-backend-seam](endo-fs-backend-seam.md) — the `FsBackend` seam the adapter targets.

## Summary

Move the daemon's git capability layer out of `packages/daemon/src/` and into a new workspace package `@endo/endo-git` at `packages/endo-git/`.

The new package owns the `EndoGit` exo factory, the `NativeGitBackend` subprocess wrapper, the immutable-tree `FsBackend` adapter, the remote / credential capabilities, and the interface guards.

The daemon retains everything that is genuinely daemon-internal: formula-registry dispatch (`formulateGit*`), host vending (`provideGit*`), persistent storage of credential records, and the integration tests that fork a full daemon.

The new package can ship its own unit tests against the backend and the in-process exos without booting a daemon.

This is purely a code-organisation refactor — no new capabilities, no breaking changes to the daemon's public RPC surface, and no change to the storage format of git-related formulas.

## What is the Problem Being Solved?

`packages/daemon/src/` carries ~3.4 kLOC of git-specific code (`git.js`, `native-git-backend.js`, `git-filesystem.js`, `git-remote.js`, `git-credential.js`) plus ~1 kLOC of git-only typedefs and interface guards.
That is roughly the same footprint as `@endo/endo-fs` and `@endo/captp`, both of which earned dedicated packages.

The git surface has matured to the point where the daemon's other concerns no longer touch the internals.
The daemon talks to git via three boundaries: `makeGit({ mount, backend, readOnly })`, `makeGitRemote({ git, credential, ... })`, and `makeGitCredentialController(...)`.
Everything else — git's understanding of refs, blobs, trees, the subprocess wrapper, the `FsBackend` adapter, the audit shape — is internal to the git surface and can be reasoned about in isolation.

Pulling git into its own package buys:

1. **Faster build / test cycles on the daemon.**
   Daemon test runs currently rebuild and lint ~4.4 kLOC of git code on every iteration even when the change is unrelated.
   With git extracted, `cd packages/daemon && npx ava test/<non-git>.test.js` no longer touches git source.
2. **Independent test surface.**
   `NativeGitBackend` is the kind of code that benefits from unit tests against a real `git` binary with no daemon in the loop — startup latency drops from ~5 s/test (fork daemon, provision worktree, await readiness) to ~50 ms/test.
   The current `packages/daemon/test/git.test.js` is a `test.serial` suite that forks a daemon per case because that's the only place to mount the code; with extraction, the in-process exo tests can be `test()` (parallel) and only the formula-dispatch tests need to remain in daemon.
3. **A reusable seam.**
   Anyone building a CapTP-spoken endo capability that wraps a git repo today has to either import from `packages/daemon/src/` (which is not a published path) or vendor a copy.
   `@endo/endo-git` would be installable.
4. **Cleaner daemon import graph.**
   `daemon.js`, `host.js`, and the formula handlers drop three `import ... from './git*.js'` lines each in favour of one `from '@endo/endo-git'`.

## Goals

- A new workspace package `@endo/endo-git` at `packages/endo-git/`.
- `makeGit`, `makeGitRemote`, `makeGitCredentialController`, `makeNativeGitBackend`, `makeGitFsBackend`, and the corresponding interface guards exported from the new package.
- The daemon imports those names from `@endo/endo-git` instead of relative paths.
- `packages/daemon/test/git.test.js` and `git-remote.test.js` retain their current coverage (they're integration tests against a forked daemon; they continue to test the public surface).
- New in-process unit tests in `packages/endo-git/test/` for the backend, the FsBackend adapter, and the credential controller — none of which need a daemon.
- The new package emits its own `.d.ts` declarations, or — if the same `tsc --build` ordering problem we hit with `endo-fs` resurfaces — ships a hand-written `types.d.ts` shim with the same shape.
- Workspace topology stays acyclic: `@endo/endo-git` depends on `@endo/endo-fs`, `@endo/exo`, `@endo/errors`, `@endo/eventual-send`, `@endo/stream`, `@endo/platform`; no dependency on `@endo/daemon`.

## Non-Goals

- No changes to the public `EndoGit` / `EndoGitRemote` / `EndoGitCredential` capability surface; the formula schemas and the methods they expose stay byte-identical.
- No changes to the persistent storage format for `GitFormula`, `GitCredentialFormula`, or `GitRemoteFormula`.
- No changes to the `MIN_GIT_VERSION` floor or the `assertNoExecutableRepoConfig` policy.
- No new git features (no shallow-clone support, no `git-lfs` integration, no `git protocol v2` plumbing).
- No re-home of `@endo/endo-fs`'s `from-mount.js` adapter — the existing one-way bridge from `EndoMount` to `Filesystem` stays where it is.
- No move of `reader-ref.js` or `mount.js` out of the daemon — those are daemon-internal helpers that the git code will reach via a small power-passing rebinding (see § Dependency Cuts).

## Inventory

This is the surface that moves.
Numbers from `git ls-tree -r --long origin/llm packages/daemon/src/ | grep -E 'git.*\.js'`:

| File | LOC | Role |
|---|---|---|
| `packages/daemon/src/git.js` | 521 | `makeGit` factory; `EndoGit` exo; `GitBackend` typedef; `GitTreeEntryRecord` typedef; host-private `isGitReadOnly`, `getGitBackend`; `filesystemAt`. |
| `packages/daemon/src/native-git-backend.js` | 1438 | `makeNativeGitBackend` subprocess wrapper; `runGitRaw`, `runGitBuffer`, `streamGitBuffer`; `resolveTree`, `lsTree`, `readBlobBytes`, `streamBlobBytes`; `MIN_GIT_VERSION`, `assertNoExecutableRepoConfig`, `GIT_BASE_ARGS`. |
| `packages/daemon/src/git-filesystem.js` | 316 | `makeGitFsBackend({ backend, treeOid })` adapter for `wrapBackend(...)`. |
| `packages/daemon/src/git-remote.js` | 1220 | `makeGitRemote` factory; `GitRemotePolicy`; remote audit shape; `DEFAULT_POLICY`. |
| `packages/daemon/src/git-credential.js` | 180 | `makeGitCredentialController`; `makeBasicCredential`, `makeBearerCredential`, `makeUnavailableGitCredential`. |

Interface guards in `packages/daemon/src/interfaces.js` (the lines, not the whole file):

- `GitInterface` (lines 680–723)
- `GitRemoteInterface` (725–732)
- `GitRemoteControllerInterface` (734–747)
- `GitCredentialControllerInterface` (749–756)
- `BearerCredentialInterface`, `BasicCredentialInterface` (758–764)
- `RefArgShape` and any other git-only shape constants currently colocated in `interfaces.js`.

Typedefs in `packages/daemon/src/types.d.ts`:

- `EndoGit` (394–440), `EndoGitRemote`, `EndoGitCredential`, `EndoGitFsRoot`.
- `GitRef`, `GitCommit`, `GitIndexStatus`, `GitWorktreeStatus`, `GitStatusEntry` (264–310).
- `GitDiffOptions`, `GitLogOptions`, `GitRestoreOptions`, `GitCreateBranchOptions`, `GitDeleteBranchOptions`, `GitMergeOptions`, `GitRebaseInput`, `GitStashPushOptions` (311–382).
- `GitBackend`, `GitTreeEntryRecord`, `GitRemotePolicy`, `GitRemoteAuditEvent`.

Daemon wiring (stays in daemon, but the imports change):

- `daemon.js` lines 68–75 (three `import` lines).
- `daemon.js` lines 2731, 2735, 2814 (factory call sites).
- `daemon.js` lines 3658–3804 (`formulateGit`, `formulateGitCredential`, `formulateGitRemote` formula handlers).
- `host.js` lines 33–35 (three `import` lines).
- `host.js` lines 369–540 (`provideGit`, `provideGitRemote` host capability vending).

Tests:

- `packages/daemon/test/git.test.js` — stays (forks daemon).
- `packages/daemon/test/git-remote.test.js` — stays (forks daemon).
- `packages/daemon/test/mount.test.js` (partial git-mount integration) — stays.
- `packages/daemon/test/endo.test.js` (e2e) — stays.
- **New:** `packages/endo-git/test/native-git-backend.test.js` — unit-tests the subprocess wrapper against a `git init` temp dir, no daemon.
- **New:** `packages/endo-git/test/git-filesystem.test.js` — unit-tests the FsBackend adapter against a fake `GitBackend` plus the FsBackend protocol.
- **New:** `packages/endo-git/test/git-credential.test.js` — unit-tests the credential controller (no daemon needed).
- **New:** `packages/endo-git/test/git-remote.test.js` (light) — unit-tests the policy filtering logic against a fake `git` + fake credential injection; the full integration round-trip stays in `packages/daemon/test/git-remote.test.js`.

## Dependency Cuts

Two daemon-internal imports currently reach into the git modules.
Both need an injection seam at the package boundary.

### 1. `lineageOf` from `mount.js`

`packages/daemon/src/git.js` imports `lineageOf` from `./mount.js` and calls it inside `makeGit` to verify that mount entries handed back across `Git` methods belong to the same mount lineage (an anti-traversal check).

The `lineageOf` implementation reads two daemon-private `WeakMap`s (`mountEntryRecords`, `mountRecords`) that are populated by `makeMount`.
Those maps are deliberately not part of the `Mount` cap's public surface — they're a daemon-internal way to recognise objects the daemon itself minted.

**Resolution:** pass `lineageOf` into `makeGit` as a power.
`makeGit({ mount, backend, readOnly, lineageOf })`.
The daemon binds it at the call site; in-package unit tests inject a stub that recognises a test-only marker.

Alternative considered: move `lineageOf` and its `WeakMap`s into a shared `@endo/endo-mount-identity` package.
Rejected because the maps' provenance — being populated by `makeMount` itself — means the right home is wherever `makeMount` lives, which is the daemon.

### 2. `makeReaderRef` from `reader-ref.js`

`packages/daemon/src/native-git-backend.js` imports `makeReaderRef` to wrap the streamed `git cat-file` / `git diff` output as a CapTP-friendly reader ref.

`reader-ref.js` itself imports `AsyncIteratorInterface` from `./interfaces.js` (a daemon-internal interface guard) and `mapReader` from `@endo/stream`.
Of the three, only `AsyncIteratorInterface` is daemon-private.

**Resolution (preferred):** move `reader-ref.js` to `@endo/endo-fs` (it's a generic CapTP-friendly reader wrapper, not git-specific).
The daemon and the new git package both depend on `@endo/endo-fs` already; this kills two birds.

**Resolution (fallback):** pass `makeReaderRef` into `makeNativeGitBackend` as a power.
Less elegant — every consumer in the daemon would have to thread the power — but does not require touching `endo-fs`.

The preferred path is essentially free; only the import path in three call sites changes.

### 3. Interface re-exports

Some daemon-internal interface constants (`AsyncIteratorInterface`, etc.) are referenced by both daemon-internal code and by the git modules.

**Resolution:** move the daemon-internal interfaces that the new package needs (`AsyncIteratorInterface`, `RefArgShape` if it's git-specific) into the new package and have the daemon `interfaces.js` re-export them.
For everything else, the new package's `interfaces.js` only contains the git-only guards.

## Package Layout

```
packages/endo-git/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsconfig.composite.json     # if per-package tsc emission is feasible
├── types.d.ts                  # hand-written shim, until/unless tsc emission lands
├── README.md
├── DESIGN.md                   # short architecture note; details stay in this doc
├── src/
│   ├── git.js
│   ├── native-git-backend.js
│   ├── git-filesystem.js
│   ├── git-remote.js
│   ├── git-credential.js
│   ├── interfaces.js
│   └── types.js                # JSDoc-only typedef host (mirrors daemon/types.js pattern)
└── test/
    ├── native-git-backend.test.js
    ├── git-filesystem.test.js
    ├── git-credential.test.js
    └── git-remote.test.js
```

### `package.json` shape

```jsonc
{
  "name": "@endo/endo-git",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.js",
  "exports": {
    ".":                        { "types": "./types.d.ts", "default": "./src/index.js" },
    "./src/git.js":             { "types": "./types.d.ts", "default": "./src/git.js" },
    "./src/native-git-backend.js": { "types": "./types.d.ts", "default": "./src/native-git-backend.js" },
    "./src/git-filesystem.js":  { "types": "./types.d.ts", "default": "./src/git-filesystem.js" },
    "./src/git-remote.js":      { "types": "./types.d.ts", "default": "./src/git-remote.js" },
    "./src/git-credential.js":  { "types": "./types.d.ts", "default": "./src/git-credential.js" },
    "./src/interfaces.js":      { "types": "./types.d.ts", "default": "./src/interfaces.js" }
  },
  "types": "./types.d.ts",
  "dependencies": {
    "@endo/endo-fs":       "workspace:^",
    "@endo/errors":        "workspace:^",
    "@endo/eventual-send": "workspace:^",
    "@endo/exo":           "workspace:^",
    "@endo/harden":        "workspace:^",
    "@endo/patterns":      "workspace:^",
    "@endo/platform":      "workspace:^",
    "@endo/stream":        "workspace:^"
  },
  "devDependencies": {
    "ava":                 "...",
    "@endo/init":          "workspace:^"
  }
}
```

`src/index.js` re-exports the public entry points:

```js
export { makeGit } from './git.js';
export { makeNativeGitBackend } from './native-git-backend.js';
export { makeGitFsBackend } from './git-filesystem.js';
export { makeGitRemote } from './git-remote.js';
export {
  makeGitCredentialController,
  makeBasicCredential,
  makeBearerCredential,
  makeUnavailableGitCredential,
} from './git-credential.js';
export {
  GitInterface,
  GitRemoteInterface,
  GitRemoteControllerInterface,
  GitCredentialControllerInterface,
  BasicCredentialInterface,
  BearerCredentialInterface,
} from './interfaces.js';
```

## Phased Implementation

### Phase 0: Pre-flight

- Run the full daemon test suite on `llm` HEAD and capture timings as the baseline.
- Verify the `endo-fs` `types.d.ts` shim still resolves cleanly (the new package depends on `endo-fs`; if the shim is broken on `llm` HEAD we fix that first).

### Phase 1: Scaffold the package

- Create `packages/endo-git/` with `package.json`, `tsconfig.json`, an empty `src/index.js`, and an `npx ava` config that points at `test/`.
- Add `@endo/endo-git` to root `package.json` workspaces if it isn't already covered by the `packages/*` glob.
- `npx corepack yarn install` to wire up workspace symlinks.
- Confirm `yarn workspaces foreach -p run build` still passes (no new tsc cycle).

### Phase 2: Move the leaf modules

In order of fewest daemon-internal dependencies first:

1. **`git-credential.js`** — depends only on `@endo/errors`, `@endo/exo`, and `./interfaces.js`.
   Move the file, move the interface guards it needs, leave a re-export shim at `packages/daemon/src/git-credential.js` for one commit, then sweep call sites and delete the shim.
2. **`native-git-backend.js`** — depends on Node builtins, `@endo/errors`, `@endo/exo`, `@endo/platform`, `./reader-ref.js`.
   Resolve the `reader-ref.js` cut first (see § Dependency Cuts) by moving `reader-ref.js` to `@endo/endo-fs`.
3. **`git-filesystem.js`** — depends on `@endo/errors`, `./git.js` (for typedefs only), `@endo/endo-fs/src/backend-types.js`.
   Move; the `./git.js` typedef import becomes `from '../git.js'` (same package, sibling file).
4. **`git.js`** — depends on `@endo/errors`, `@endo/eventual-send`, `@endo/exo`, `@endo/endo-fs`, `./git-filesystem.js`, `./interfaces.js`, `./mount.js` (the `lineageOf` cut).
   Resolve the `lineageOf` cut first by adding it as a `makeGit` power; daemon binds at call site.
   Move.
5. **`git-remote.js`** — depends on `node:url`, `@endo/errors`, `@endo/exo`, `@endo/eventual-send`, `./interfaces.js`, `./git.js`, `./git-credential.js`.
   All deps now resolved.
   Move.

After each step: `yarn lint`, `yarn format`, `yarn test` in both `packages/endo-git` and `packages/daemon`.

### Phase 3: Move the interface guards and typedefs

- Move the six git-only interface constants from `daemon/src/interfaces.js` to `endo-git/src/interfaces.js`.
- Daemon's `interfaces.js` re-exports them for any daemon-internal consumer that still needs them by name from the daemon path.
- Move the git typedefs (`EndoGit`, `GitRef`, `GitBackend`, etc.) from `daemon/src/types.d.ts` to `endo-git/src/types.js` (a JSDoc-only typedef host) and `endo-git/types.d.ts` (the package's emitted `.d.ts`).
- Daemon's `types.d.ts` keeps the formula-shape typedefs (`GitFormula`, `GitCredentialFormula`, `GitRemoteFormula`) because those describe daemon-internal formula registry shapes.

### Phase 4: Sweep call sites in the daemon

- `daemon.js`: change `import { makeGit } from './git.js'` to `from '@endo/endo-git'`; same for `makeNativeGitBackend`, `makeGitRemote`, `makeGitCredentialController`.
- `host.js`: change `import { isGitReadOnly } from './git.js'` and the two `getGitXxxController` imports.
- Update every test file's import to `@endo/endo-git`.
- Verify the daemon's `package.json` has `@endo/endo-git` in `dependencies`.
- Verify no `from './git*.js'` import remains anywhere in `daemon/src/`.

### Phase 5: Add in-process unit tests in the new package

- `native-git-backend.test.js`: against a real `git init` temp dir, cover `resolveTree`, `lsTree`, `readBlobBytes` (incl. >1 MiB blobs to verify the `streamGitBuffer` path), `streamBlobBytes`, `MIN_GIT_VERSION` rejection, `assertNoExecutableRepoConfig` rejection.
- `git-filesystem.test.js`: against a hand-rolled fake `GitBackend` that returns canned trees and blobs, verify the `FsBackend` protocol (resolve, list, read range, stat, mutating-verb rejection, OID cache eviction on rejection, submodule hiding).
- `git-credential.test.js`: lifecycle of credential records, audience matching, revocation, `makeUnavailableGitCredential` shape.
- `git-remote.test.js` (in this package): policy filter unit tests (host allowlist, scheme allowlist, URL normalisation); integration tests stay in daemon.

### Phase 6: Emit / shim `.d.ts`

Two paths, decision deferred until Phase 1 surfaces the `tsc --build` behavior:

- **Path A (preferred): per-package tsc emission.**
  Add `tsconfig.build.json` and `prepack` / `postpack` lifecycle scripts matching the `packages/skel` convention.
  Will work if and only if the `endo-fs` and `patterns` `.d.ts` emission ordering is stable enough during `yarn workspaces foreach` to make `@endo/endo-git`'s `tsc --build` see its deps' `.d.ts` files.
  When we tried this for `endo-fs` we got bitten by tsc's negative-cache + postpack-cleanup interaction.
- **Path B (fallback): hand-written `types.d.ts` shim.**
  Same pattern as `endo-fs/types.d.ts` — `declare module '@endo/endo-git'` and one stanza per exported subpath.
  The git surface is large (~50 methods on `EndoGit` alone), so this is non-trivial — probably 200–300 LOC of declarations to write.

Try A first; fall back to B if the prepack cycle breaks.
Either way, the package ships with workable types from day one — no `any` leakage into daemon-side consumers.

### Phase 7: Cleanup

- Delete the daemon-side re-export shims left during Phase 2.
- Update `designs/README.md` with this design's row (Status: In Progress → Implemented once landed).
- Update `designs/daemon-git-capability.md` and `designs/daemon-git-remotes.md` Status sections to point at the new package home.
- Update `CLAUDE.md` if any of the path conventions change (e.g., the integration-test command if `git.test.js` paths change).

## Risks and Open Questions

1. **`.d.ts` emission may force the shim path.**
   Same gotcha as `endo-fs`: if `@endo/patterns` deletes its `.d.ts` during postpack before `@endo/endo-git` packs, tsc fails.
   Mitigation: ship the shim from day one and treat structural emission as a follow-up.
   Open question: would it be worth fixing the `endo-fs` shim problem first (e.g., switching `endo-fs`'s deps to a published-types policy) so the new package can ride that solution?

2. **`lineageOf` injection breaks the "library is silent / cap is the only surface" rule.**
   Passing a function-valued power into a factory is a recognised endo idiom but it's not strictly capability-shaped (a function isn't itself a cap).
   Alternative: hand `makeGit` an `Identity` cap whose only method is `recognise(suspect): boolean | undefined`.
   Open question — pick one shape before Phase 2 lands.

3. **Test surface duplication.**
   Once the in-process unit tests in `endo-git` cover the backend, the daemon-side `git.test.js` will have some redundant cases.
   Open question: keep them as belt-and-suspenders (the in-process and through-daemon paths exercise different lockdown contexts), or prune?
   Default: keep, prune on a later pass.

4. **Public-package vs. internal-package question.**
   Does `@endo/endo-git` get a `publishConfig.access = public` or is it `"private": true`?
   The daemon needs the package whether or not it's published; publishing would let downstream consumers depend on it directly.
   Recommended default: `"private": false` from day one — this is the kind of seam where external consumers benefit (anyone building an MCP-style git tool on top of endo would want it).

5. **Mount cap shape.**
   `makeGit({ mount, backend, readOnly })` takes a `mount` cap whose interface is defined by the daemon's `EndoMount`.
   The new package's `git.js` will need a JSDoc `@import` for that type.
   Easiest: `/** @import { EndoMount } from '@endo/daemon/src/types.d.ts' */` — but that introduces a type-only dependency on `@endo/daemon`, which is unusual.
   Alternative: define a structural `MountLike` interface inside `endo-git/src/types.js` that matches what `git.js` actually calls on `mount`, and let the daemon's `EndoMount` satisfy it structurally.
   Recommended: structural `MountLike`, keep the dep graph one-way.

## Migration Story

For the daemon, the change is mechanical: imports move from `./git*.js` to `@endo/endo-git`.

For anyone reading the daemon's source today and expecting `packages/daemon/src/git.js` to exist, the file disappears.
A one-paragraph note at the top of `packages/daemon/src/git.md` (a new readme stub) pointing at `@endo/endo-git` would catch most navigation cases.

Persistent state — the formula registry, the credential-record store — is unchanged.
An on-disk daemon-state directory provisioned against the pre-refactor daemon continues to load against the post-refactor daemon, no migration step required.

The public RPC surface (the methods reachable via CapTP from CLI, familiar, or any other client) is unchanged.

## Testing Plan

Each phase has its own gate:

- **Phase 1 (scaffold):** `yarn workspaces foreach -p run build` and `yarn lint` pass; no new cycles.
- **Phase 2 (move per file):** after each file moves, run `npx ava packages/daemon/test/git.test.js packages/daemon/test/git-remote.test.js --timeout=120s`; both pass.
- **Phase 3 (interfaces + typedefs):** `yarn docs` (the tsc-build pass) succeeds with no new type errors anywhere in the workspace.
- **Phase 4 (sweep call sites):** `git grep "from './git" packages/daemon/src/` is empty.
  The full `cd packages/daemon && npx ava` suite passes.
- **Phase 5 (new unit tests):** `cd packages/endo-git && npx ava` passes.
  Coverage goal: every method on `GitBackend` and every method on the `FsBackend` shape from `git-filesystem.js` has at least one positive and one error-path case.
- **Phase 6 (types):** `tsc --build` succeeds across the workspace; daemon-side IDEs see proper types when hovering `makeGit` and friends.
- **Phase 7 (cleanup):** the shim files are gone; `git grep -c "from '@endo/endo-git'" packages/daemon/src/` reports the expected import points (around 8–10 sites).

The CI matrix already runs `test-xs` and `test-node` — both should remain green for the daemon package; the new package gets its own job in the matrix.

## Alternatives Considered

### Alt 1: Move git into `@endo/endo-fs`

`@endo/endo-fs` already owns the `Filesystem` / `FsBackend` seam; one could imagine `endo-fs` growing a `git` subpath.

Rejected because the git surface is much larger than the FsBackend adapter — adding `EndoGit`, `EndoGitRemote`, `EndoGitCredential`, audit shape, and policy types into `endo-fs` would more than double its size, and most of that surface has nothing to do with filesystems.

### Alt 2: Split git into multiple packages

`@endo/endo-git-backend` (just the subprocess wrapper), `@endo/endo-git` (the EndoGit cap), `@endo/endo-git-remote` (the remote / credential surface).

Rejected as premature.
The three layers are tightly coupled today (remote uses git uses backend); splitting them adds workspace topology overhead without unlocking independent consumers.
Can be done as a follow-up if a real "I only want the backend" consumer materialises.

### Alt 3: Keep git in daemon; just expose more from `packages/daemon/src/index.js`

Make `packages/daemon` export `makeGit` etc. directly so consumers can `import { makeGit } from '@endo/daemon'`.

Rejected because `@endo/daemon` carries a lot of unrelated weight (the full daemon implementation) that a git-only consumer doesn't want; `@endo/daemon` also isn't safely importable from a non-daemon process (`@endo/init` lockdown, formula stores, etc.).

### Alt 4: Move git into a new internal-only package, never publish

`packages/endo-git/` with `"private": true`.

Rejected as a default but kept as a fallback if publishing turns out to be politically complicated.
The build / test / type-emission benefits accrue either way; publishing is the smaller of the two wins.

## Design Decisions

- **Package name `@endo/endo-git`.**
  Parallels `@endo/endo-fs`.
  The `endo-` prefix marks it as "the Endo-shaped version of this concept" (vs. a hypothetical general-purpose `@endo/git` library) — same convention as `@endo/endo-fs` vs. `@endo/fs`.
- **`reader-ref.js` moves to `@endo/endo-fs`.**
  It's not git-specific; both packages will use it; `endo-fs` is a natural home.
- **`lineageOf` is passed as a power, not moved.**
  The map provenance argument is decisive — wherever `makeMount` lives, the maps live.
- **Formula shapes stay in daemon.**
  `GitFormula`, `GitCredentialFormula`, `GitRemoteFormula` describe entries in the daemon-private formula registry; only the daemon constructs them.
- **`provideGit` / `provideGitRemote` stay in daemon.**
  Host vending is daemon-internal — those methods construct formulas, look up petnames, and consult the daemon's permission model.
- **Tests split: integration tests stay in daemon, unit tests move.**
  `forks a daemon` ⇒ daemon test; `runs in-process` ⇒ new package test.
- **`types.d.ts` shim, fall back later to tsc emission.**
  Smaller change footprint per phase; doesn't introduce a new failure mode (we already proved the shim works for `endo-fs`).

## Prompt

> on a new branch off of latest llm, plan a refactor moving git into its own package

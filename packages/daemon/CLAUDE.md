# Daemon Development Guide

## Formula Lifecycle

### Disk before graph

Formula JSON must be persisted to disk **before** the formula ID enters the in-memory `formulaForId` map or dependency graph. Otherwise, if evaluation fails, retries and reincarnation find the ID but no backing JSON file on disk (`No reference exists at path ...`).

The safe pattern (see `formulateNumberedHandle`):

```js
// 1. Write to disk first
await persistencePowers.writeFormula(formulaNumber, formula);
// 2. Then add to in-memory graph
await withFormulaGraphLock(async () => {
  formulaForId.set(id, formula);
  formulaGraph.onFormulaAdded(id, formula);
});
```

### Formula types and their dependencies

`provideGuest` creates a chain of dependent formulas: handle, mailbox-store, mail-hub, keypair, pet-store, worker, guest. Each must be fully persisted before the next depends on it.

### Special names

`@agent`, `@self`, `@host`, `@keypair`, `@mail` are reserved `@`-prefixed names managed by `makePetSitter` in `guest.js`. They match the pattern `/^@[a-z][a-z0-9-]{0,127}$/` (see `isSpecialName` in `src/pet-name.js`). The daemon exports `src/pet-name.js` as `@endo/daemon/pet-name.js`.

## Guest Provisioning

### introducedNames

`introducedNames` maps `{ parentName: childName }` where `parentName` is resolved in the host's namespace and `childName` is written into the guest's namespace. The `childName` must be a valid **pet name** (lowercase, matching `/^[a-z0-9][a-z0-9-]{0,127}$/`), not a special name.

### Handle vs Guest

`lookup(petName)` where the pet name was written to a `handleId` returns a **Handle** (only has `open`, `receive`). To get the full `EndoGuest` (with `makeDirectory`, `list`, `send`, etc.), use the return value of `provideGuest()`.

### provideGuest idempotency

On restart, calling `provideGuest` with `introducedNames` on an already-existing guest fails because the reincarnated handle formula lacks `write`. Guard with `E(agent).has(name)` before calling `provideGuest`.

## Message Protocol

### Message types

- `type: 'package'` messages work with `adopt()`.
- `type: 'value'` messages (created by form submissions via `submit()`) have a `valueId`. Use `E(powers).lookup(msg.valueId)` to resolve the value — `adopt()` will throw `"Message must be a package"`.

### Form flow

A guest sends a form to HOST via `E(powers).form('HOST', title, fields)`.
The host user submits via `E(agent).submit(messageNumber, values)`,
which creates a `type: 'value'` message in the guest's inbox with
`replyTo` pointing to the form's `messageId`.

### Resolve and reject

Messages have different shapes per type.
Code that resolves or rejects must branch on `message.type` before
accessing type-specific fields:

- `request` messages have a `resolverId` field —
  a persisted formula identifier.
  Look up the resolver via `provide()`.
- `definition` messages cannot be rejected or resolved.

## Storage Concepts

### ReadableTree

Immutable, content-addressed snapshot created by `checkin`.
Has `has()`, `list()`, `lookup()` methods.
Formula type: `readable-tree`.

### Mount

Live, mutable daemon-side filesystem access created by
`provideMount(path, petName, opts)`.
Implemented in `src/mount.js`.
Methods: `has`, `list`, `lookup`, `readText`, `maybeReadText`,
`writeText`, `remove`, `move`,
`makeDirectory`, `readOnly`, `snapshot`, `help`.
Path arguments accept `string | string[]` (a single name or
an array of path segments).

### ScratchMount

Daemon-managed scratch directory via
`provideScratchMount(petName)`.
Same interface as Mount but the filesystem path is managed by the
daemon rather than supplied by the user.

## Gateway

The gateway (`src/daemon.js` line ~851) rejects requests for non-local node IDs with `"Gateway can only provide local values"`. After a daemon restart, the node number changes, so any client holding a stale formula ID from a previous session will hit this error.

## Merge Policy

Never use `--ours` or `--theirs` strategies when merging. All conflicts must be resolved manually by understanding both sides of the change.

## Exo and Interface Authoring

### `M.interface()` rest patterns take a per-element shape

`M.call(...).rest(shape)` repeats `shape` for every element of the rest
arguments; it does **not** take an array-of-element-shape.

```js
// Good — rest of strings:
foo: M.call(M.string()).rest(M.string()).returns(M.promise()),

// Wrong — describes a call whose rest is a single array argument:
foo: M.call(M.string()).rest(M.arrayOf(M.string())).returns(M.promise()),
```

Mixing these up silently accepts or rejects the wrong call shapes and
is a recurring review finding on the mount and host facets.

### Keep exported facet `.d.ts` interfaces in sync

When adding a method to an exo (e.g. `EndoHost`, `EndoGuest`,
`EndoMount`), add the method to both the runtime `M.interface(...)`
guard and the exported TypeScript interface in `src/types.d.ts`.
TypeDoc and downstream type consumers fail silently if a method exists
at runtime but not in the exported interface.

## Diagnostic Discipline in Formulas

- Formula implementations must be silent by default on the happy path.
  Diagnostic logging belongs in the lifecycle log (see
  [DEBUGGING.md](./DEBUGGING.md)), not in ad-hoc `console.log` calls.
- Use `console.error` for unexpected conditions so output lands on
  stderr and doesn't interleave with a caller's stdout or a test
  harness's output parsing.
- Prefer structured results for partial/corrupted data
  (`{ value, broken, brokenAt }` + a single `console.warn`) over
  silent truncation.
  Silent truncation is a repeat review finding.

## CapTP Error Surface

- Errors that cross a CapTP connection between the daemon and a
  worker formula arrive annotated with an `errorId` minted by
  `@endo/marshal`.
  That id is the correlation key for the worker-trace facility; see
  [`docs/error-tracing-design.md`](../../docs/error-tracing-design.md).
- When a formula propagates an error up the CapTP chain, keep the
  `errorId` annotation intact so the aggregator can stitch together
  the originating worker's stack and the caller's view.

## Debugging

See [DEBUGGING.md](./DEBUGGING.md) for environment variables, log interpretation, and common debugging recipes.

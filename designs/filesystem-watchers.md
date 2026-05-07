# Filesystem Watchers for EndoMount

| | |
|---|---|
| **Created** | 2026-05-07 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Source** | Issue #110 |

## What is the Problem Being Solved?

`EndoDirectory` exposes two subscription methods that let callers observe
its contents over time rather than poll:

- `followNameChanges(...petNamePath): AsyncGenerator<PetStoreNameChange>`
  yields the existing names in alphabetical order, then yields
  `{ add: name, value: idRecord }` and `{ remove: name }` records as
  bindings appear and disappear.
- `followLocatorNameChanges(locator): AsyncGenerator<LocatorNameChange>`
  yields the existing pet-name bindings of a single locator, then diffs
  as that locator gains or loses names.

Both stream a snapshot followed by a diff over a `pubsub` topic
(`packages/daemon/src/pubsub.js`).  Hubs derived from `EndoDirectory`
inherit this contract via `NameHubInterface` (`interfaces.js`).

`EndoMount` is the new name hub that backs scratch and external mount
points (`packages/daemon/src/mount.js`, `MountInterface` in
`interfaces.js`).  Its read surface (`has`, `list`, `lookup`,
`readText`, `maybeReadText`) is a `ReadableTree`-compatible
look-alike, but it has **no follow method**.  Callers that want to
observe file additions or removals must poll `list()` and diff.

The issue is two-fold:

1. **Surface parity.**  Code that consumes a `NameHub` for live updates
   (`chat-spaces-gutter`, the inventory view, the `endo log` follower)
   cannot be retargeted at an `EndoMount` because the method is
   absent.  Hub abstractions that pick between a directory and a mount
   based on what the user has bound at a name path break down at the
   subscription edge.
2. **Mechanism parity.**  Even where polling is acceptable, every
   consumer reinvents debounce, ordering, and disposal.  A central
   adapter from `node:fs` watcher events to `pubsub` would let callers
   share one code path with `EndoDirectory` consumers.

The fix is to give `EndoMount` a `followNameChanges` method that emits
records compatible with the `NameHub` shape, backed by `node:fs.watch`
on Node, and to leave a clean seam for non-Node platforms.

## Scope

This design covers:

- A new `followNameChanges(...pathSegments)` method on `EndoMount`,
  emitting a snapshot-then-diff stream of entries directly contained
  within the named subdirectory.
- The Node-side adapter that wires `node:fs.watch` (and
  `fs.watchFile` as a polling fallback) to a `pubsub` topic.
- Lifecycle: how watchers are created, multiplexed across subscribers,
  and disposed when the last subscriber returns.
- A new entry on `FilePowers` that exposes the watch primitive so the
  `EndoMount` body stays platform-agnostic.

Out of scope:

- Watching individual files via the transient `EndoMountFile` exo (a
  natural follow-on; called out under Open Questions).
- Recursive watch semantics across deep subtrees in a single
  subscription (called out under Open Questions; the proposal here is
  one watcher per subscribed subdirectory).
- Cross-peer or remote mount watchers.  An `EndoMount` is local to its
  daemon; remote consumers see the watcher stream over CapTP via
  `makeIteratorRef`, which is the same shape `EndoDirectory` already
  uses.

## Current Shape

### `EndoDirectory.followNameChanges`

`packages/daemon/src/directory.js`:

```js
const followNameChanges = async function* followNameChanges(...petNamePath) {
  assertNames(petNamePath);
  if (petNamePath.length === 0) {
    yield* controller.followNameChanges();
    return;
  }
  const hub = /** @type {NameHub} */ (await lookup(petNamePath));
  yield* await E(hub).followNameChanges();
};
```

The exo wrapper publishes the iterator via
`makeIteratorRef(directory.followNameChanges())` so a remote subscriber
receives an `AsyncIteratorInterface` reference.

The pet-store implementation
(`packages/daemon/src/pet-store.js`) is the canonical pattern:

```js
const followNameChanges = async function* currentAndSubsequentNames() {
  const subscription = nameChangesTopic.subscribe();
  for (const name of idsToPetNames.getAll().sort()) {
    yield { add: name, value: parseId(idsToPetNames.getKey(name)) };
  }
  yield* subscription;
};
```

The topic is a `makeChangeTopic` from `pubsub.js`.  Subscribers join
the live stream after their snapshot completes.

### `EndoMount`

`packages/daemon/src/mount.js` returns the `EndoMount` exo with
`MountInterface` (`packages/daemon/src/interfaces.js`):

```js
export const MountInterface = M.interface('EndoMount', {
  has: M.call().rest(PathSegmentsShape).returns(M.promise()),
  list: M.call().rest(PathSegmentsShape).returns(M.promise()),
  lookup: M.call(PathArgShape).returns(M.promise()),
  // … readText / writeText / move / makeDirectory / readOnly / snapshot
});
```

There is no `followNameChanges`.  `list()` returns a sorted snapshot
read from `filePowers.readDirectory` and filtered through the
confinement check.

### `FilePowers`

`packages/daemon/src/types.d.ts`:

```ts
export type FilePowers = {
  makeFileReader: (path: string) => Reader<Uint8Array>;
  makeFileWriter: (path: string) => Writer<Uint8Array>;
  writeFileText: (path: string, text: string) => Promise<void>;
  readFileText: (path: string) => Promise<string>;
  // … readDirectory, makePath, joinPath, removePath, renamePath,
  //   realPath, isDirectory, exists
};
```

There is no watcher primitive.  The Node implementation lives in
`packages/daemon/src/daemon-node-powers.js`.

## Design

### New method on `EndoMount`

```ts
followNameChanges(
  ...pathSegments: string[]
): AsyncGenerator<MountNameChange, undefined, undefined>;

type MountNameChange =
  | { add: string; type: MountEntryType }
  | { remove: string };

type MountEntryType = 'file' | 'directory';
```

The shape mirrors `PetStoreNameChange` but replaces `value: IdRecord`
with `type: 'file' | 'directory'`.  An `EndoMount` does not have
formula identifiers to publish (file contents are not capabilities),
so the second field carries the `stat`-derived kind instead, which is
the information a consumer needs to decide whether to recurse.

The exo surface returns an `AsyncIteratorInterface` reference via
`makeIteratorRef`, exactly like `EndoDirectory`.

Method-guard addition to `MountInterface`:

```js
followNameChanges: M.call().rest(PathSegmentsShape).returns(M.remotable()),
```

### Backing implementation

Add one entry to `FilePowers`:

```ts
watchDirectory: (path: string) => {
  events: AsyncIterable<{ kind: 'add' | 'remove' | 'replace'; name: string }>;
  cancel: () => void;
};
```

The Node implementation in `daemon-node-powers.js` wraps
`fs.watch(path, { persistent: false })`:

- On every `'rename'` event for a child, `stat` the child path:
  - if it now exists and was not previously known: emit
    `{ kind: 'add', name }`.
  - if it does not exist and was previously known: emit
    `{ kind: 'remove', name }`.
- On `'change'` events, ignore (a name-change subscription does not
  surface mutations to file contents; that is what `EndoMountFile`
  would carry, and is out of scope).
- Coalesce events with a short debounce window (default 50 ms) so
  editor "save dance" patterns (write-tmp + rename) deliver one
  `replace` per filename rather than a remove/add pair.  Coalescing
  is bookkeeping over the in-memory entry set, not a timer per
  event.

The `EndoMount` body lifts the snapshot-then-diff structure from
`pet-store.js`:

```js
async function* followNameChanges(...pathSegments) {
  const target = resolve(pathSegments);
  await assertConfined(target, confinementRoot, filePowers);

  const watcher = filePowers.watchDirectory(target);
  try {
    const snapshotSet = new Set();
    const snapshot = await filePowers.readDirectory(target);
    for (const name of snapshot.sort()) {
      const childPath = filePowers.joinPath(target, name);
      // eslint-disable-next-line no-await-in-loop
      const isDir = await filePowers.isDirectory(childPath);
      // eslint-disable-next-line no-await-in-loop
      if (await isConfinedPath(childPath, confinementRoot, filePowers)) {
        snapshotSet.add(name);
        yield { add: name, type: isDir ? 'directory' : 'file' };
      }
    }

    for await (const event of watcher.events) {
      const childPath = filePowers.joinPath(target, event.name);
      // eslint-disable-next-line no-await-in-loop
      const present = await filePowers.exists(childPath);
      if (present && !snapshotSet.has(event.name)) {
        // eslint-disable-next-line no-await-in-loop
        const isDir = await filePowers.isDirectory(childPath);
        // eslint-disable-next-line no-await-in-loop
        if (await isConfinedPath(childPath, confinementRoot, filePowers)) {
          snapshotSet.add(event.name);
          yield { add: event.name, type: isDir ? 'directory' : 'file' };
        }
      } else if (!present && snapshotSet.has(event.name)) {
        snapshotSet.delete(event.name);
        yield { remove: event.name };
      }
    }
  } finally {
    watcher.cancel();
  }
}
```

The `try / finally` is load-bearing: when the consumer calls
`return()` on the iterator (the standard `for await … of` cleanup
path, and what `makeIteratorRef` triggers when the remote
subscription is dropped), `finally` releases the OS-level watcher
handle.

### Multiplexing

Each `followNameChanges(...pathSegments)` call opens its own
`watchDirectory` handle.  Multiplexing across many concurrent
subscribers to the same subdirectory is a worthwhile follow-up but
not load-bearing for parity: even unmultiplexed, `fs.watch`
allocates one inotify watch per directory (Linux), one
`FSEventStream` (macOS), or one `ReadDirectoryChangesW` overlapped
I/O (Windows).  These are cheap.

If the multiplexing becomes a hotspot (a Familiar window with many
panels watching the same scratch mount), a follow-up can wrap the
`FilePowers.watchDirectory` call in a per-path `pubsub` topic that
fans out to subscribers, mirroring the `petStore` topic pattern.
Open Question: do we land that fan-out in the first cut, or wait
for evidence?

### Lifecycle

1. **Create.**  A consumer calls `E(mount).followNameChanges(...path)`.
   The exo returns an `AsyncIteratorInterface` reference produced by
   `makeIteratorRef`.
2. **Snapshot.**  The first batch of `next()` calls yield the current
   directory entries.  Confinement filtering applies to each entry,
   so a symlink that escapes the mount root is omitted from the
   snapshot just as it is from `list()`.
3. **Live.**  After the snapshot, `next()` blocks until
   `fs.watch` reports a `rename` event for an entry.  The handler
   reconciles by `stat`-ing the child and emitting the diff record.
4. **Cancel.**  The consumer drops the iterator (returns or throws).
   `makeIteratorRef` invokes the iterator's `return()`, which runs
   the `finally` block and releases the watcher handle.

### Confinement

The `EndoMount` confinement model carries through unchanged:

- The watched path is resolved with `resolveSegments` and validated
  with `assertConfined` before the watcher is opened.  A path that
  escapes the mount root cannot be subscribed to.
- Each emitted name passes through the same `isConfinedPath` filter
  used by `list()`.  Symlinks added at runtime that point outside
  the root are silently dropped from the stream.
- The watcher path itself does not change after creation.  A
  subscriber to `mount/foo` who calls `await
  E(mount).move('foo', 'bar')` keeps watching the moved-out
  directory; the receiver of the new name path opens its own
  watcher.  This matches `EndoDirectory` semantics, where a
  subscription to `petName` survives the rename of `petName`.

### Read-only mounts

A read-only attenuation (`mount.readOnly()`) inherits
`followNameChanges`.  Subscribers are read operations and are safe.

## Alternatives Considered

### Polling diff

A simpler implementation calls `setInterval` on `readDirectory`,
diffs against a remembered snapshot, and emits the differences.

- Pro: zero platform-specific code; portable to environments where
  `fs.watch` is unavailable.
- Con: latency floor at the polling interval, CPU and disk cost
  proportional to fan-out, no benefit from kernel-level
  notifications.

This is the right fallback inside `FilePowers` when the platform
adapter cannot open a native watcher (e.g. some network filesystems
on Linux where inotify fires inconsistently), and the interface
`watchDirectory` returns is shaped to allow a polling implementation
without changing the `EndoMount` body.

### `chokidar`

The `chokidar` package abstracts `fs.watch`, `FSEvents`, and a
polling fallback into one library, with battle-tested glob matching
and rename-tracking heuristics.

- Pro: a single dependency that handles many edge cases the
  hand-rolled wrapper would re-discover.
- Con: a 50 KB+ dependency for a daemon that takes pride in a thin
  surface; pulls in `anymatch`, `braces`, and a graph of
  micromatch utilities.  Most of `chokidar`'s value is in glob
  matching, which `EndoMount` does not need (paths are name lists,
  not patterns).

The recommendation is to start without `chokidar` and revisit if
the hand-rolled wrapper accumulates platform-specific bug fixes.

### `inotify` / `kqueue` direct bindings

A native-binding wrapper around the OS primitives directly.

- Pro: avoids `fs.watch`'s well-known cross-platform inconsistencies
  (filename truncation on Linux when the path is in a non-UTF-8
  locale; missing event coalescing on macOS).
- Con: a native dependency in the daemon distribution.  Familiar's
  bundled-agents posture treats native modules as a last resort.

Defer.  Forward-looking note: a Rust implementation of the daemon or
worker is the most plausible future home for direct OS-binding
watchers.  A Rust port already needs platform-specific I/O bindings,
so the marginal cost of a native watcher there is low compared with
the Node-side cost of shipping a native module.  Track this on the
Rust-port roadmap rather than within this design.

### `fs.watchFile`

`fs.watchFile` polls `stat` on a single path at an interval and
reports changes by comparing returned `Stats` objects.

- Pro: works on filesystems where `fs.watch` does not.
- Con: per-path polling does not extend to "the set of children of
  this directory" without an extra `readdir` step that defeats the
  purpose; high CPU cost at fan-out.

Use as a per-entry fallback inside the polling implementation of
`FilePowers.watchDirectory` if needed.

## Test Plan

Add to `packages/daemon/test/endo.test.js` alongside the existing
twenty mount tests:

1. **Snapshot.**  A scratch mount with three pre-existing files.
   Subscribe with `followNameChanges()`.  Assert the first three
   `next()` results are `{ add: name, type: 'file' }` in
   alphabetical order.
2. **Live add.**  After the snapshot drains, write a new file
   directly to the backing path with `fs.promises.writeFile`.
   Assert `next()` returns `{ add: 'new.txt', type: 'file' }`.
3. **Live remove.**  After (2), delete the file directly with
   `fs.promises.unlink`.  Assert `next()` returns
   `{ remove: 'new.txt' }`.
4. **Subdirectory.**  A scratch mount with a subdirectory `sub`.
   Subscribe with `followNameChanges('sub')`.  Add a file inside
   `sub`.  Assert the diff is reported under the subdirectory's
   subscription, and a parallel `followNameChanges()` on the root
   does not see the inner file.
5. **External-mount parity.**  An external mount over a fresh
   `mkdtemp` directory.  Assert the same snapshot-then-diff
   behaviour.  This is the parity assertion: the `EndoDirectory`
   tests already exercise the same shape under `pet-store`.
6. **Confinement.**  Create a symlink in the watched directory that
   points outside the mount root.  Assert the symlink is omitted
   from the snapshot and from any subsequent diff event.
7. **Disposal.**  Subscribe, drain a few entries, call `return()`
   on the iterator.  Assert that subsequent `fs.promises.writeFile`
   calls into the directory do not produce events (the watcher is
   released).  A regression for this is hard to assert directly
   without inspecting OS handles; use `t.timeout(2000)` and a
   bounded "expect zero events" probe.
8. **Daemon restart.**  A scratch mount with a live subscriber, the
   daemon restarts, the subscriber retries and re-subscribes.
   Assert the new subscription's snapshot reflects post-restart
   reality.  This is a weaker contract than `EndoDirectory`'s
   snapshot-on-reconnect, because the watcher is process-local and
   intentionally does not survive restart; the test pins the
   intended behaviour.

All tests are `test.serial` per existing daemon-test convention.

## Design Decisions

The following questions were raised during initial drafting and
resolved in maintainer review on 2026-05-07.  They are captured here
for traceability rather than relitigation.

1. **Fan-out multiplexing.**  Decision: one watcher per subscriber
   in the first cut.  Rationale: simple, sufficient for current
   fan-out; revisit only if profiling shows pressure.  An adapter
   that fans out one watcher's events to many subscribers is a
   future optimization.
2. **Recursive subscriptions.**  Decision: shallow only, matching
   `EndoDirectory`.  `followNameChanges(...path)` emits only the
   immediate children of the named subdirectory.  Rationale:
   shallow is the parity contract; a reactive, recursive subscriber
   can be built from these primitives in user-space without
   widening the `EndoMount` surface.
3. **File-content changes.**  Decision: parity-first.  The diff
   stream emits only `add` and `remove` records, matching
   `EndoDirectory`.  A `replace` arm (or a separate
   `followContentChanges` on `EndoMountFile`) is deferred.
   Rationale: when content-change semantics arrive, they should
   land uniformly across name hubs rather than land on `EndoMount`
   first and diverge.
4. **Coalescing window.**  Decision: a hard-coded 50 ms debounce
   constant.  Rationale: tuning is premature; promote to an option
   only if a real consumer needs it.
5. **Polling fallback default.**  Decision: silent fallback when
   `fs.watch` is unavailable or unreliable on the host filesystem.
   The fallback emits a `console.error` diagnostic on activation,
   matching the project's "silent by default with `console.error`
   for diagnostics" posture.

## Open Questions

1. **`NameHub` interface unification.**  Should `EndoMount` adopt
   the broader `NameHubInterface` (which includes `identify`,
   `locate`, `reverseLocate`, etc.) so the same hub-walking code
   in `chat-spaces-gutter` works against both?  This is a larger
   refactor than the watcher addition and crosses into mount
   identity semantics.  This design stays focused on parity for
   `followNameChanges`.  A sibling design has been dispatched to
   address hub-interface unification on its own; cross-link here
   once that design lands.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [daemon-mount](daemon-mount.md) | Defines `EndoMount`; this design adds one method. |
| [platform-fs](platform-fs.md) | Owns `FilePowers`; adds `watchDirectory`. |
| [daemon-content-store-gc](daemon-content-store-gc.md) | Cleans up scratch mount backing directories at GC time; the watcher's `finally` release is the runtime-side cleanup. |

## Prompt

> EndoDirectory in packages/daemon currently supports a method or
> methods for watching changes on that directory. These are not
> implemented by EndoMount for scratch/temporary mounts or external
> mount points, but could be in terms of Node.js fs watchers. Please
> propose a design that brings this dimension into parity between
> these name hubs.

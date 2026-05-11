# Daemon Content Store Garbage Collection

| | |
|---|---|
| **Created** | 2026-03-20 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The daemon's content-addressed store (`{statePath}/store-sha256/`) grows
monotonically.  Files are written when `readable-blob` and
`readable-tree` formulas are created, but **never pruned** when those
formulas are garbage-collected.  The formula GC pass deletes formula JSON
from `/formulas/` but does not consult the `content` hash field to
determine whether the corresponding file in `/store-sha256/` is still
referenced by any living formula.

The same problem extends to scratch-mount backing directories
(`{statePath}/mounts/{formulaNumber}`), which persist after their
`scratch-mount` formula is collected.

Without content-store GC, long-running daemons accumulate orphaned
content files and mount directories indefinitely.

## Scope

This design covers cleanup of **daemon-local storage** that is associated
with formulas but lives outside the formula JSON files themselves:

1. **Content-addressed blobs** — files in `{statePath}/store-sha256/`
   referenced by `readable-blob` and `readable-tree` formulas via their
   `content` field (a SHA-256 hash).
2. **Scratch-mount backing directories** — directories at
   `{statePath}/mounts/{formulaNumber}` owned by `scratch-mount`
   formulas.

Cross-peer GC (synced pet stores, remote formula references) is covered
by [daemon-cross-peer-gc](daemon-cross-peer-gc.md) and is out of scope
here.

## Current State

### Content store

`makeContentStore()` in `daemon-node-powers.js` exposes three methods:
`store()`, `fetch()`, `has()`.  There is no `remove()`, no retention
tracking, and no integration with the formula GC pass.

### Formula GC

`collectIfDirty()` in `daemon.js` runs a mark-and-sweep over formulas.
When collecting a formula, it:

- Cancels the controller
- Drops live values and CapTP retainers
- Deletes the formula JSON file
- Deletes pet-store/mailbox-store/known-peers-store directories

It does **not** handle content-store files or scratch-mount directories.

### Reference counting problem

Multiple formulas can reference the same SHA-256 hash (content
deduplication).  A simple "delete content when formula is collected"
strategy would break if two `readable-blob` formulas share the same
content hash and only one is collected.

## Design

### Content-store cleanup: reference counting at collection time

During the GC sweep, after identifying the set of formulas to collect:

1. **Scan collected formulas** for `readable-blob` and `readable-tree`
   types.  Collect their `content` hashes into a candidate set.
2. **Scan surviving formulas** for any that reference the same hashes.
   Remove those hashes from the candidate set.
3. **Delete orphaned content files** — for each hash remaining in the
   candidate set, remove `{statePath}/store-sha256/{hash}`.

This is a sweep-time reference count, not a persistent counter.  It
avoids the complexity of maintaining a durable refcount table and is
consistent with the existing mark-and-sweep approach.

### Scratch-mount cleanup: directory removal at collection time

When collecting a `scratch-mount` formula:

1. Extract the formula number from the formula identifier.
2. Remove the backing directory:
   `rm -rf {statePath}/mounts/{formulaNumber}`.

This is simpler than content-store cleanup because scratch-mount
directories have a 1:1 relationship with their formula (no sharing).

### Integration point

Both cleanup steps hook into the existing `collectIfDirty()` function
in `daemon.js`, after the formula JSON is deleted and before the
collection pass completes.  The content-store sweep runs once per GC
pass (not per formula), operating on the batch of collected formulas.

### Content store API extension

Add a `remove(hash)` method to the content store interface:

```js
const remove = async hash => {
  const storePath = filePowers.joinPath(storeDirectoryPath, hash);
  await fs.promises.unlink(storePath);
};
```

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-mount](daemon-mount.md) | Scratch-mount directory cleanup is defined here |
| [daemon-cross-peer-gc](daemon-cross-peer-gc.md) | Orthogonal — that design covers cross-peer formula GC; this covers local storage cleanup |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) | `endo checkin` creates `readable-tree` formulas that reference the content store |

## Prompt

> Extract content-addressed store and scratch-mount directory garbage
> collection into a standalone design.  The content store
> (`store-sha256/`) has no cleanup mechanism — files accumulate when
> `readable-blob` and `readable-tree` formulas are collected.
> Scratch-mount directories (`mounts/{formulaNumber}`) similarly persist
> after formula GC.  Design a sweep-time reference-counting approach
> integrated into the existing `collectIfDirty()` pass.

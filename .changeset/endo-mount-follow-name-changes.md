---
'@endo/daemon': minor
---

`EndoMount.followNameChanges(...pathSegments)` brings the live-update
surface that `EndoDirectory` and `EndoPetStore` already expose to the
filesystem-backed name hub.  The method yields a snapshot of the
named subdirectory's immediate children in alphabetical order as
`{ add: name, type: 'file' | 'directory' }` records, then yields
`{ add, type }` and `{ remove }` diffs as entries appear and
disappear.  The implementation is backed by a new `watchDirectory`
entry on `FilePowers` that wraps `node:fs.watch` with a 50 ms
coalescing window; the consumer reconciles each event against its
own snapshot set so the watcher layer does not need to track state.

The watcher is per-subscriber (one `fs.watch` per
`followNameChanges` call); a `try / finally` releases the OS-level
handle when the consumer drops the iterator, including the path
`makeIteratorRef` takes when a remote subscription closes.
Confinement filtering matches `list()`: symlinks escaping the mount
root are omitted from both the snapshot and the live stream.

A future cross-interface unification (adopting the broader
`NameHubInterface` on `EndoMount`) is tracked separately under the
hub-interface design.

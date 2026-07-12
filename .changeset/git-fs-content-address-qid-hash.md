---
'@endo/platform': minor
'@endo/exo-git': minor
---

Restore content-address identity to `Git.filesystemAt(ref)`. `wrapBackend` now probes two optional `FsBackend` content-address hooks: `qidFor(path, kind)` sources a node's QID `pathId` from a backend-supplied identity, and `blobInfoFor(path)` sources a `BlobRef`'s `{ algorithm, hash }`. Both fall back to the path-hash `synthQid` / SHA-256-over-bytes defaults when a backend omits the hook (or returns `undefined` for a path), so existing backings are unaffected. The git-tree backend (`@endo/exo-git`'s `makeGitFsBackend`) supplies both: a node's QID `pathId` is the git object OID and a `BlobRef` reports `algorithm: 'git-sha1'` with the git blob OID as its hash. Two paths — or two refs — that resolve to the same blob therefore report the same QID and the same `BlobRef` hash again, and a directory listing entry's `qid` matches the one a later `lookup(name).getQid()` returns.

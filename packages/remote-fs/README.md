# @endo/remote-fs

Pipelinable, stream-friendly filesystem capabilities for Endo.

> **Status — Design only.** This package is a design document plus
> a placeholder `package.json`. No interfaces, factories, or tests
> have been written yet. See `DESIGN.md` for the proposed shape; the
> conversation that produced it is preserved verbatim in §10.

## Why a new FS surface

`@endo/daemon` already exposes `Mount` and `ReadableTree` — adequate
for local consumers, but every directory traversal across a CapTP
boundary costs one round trip per path segment, every file read
shuttles bytes through `text()` or `streamBase64()` without typed
ranges, and there is no way to advertise "this file's content is
already cached locally; don't fetch it over the network."

`@endo/remote-fs` is the proposal for a richer filesystem capability
designed around those costs:

- **Pipelinable lookup**: `Directory.lookup(name)` returns a
  subtype-correct cap (`File` / `Directory` / `Symlink`) whose qid is
  eagerly carried, so the resolved promise can be `open()`-ed without
  waiting for a host-side round trip.
- **Stream-shaped bulk I/O**: byte payloads ride
  `@endo/exo-stream` readers and writers, not method-sized chunks.
- **Optional content-addressed `BlobRef`s**: clients holding a CAS
  cache can skip the network entirely for cold reads.
- **Subscriptions**, **xattrs**, and **locks** as first-class
  capabilities, not as RPC verbs.

The 9P translation rules that motivated some of these choices live
in `@endo/claude-container` (a 9P-over-virtio-serial server that
consumes the FS capability as its backing store). They are not part
of this package.

## Layout

```
packages/remote-fs/
├── DESIGN.md      ← the full design, the only authoritative artefact today
├── README.md      ← this file
└── package.json
```

Everything else — interface guards, factories, node-fs powers,
tests — is roadmap (see `DESIGN.md` §8).

## Relation to existing Endo work

| Subject | Where today | What this package adds |
|---|---|---|
| Live FS capability | `@endo/daemon` `Mount` | Typed `Directory`/`File`/`Symlink` subtypes; eager qid; explicit `open()` ↔ `OpenFile`/`OpenDirectory` split |
| Immutable snapshot | `@endo/daemon` `ReadableTree` | `Node.snapshot() → BlobRef` for content-addressed sub-trees |
| Byte streaming over CapTP | `@endo/exo-stream` `PassableBytesReader`/`Writer` | Consumes; doesn't replace |
| 9P-over-virtio-serial bridge | `@endo/claude-container` `src/9p/`, `src/fs-bridge-9p.js` | This package targets that bridge's *backing store* — the FS capability the bridge proxies into the guest |

See `DESIGN.md` §3 ("Position in the Endo ecosystem") for the
detailed comparison.

# Endo App Sharing and Cloning

| | |
|---|---|
| **Created** | 2026-06-01 |
| **Updated** | 2026-06-01 |
| **Author** | Aaron (prompted) |
| **Status** | Proposed |

## What is the Problem Being Solved?

A user should be able to build a small runnable "app", hand it to a peer, and
have the peer **run it** — either as a live reference into the author's daemon
or, when the app is marked **cloneable**, as their own independent copy that
keeps working after the author goes offline or garbage-collects the original.

An Endo "app" in this design is the composition the substrate already
supports:

- an **endo-fs source** — a project tree (a compartment-mapper layout:
  `compartment-map.json` plus modules) exposed as an `@endo/endo-fs`
  `Filesystem` capability, and
- **endo-fs-exec** — the `@endo/endo-fs-exec` `tree-view-module.js` adapter
  that presents that tree to the daemon's `make-from-tree` formula, whose root
  program exports `make(powers, context, { env }) => exo`. That `exo` is the
  running app.

What is missing is everything around *transfer*:

1. **An app handle worth sharing.** A single named thing that bundles
   `{ source tree, exec/run config, optional UI manifest }`, rather than the
   user wiring `node-fs-module` → `tree-view-module` → `make-from-tree` by hand
   each time.
2. **Share as remote reference.** Hand a peer a capability to the *running*
   exo (or to the app handle) so they invoke it on the author's machine.
3. **Clone for independence.** When marked cloneable, materialise the source
   tree on the recipient's daemon as local `readable-tree` / `readable-blob`
   formulas so the recipient runs their own instance — no dependency on the
   author's liveness, and subject to the recipient's own powers.

## Background: what already exists

| Capability | Location | Status |
|---|---|---|
| `@endo/endo-fs` `Filesystem` caps (in-memory, node-fs, from-mount; `FsBackend` seam) | `packages/endo-fs`, [`endo-fs-backend-seam`](endo-fs-backend-seam.md) | Complete |
| `tree-view-module.js` adapting endo-fs → `make-from-tree` | `packages/endo-fs-exec/src/tree-view-module.js` | Complete |
| `make-from-tree` formula running a compartment-mapped program | `packages/daemon/src/daemon.js` (`makeFromTree`) | Complete |
| `readable-tree` / `readable-blob` formulas (transitively read-only, content-addressed) | `packages/daemon/src/daemon.js` | Complete |
| `endo checkin` / `endo checkout` (tree ⇄ filesystem, zip via `-z`) | `packages/cli/src/commands/`, [`daemon-checkin-checkout`](daemon-checkin-checkout.md) | Complete |
| In-memory zip-as-tree (`@endo/exo-zip`) | [`exo-zip-package`](exo-zip-package.md) | Proposed |

So reading a tree, running it, and serialising it to/from disk and zip all
exist. What does not exist is a **cross-daemon** "pull this remote tree into my
own store" operation, the app handle that ties source + exec together, or the
remote-ref-vs-clone choice exposed at share time.

## Design

### App handle

Introduce an **app** formula (or a thin named record) capturing:

```
{
  source:   <readable-tree | endo-fs Filesystem cap>,  // the program tree
  run:      { workerName, powers, env },               // make-from-tree inputs
  ui?:      <app UI manifest>,                          // see familiar-app-ui-hosting
  cloneable: boolean,                                   // may the recipient copy the source?
}
```

`cloneable` is the policy bit. It governs which of the two share modes below
the author is willing to offer.

### Share mode A — remote reference

The author shares a capability to the **app handle** (or directly to the
running `exo`). The recipient holds a remote reference; every invocation
crosses to the author's daemon over CapTP / OCapN-Noise. The source tree never
leaves the author. This is the default and works today for any formula —
the new work is only naming it as an "app" and surfacing a "share" affordance.

### Share mode B — clone

Available only when `cloneable` is true. The recipient performs a **clone**:

1. The author's side serialises the `source` tree as **one ordered stream of
   entries** — `(path, kind, content)` in depth-first order — and hands the
   recipient a single reader.
2. The recipient drains that one stream into a **fresh durable filesystem**
   under its own control (the durable backing is pluggable — see below).
3. Re-run `make-from-tree` against the *local* copy under the recipient's own
   `run` powers, producing an independent instance.

A new CLI verb (working name `endo clone <remote-app> --name <local-name>`)
and a Chat "Make my own copy" action drive mode B. The cloned app's powers are
the recipient's to grant — the clone does not inherit the author's
capabilities, only the author's *code*.

### Streaming clone: one tree-stream, not a pipelined walk

The clone transport is a **single `@endo/exo-stream` stream** whose items are
tree entries (path + node kind + file content), emitted depth-first by the
producer and consumed in order by the recipient. This is deliberately *not* a
client-driven pipelined walk (`lookup`/`snapshot`/`fetch` per node):

- **One round-trip class, not one-per-file.** The recipient opens the stream
  once and pulls; the producer pushes the whole tree. Pre-ack `buffer` on the
  exo-stream keeps the pipe full over a high-latency link. A thousand-file app
  is one stream, not a thousand request/response pairs.
- **The producer already holds the tree**, so it serialises locally and emits —
  no per-node capability hand-off to the recipient.
- **No content hashing on the path.** We trust the peer to send its own app and
  the secure transport ([ocapn-noise-network](ocapn-noise-network.md)) to
  deliver it intact. The clone does not compute or verify per-blob hashes; there
  is no CAS dedup step and no `BlobRef` round-trip in the clone path. (Integrity
  and peer-authenticity are the transport's job, established when the peer was
  added — see [familiar-deep-link-invitations](familiar-deep-link-invitations.md).)

Large files still stream as chunk frames within the single stream so no whole
file is buffered in memory; this reuses the chunking discipline `Layer.apply`
already follows (1-MiB ops) rather than method-sized buffers.

A natural realisation makes the **wire format and the durable format the same
zip**: the producer streams a deflated archive (`@endo/zip` `writer.js` +
`deflate.js`, both already in-repo), and the recipient writes those bytes
straight into its durable backing. One codec serves transport, on-disk
durability, and the runnable backing.

### Durable filesystem on the receiving side (pluggable backing)

The recipient needs the clone to **persist and reincarnate across daemon
restart**, and we may *not* want to spray loose files onto the host disk. The
`@endo/endo-fs` `FsBackend` seam (`backend-types.js` + `wrap-backend.js`) is
built exactly for this: `wrapBackend(backend)` synthesises the full
`Filesystem` exo surface over a minimal path-keyed backend, so a new backing
costs ~100 lines. Candidate durable backings for a cloned app:

- **Zip-backed backend** (leading option) — entries land in a `@endo/zip`
  archive; the archive is the single durable artifact, and the same bytes were
  the wire format. Projected back as a runnable `ReadableTree` via
  [exo-zip-package](exo-zip-package.md).
- **Daemon CAS** — entries become `readable-blob` / `readable-tree` formulas
  (the existing content-addressed store), the cross-daemon analogue of
  [`endo checkin`](daemon-checkin-checkout.md) without a host-path round-trip.
- **node-fs backend** — ordinary files on disk, when that is actually wanted.

The clone verb takes the durable backing as a parameter; the default is the
zip-backed archive so a cloned app is one self-contained, content-defined file
rather than scattered state.

### Why cloneability is explicit

Remote-reference sharing and cloning are different trust postures:

- A remote reference keeps the author in the loop (they can revoke, observe,
  update centrally) and never discloses source.
- A clone discloses the full source tree and hands control to the recipient.

The author must opt in to disclosure; hence `cloneable` is a deliberate flag,
not implied by sharing.

## Dependencies

| Design | Relationship |
|---|---|
| [endo-fs-backend-seam](endo-fs-backend-seam.md) | The `FsBackend` seam (`wrapBackend`) that makes a zip-backed (or CAS-backed) durable receiver ~100 lines. **Load-bearing for the receiving side.** |
| [exo-zip-package](exo-zip-package.md) | Projects the received/durable zip back as a runnable `ReadableTree`. |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) | The local serialisation primitive the cross-daemon clone generalises (CAS-backed receiver option). |
| [ocapn-noise-network](ocapn-noise-network.md) | The secure transport we trust for clone integrity and peer authenticity in lieu of per-blob hashing. |
| [familiar-app-ui-hosting](familiar-app-ui-hosting.md) | Hosts the app's `ui` manifest as partially-sandboxed UI. |
| [daemon-weblet-application](daemon-weblet-application.md) | Prior art for "readable tree + powers → served application". |
| [app-sharing-milestone](app-sharing-milestone.md) | Parent milestone; this is the "make & share runnable apps" pillar. |

## Phased Implementation

1. **App handle.** Name the `{ source, run, ui?, cloneable }` composition as a
   first-class shareable thing; "share (reference)" affordance over an existing
   running formula. (Substrate already runs the app via `make-from-tree`.)
2. **Streaming clone + durable receiver.** A tree-archive stream helper in
   `@endo/endo-fs` (producer serialises the tree to one stream; consumer
   drains it), plus a **zip-backed `FsBackend`** so the recipient gets a
   durable, self-contained archive that reincarnates across restart. `endo
   clone` verb wires producer → stream → durable backing → `make-from-tree`.
3. **Cloneability policy + UX.** Honour the `cloneable` flag end to end; Chat
   surfaces "Open (remote)" vs "Make my own copy" per the author's policy.

## Design Decisions

1. **An app is `make-from-tree` plus metadata, not a new runtime.** Reuse the
   existing compartment-mapper / `make` execution path; the app concept is
   packaging and transfer, not a new way to run code.
2. **Clone copies code, never capabilities.** The cloned instance binds the
   recipient's powers. The author shares source, not authority.
3. **Cloneability is opt-in disclosure.** Defaulting to remote-reference keeps
   the safe posture; cloning is a deliberate author decision to disclose the
   source tree.
4. **One tree-stream, not a pipelined walk.** Cloning ships the whole tree as a
   single ordered stream of `(path, content)` entries so the cost is one stream
   regardless of file count — fewer round-trips than per-node
   `lookup`/`snapshot`/`fetch`.
5. **Trust the peer and the transport; no content hashing.** The clone does not
   compute or verify per-blob hashes and does no CAS dedup. Integrity and
   peer-authenticity come from the secure channel established when the peer was
   added, not from re-hashing on receipt.
6. **Durable receiver is pluggable; default zip.** The recipient persists the
   clone through the `@endo/endo-fs` `FsBackend` seam. The default backing is a
   self-contained zip archive (same bytes as the wire format) rather than loose
   files on the host disk.

## Known Gaps and TODOs

- [ ] **Clone of an actively-written source — unresolved.** If the source tree
      mutates mid-stream the recipient can capture a torn state. Candidate
      answers: pin the source to an immutable snapshot before streaming
      (clean, but snapshotting a large live tree has cost), or accept
      best-effort consistency. Whole-tree atomicity is not yet designed; this
      is the main open question.
- [ ] **FS layering for immediate use — deferred.** A copy-on-write
      `compose(remote-backing, local-writable-layer)` clone would let the
      recipient use the app before the full copy finishes, materialising
      entries on demand. Interesting but out of scope for the first cut.
- [ ] Cross-peer GC interaction for **mode A**: prevent the author GC'ing a
      source/exo a remote holder still references (relates to
      [daemon-cross-peer-gc](daemon-cross-peer-gc.md)).
- [ ] Update/versioning of a cloned app (pull a newer tree) — out of scope for
      the milestone; clones are point-in-time copies.

## Prompt (refinement)

> rather than a pipelined approach, I think a stream of filename file content
> will lead to fewer roundtrips. I don't think we need to check the hashes as
> we are trusting the peer and the network layer to provide the content. but I
> haven't thought about a clone over an fs that is being actively written to.
> the fs layering for immediate use is interesting, but deferrable. we also
> need to be able to create a durable fs on the receiving side, and we may not
> want to just write files to disk normally (maybe we want to back it by zip or
> something else).

## Prompt

> make and share runnable apps (backed by an endo-fs source and endo-fs-exec).
> apps need to be optionally "cloneable" so you don't just get a remote
> reference on their machine. Part of the app-sharing milestone.

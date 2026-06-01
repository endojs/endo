# Endo App Sharing and Cloning

| | |
|---|---|
| **Created** | 2026-06-01 |
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

1. Resolve the shared app handle's `source` `readable-tree`.
2. Walk it, streaming each `readable-blob` into the recipient's own
   content-addressed store as fresh local `readable-blob` / `readable-tree`
   formulas — the cross-daemon analogue of `endo checkout` immediately
   followed by `endo checkin`, but without a filesystem round-trip (compose
   with [`exo-zip-package`](exo-zip-package.md) for the in-memory path).
3. **Verify content hashes** during the walk so the clone is provably the tree
   the author offered (trust-on-clone, sibling to
   [`trust-on-first-bind`](trust-on-first-bind.md)).
4. Re-run `make-from-tree` against the *local* copy under the recipient's own
   `run` powers, producing an independent instance.

A new CLI verb (working name `endo clone <remote-app> --name <local-name>`)
and a Chat "Make my own copy" action drive mode B. The cloned app's powers are
the recipient's to grant — the clone does not inherit the author's
capabilities, only the author's *code*.

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
| [exo-zip-package](exo-zip-package.md) | In-memory zip ⇄ `ReadableTree` makes the clone path filesystem-free. |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) | The local serialisation primitive the cross-daemon clone generalises. |
| [endo-fs-backend-seam](endo-fs-backend-seam.md) | The endo-fs backing the app source is mounted from. |
| [trust-on-first-bind](trust-on-first-bind.md) | Pattern for hash-verified acceptance of remote content. |
| [familiar-app-ui-hosting](familiar-app-ui-hosting.md) | Hosts the app's `ui` manifest as partially-sandboxed UI. |
| [daemon-weblet-application](daemon-weblet-application.md) | Prior art for "readable tree + powers → served application". |
| [app-sharing-milestone](app-sharing-milestone.md) | Parent milestone; this is the "make & share runnable apps" pillar. |

## Phased Implementation

1. **App handle.** Name the `{ source, run, ui?, cloneable }` composition as a
   first-class shareable thing; "share (reference)" affordance over an existing
   running formula. (Substrate already runs the app via `make-from-tree`.)
2. **Cross-daemon clone.** `endo clone` verb: resolve remote `readable-tree`,
   stream blobs into the local store with hash verification, re-run locally.
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
4. **Verify on clone.** Content-addressing already gives us hashes; the clone
   walk checks them so a cloned app is provably the offered tree.

## Known Gaps and TODOs

- [ ] Cross-peer GC interaction for **mode A**: prevent the author GC'ing a
      source/exo a remote holder still references (relates to
      [daemon-cross-peer-gc](daemon-cross-peer-gc.md)).
- [ ] Update/versioning of a cloned app (pull a newer tree) — out of scope for
      the milestone; clones are point-in-time copies.

## Prompt

> make and share runnable apps (backed by an endo-fs source and endo-fs-exec).
> apps need to be optionally "cloneable" so you don't just get a remote
> reference on their machine. Part of the app-sharing milestone.

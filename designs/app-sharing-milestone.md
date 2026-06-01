# Milestone: Peer App Sharing

| | |
|---|---|
| **Created** | 2026-06-01 |
| **Author** | Aaron (prompted) |
| **Status** | Proposed |

## What is the Problem Being Solved?

This milestone defines a single coherent, shippable cut: **two people can
install Familiar, become peers by clicking a link, and share runnable apps —
either as a live remote reference or as an independent clone — with the app's
UI hosted in a partial sandbox.**

It is a *cut*, not a new bucket of unrelated work: it pulls forward and
sequences slices that already live across Milestones 1–3, and adds three new
design docs for the genuinely-missing connective tissue. The point is to reach
an end-to-end "make a thing, send it to a friend, they run it" experience
sooner than the linear M1→M2→M3 march would deliver it.

The cut has three pillars:

1. **Distribute the chat app as a downloadable.** A real installer users can
   run without developer warnings.
2. **Connect to peers via a deep-link URL.** Click a link → confirmation
   screen → name the peer → bound.
3. **Make and share runnable apps.** Apps backed by an endo-fs source +
   endo-fs-exec, optionally cloneable, with partially-sandboxed UI.

## Verified Current State (2026-06-01)

The substrate is far along; most pillars are connective tissue and UX over
shipped primitives.

### Pillar 1 — Distributable: a working unsigned build exists

`packages/familiar` already produces a runnable app and ships a CI release
pipeline:

- `yarn build:package` → `scripts/build.mjs` → bundle (esbuild) → download
  Node (v20.18.1) → `@electron/packager` → `out/Familiar-<os>-<arch>/`.
- `scripts/make-distributables.mjs` emits: macOS **DMG + zip**, Linux **zip**,
  Windows **zip**.
- `.github/workflows/familiar-release.yml` (trigger: `familiar-v*` tag or
  `workflow_dispatch`) builds **macOS arm64 (macos-14), macOS x64 (macos-13),
  Linux x64 (ubuntu)** and uploads all artifacts to a **draft** GitHub release.
- Designs [familiar-electron-shell](familiar-electron-shell.md),
  [familiar-daemon-bundling](familiar-daemon-bundling.md),
  [familiar-bundled-agents](familiar-bundled-agents.md) are **Complete**.

**Gaps (operational, not architectural):**

- No **code signing / notarization** — `package-app.mjs` passes no
  `osxSign`/`osxNotarize`; CI holds no signing secrets. Unsigned macOS builds
  hit Gatekeeper quarantine ("damaged" on Apple Silicon).
- **Windows is not in the CI matrix** (the script supports `win32`, but no job
  builds it) and there is **no installer** (NSIS/MSI) — zip only.
- No **Linux AppImage** (zip only).
- No **auto-update** — `electron-updater` is absent (the shell design only
  *recommends* it).
- No **release checksums**; app `version` is hardcoded `0.1.0`, not synced to
  the release tag.

### Pillar 2 — Peer deep-link: daemon ready, shell + UI missing

- Locator format and `host.invite(name)` / `host.accept(locator, petName)` are
  **Complete** (`packages/daemon/src/locator.js`, `host.js`): accept parses the
  locator, registers addresses via `addPeerInfo`, and binds a pet name.
- OCapN-Noise transport is **Complete** (PR #137).
- Familiar already registers a privileged custom scheme (`localhttp://`) — a
  working template.
- **Missing:** `endo://` deep-link capture in the shell, a confirmation
  screen, and a naming prompt. → [familiar-deep-link-invitations](familiar-deep-link-invitations.md).

### Pillar 3 — Runnable apps: run + serialise exist, transfer + UI missing

- `@endo/endo-fs` (Filesystem caps; `FsBackend` seam **Complete**) and
  `@endo/endo-fs-exec` `tree-view-module.js` adapt a project tree into the
  daemon's **`make-from-tree`** formula — which runs a compartment-mapped
  `make(powers, context, { env }) => exo`. **This is the run mechanism, and it
  is Complete.**
- `readable-tree` / `readable-blob` formulas and `endo checkin`/`checkout`
  (tree ⇄ fs, zip via `-z`) are **Complete**. Per-app origin isolation + CSP in
  Familiar are **Complete**.
- **Missing:** an app handle bundling source + exec + UI; a **cross-daemon
  clone** (remote-ref vs independent copy) with hash verification; and the
  app-facing **partially-sandboxed UI** layer. →
  [endo-app-sharing](endo-app-sharing.md),
  [familiar-app-ui-hosting](familiar-app-ui-hosting.md). The hosting substrate
  ([familiar-unified-weblet-server](familiar-unified-weblet-server.md),
  [familiar-chat-weblet-hosting](familiar-chat-weblet-hosting.md),
  [daemon-weblet-application](daemon-weblet-application.md)) is designed but
  partly unbuilt.

## Constituent Work

### New designs (introduced by this milestone)

| Design | Pillar | Size |
|---|---|---|
| [familiar-deep-link-invitations](familiar-deep-link-invitations.md) | 2 — connect peers | S-M |
| [endo-app-sharing](endo-app-sharing.md) | 3 — make & share apps | M |
| [familiar-app-ui-hosting](familiar-app-ui-hosting.md) | 3 — sandboxed UI | M |

### Existing designs pulled into the cut

| Design | Pillar | Home milestone | Why needed here |
|---|---|---|---|
| [familiar-electron-shell](familiar-electron-shell.md) (Complete) | 1 | M0 | The shell being distributed. |
| [familiar-daemon-bundling](familiar-daemon-bundling.md) (Complete) | 1 | M0 | Bundled daemon/Node in the artifact. |
| Release signing / auto-update / Windows-CI hardening (*no doc; tracked here*) | 1 | new | The gap between "build exists" and "real download". |
| [ocapn-noise-network](ocapn-noise-network.md) (Complete) | 2 | M2 | Secure transport peers connect over. |
| [daemon-agent-network-identity](daemon-agent-network-identity.md) | 2 | M2 | Per-agent keypairs behind the locator's node key (soft prereq). |
| [exo-zip-package](exo-zip-package.md) | 3 | M3 | Filesystem-free clone path. |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) (Complete) | 3 | M3 | Local serialisation the clone generalises. |
| [familiar-unified-weblet-server](familiar-unified-weblet-server.md) | 3 | M3 | Virtual-host serving for app UIs. |
| [familiar-chat-weblet-hosting](familiar-chat-weblet-hosting.md) | 3 | M3 | In-Chat iframe pane + chrome/guest barrier. |
| [daemon-weblet-application](daemon-weblet-application.md) | 3 | M3 | Serve readable-tree files + powers over CapTP. |

## Phased Plan

**P0 — Ship a real installer (Pillar 1).** Code signing + notarization
(macOS Developer ID; Windows Authenticode), add Windows to the CI matrix with
an NSIS/MSI installer, Linux AppImage, `electron-updater` auto-update, SHA256
checksums, and tag-synced version. *Exit:* a non-developer downloads, installs,
and launches Familiar on macOS/Windows/Linux without security warnings, and
receives an update.

**P1 — Peer deep-link invites (Pillar 2).** Implement
[familiar-deep-link-invitations](familiar-deep-link-invitations.md): `endo://`
capture in the shell → Chat confirmation + naming modal → `host.accept`.
*Exit:* clicking an `endo://invite/…` link in another app opens Familiar, shows
who is being added, asks for a pet name, and binds the peer.

**P2 — App handle + sandboxed UI (Pillar 3a/3b).** Name the app handle and
"share (reference)" affordance ([endo-app-sharing](endo-app-sharing.md) phase
1); land the app UI manifest + `connected` sandbox tier
([familiar-app-ui-hosting](familiar-app-ui-hosting.md) phase 1) on top of the
weblet substrate. *Exit:* a user runs an endo-fs/`make-from-tree` app, opens
its partially-sandboxed UI in a Chat pane, and shares a remote reference to a
peer who opens the same UI.

**P3 — Clone & share (Pillar 3c).** Cross-daemon `endo clone` with hash
verification and the `cloneable` policy end to end
([endo-app-sharing](endo-app-sharing.md) phases 2–3). *Exit:* a peer receiving
a cloneable app chooses "Make my own copy", gets an independent local instance
under their own powers, and it keeps working after the author disconnects.

## Exit Criterion

A non-developer installs a signed Familiar build, clicks an `endo://` invite
from a friend, confirms and names that peer, then receives a shared app —
opening it either as a live remote reference or, when the author marked it
cloneable, as their own independent copy — with the app's UI running in a
partial sandbox.

## Dependencies

This milestone composes the three new designs above with the existing
[familiar-*](familiar-electron-shell.md), [ocapn-noise-network](ocapn-noise-network.md),
[exo-zip-package](exo-zip-package.md), and weblet-hosting designs. It does not
require all of M1/M2/M3 to complete — only the slices listed under *Constituent
Work*.

## Prompt

> explore the existing design docs. I want to roadmap out to an MVP. the goals
> are 1) to be able to distribute the endo daemon chat app as a distributeable.
> 2) connect to other peers via a deep linking url format (needs a confirmation
> screen, should ask you to specify a name). 3) make and share runnable apps
> (backed by an endo-fs source and endo-fs-exec). apps need to be optionally
> "cloneable" so you don't just get a remote reference on their machine. they
> need a way of hosting partially sandboxed ui.
>
> rather than "MVP doc" call it "app-sharing" milestone or something.

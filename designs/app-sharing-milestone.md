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

**This pillar is already an active workstream — defer to it, do not restate.**
The gap analysis and release plan live in `familiar-release.md`
([PR #231](https://github.com/endojs/endo-but-for-bots/pull/231) ·
[raw doc](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/design/familiar-release/designs/familiar-release.md),
closing issue #229), which enumerates **sixteen gaps (G1–G16)** with severity
and effort and
— importantly — **scopes the MVR to macOS arm64 only** (the maintainer's
primary platform), deferring Linux/Windows to followups. Its top-three
blockers are **G1** (wire the build into per-platform CI artifacts), **G2**
(macOS Developer ID + notarization), and **G16** (Primer-into-CAS packaged
smoke). Six maintainer open questions remain (distribution channel, signing
identity, version policy, OS matrix, bundled-vs-published daemon, auto-update
posture).

A swarm of G-item implementation PRs is already open against it: CI build
pipeline [#318](https://github.com/endojs/endo-but-for-bots/pull/318) (G1),
macOS arm64+x64 matrix
[#321](https://github.com/endojs/endo-but-for-bots/pull/321) (G15), icon
projection [#319](https://github.com/endojs/endo-but-for-bots/pull/319) (G7),
Node LTS pin [#316](https://github.com/endojs/endo-but-for-bots/pull/316) (G5),
stop/purge [#320](https://github.com/endojs/endo-but-for-bots/pull/320) (G8),
LICENSE aggregation [#323](https://github.com/endojs/endo-but-for-bots/pull/323)
(G14), Primer-CAS smoke
[#324](https://github.com/endojs/endo-but-for-bots/pull/324) (G16), Flatpak
[#322](https://github.com/endojs/endo-but-for-bots/pull/322) (G4),
telemetry/crash [#317](https://github.com/endojs/endo-but-for-bots/pull/317)
(G13), and packaging lanes + pre-release CI
[#360](https://github.com/endojs/endo-but-for-bots/pull/360).

The concrete gaps that plan covers (recorded here only so the milestone is
self-contained): no code signing / notarization (`package-app.mjs` passes no
`osxSign`/`osxNotarize`; Gatekeeper "damaged" on Apple Silicon); Windows absent
from the CI matrix and no NSIS/MSI installer; no Linux AppImage; no
`electron-updater` auto-update; no release checksums; `version` hardcoded
`0.1.0`. **This milestone adopts `familiar-release.md`'s plan for Pillar 1
rather than offering a competing one.**

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
  clone** (remote-ref vs independent copy, shipped as one streamed tree-archive
  into a pluggable durable backing); and the app-facing **partially-sandboxed
  UI** layer. → [endo-app-sharing](endo-app-sharing.md),
  [familiar-app-ui-hosting](familiar-app-ui-hosting.md). The hosting substrate
  ([familiar-unified-weblet-server](familiar-unified-weblet-server.md),
  [familiar-chat-weblet-hosting](familiar-chat-weblet-hosting.md),
  [daemon-weblet-application](daemon-weblet-application.md)) is designed but
  partly unbuilt.
- **Related in-flight work (reconcile, don't duplicate):** a different angle on
  running apps from a VFS — `familiar-run-apps-vfs.md`
  ([PR #241](https://github.com/endojs/endo-but-for-bots/pull/241) ·
  [raw doc](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/design/familiar-run-vfs-apps/designs/familiar-run-apps-vfs.md))
  runs apps under `endor` against `Mount` caps with a sqlite-backed module
  store. The clone's durable backing leans on the in-flight
  [exo-zip / exo-unzip](https://github.com/endojs/endo-but-for-bots/pull/160)
  (PR #160) and [exo-stream](https://github.com/endojs/endo-but-for-bots/pull/330)
  (PR #330); tree-as-archive prior art is daemon git-tree `archive`
  ([PR #367](https://github.com/endojs/endo-but-for-bots/pull/367)).

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
| `familiar-release.md` — MVR release plan ([PR #231](https://github.com/endojs/endo-but-for-bots/pull/231) · [raw](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/design/familiar-release/designs/familiar-release.md)) | 1 | issue #229 | **Owns Pillar 1.** G1–G16, macOS-arm64-first MVR. P0 adopts it. |
| `familiar-run-apps-vfs.md` — run apps over a VFS ([PR #241](https://github.com/endojs/endo-but-for-bots/pull/241) · [raw](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/design/familiar-run-vfs-apps/designs/familiar-run-apps-vfs.md)) | 3 | M1 | Sibling angle on running apps from a mount/VFS source (`endor` + sqlite module store). |
| [ocapn-noise-network](ocapn-noise-network.md) (Complete) | 2 | M2 | Secure transport peers connect over. Daemon-to-daemon wiring in [PR #340](https://github.com/endojs/endo-but-for-bots/pull/340). |
| [daemon-agent-network-identity](daemon-agent-network-identity.md) | 2 | M2 | Per-agent keypairs behind the locator's node key (soft prereq). Per-agent `@transports` design [PR #138](https://github.com/endojs/endo-but-for-bots/pull/138), prototype [#262](https://github.com/endojs/endo-but-for-bots/pull/262); locator v2 [#178](https://github.com/endojs/endo-but-for-bots/pull/178). |
| [exo-zip-package](exo-zip-package.md) | 3 | M3 | Durable zip backing for clones; in-flight as exo-zip/exo-unzip [PR #160](https://github.com/endojs/endo-but-for-bots/pull/160). |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) (Complete) | 3 | M3 | Local serialisation the clone generalises. |
| [familiar-unified-weblet-server](familiar-unified-weblet-server.md) | 3 | M3 | Virtual-host serving for app UIs. |
| [familiar-chat-weblet-hosting](familiar-chat-weblet-hosting.md) | 3 | M3 | In-Chat iframe pane + chrome/guest barrier. |
| [daemon-weblet-application](daemon-weblet-application.md) | 3 | M3 | Serve readable-tree files + powers over CapTP. |

## Phased Plan

**P0 — Ship a real installer (Pillar 1) — adopt `familiar-release.md`'s MVR.**
Do not run a competing plan: execute the MVR in
[PR #231](https://github.com/endojs/endo-but-for-bots/pull/231), which is
**macOS-arm64-first** and whose top blockers are G1 (per-platform CI
artifacts, [PR #318](https://github.com/endojs/endo-but-for-bots/pull/318) /
[#321](https://github.com/endojs/endo-but-for-bots/pull/321)), G2 (macOS
Developer ID + notarization), and G16 (Primer-into-CAS packaged smoke,
[PR #324](https://github.com/endojs/endo-but-for-bots/pull/324)). Linux/Windows
installers and `electron-updater` auto-update are MVR *followups* in that plan.
*Exit (this milestone's slice):* a non-developer downloads, installs, and
launches a signed/notarized Familiar on **macOS arm64** without Gatekeeper
warnings.

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

**P3 — Clone & share (Pillar 3c).** Cross-daemon `endo clone` as a single
streamed tree-archive into a pluggable durable backing (default zip), honouring
the `cloneable` policy end to end ([endo-app-sharing](endo-app-sharing.md)
phases 2–3) — no per-blob hashing; integrity is the transport's job. *Exit:* a
peer receiving a cloneable app chooses "Make my own copy", gets an independent
local instance under their own powers, and it keeps working after the author
disconnects.

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

## Related in-flight PRs

Snapshot taken 2026-06-01 from open PRs on `endojs/endo-but-for-bots`. The two
genuinely net-new pieces — `endo://` deep-link invites and the streaming clone
helper + zip-backed receiver — have **no** open PR; everything else below is
substrate to reconcile against rather than re-invent. Design-doc PRs include a
raw-file link so the doc can be read without checking out the branch.

| Pillar | PR | What it is |
|---|---|---|
| 1 | [#231](https://github.com/endojs/endo-but-for-bots/pull/231) ([raw](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/design/familiar-release/designs/familiar-release.md)) | `familiar-release.md` — MVR release plan, G1–G16, macOS-arm64-first. **Owns Pillar 1.** |
| 1 | [#318](https://github.com/endojs/endo-but-for-bots/pull/318) | CI per-platform build pipeline (G1) |
| 1 | [#321](https://github.com/endojs/endo-but-for-bots/pull/321) | macOS arm64 + x64 CI matrix (G15) |
| 1 | [#319](https://github.com/endojs/endo-but-for-bots/pull/319) | cross-platform icon projection (G7) |
| 1 | [#316](https://github.com/endojs/endo-but-for-bots/pull/316) | bundled Node → v22 LTS pin (G5) |
| 1 | [#320](https://github.com/endojs/endo-but-for-bots/pull/320) | consolidate daemon stop/purge (G8) |
| 1 | [#323](https://github.com/endojs/endo-but-for-bots/pull/323) | third-party LICENSE aggregation (G14) |
| 1 | [#324](https://github.com/endojs/endo-but-for-bots/pull/324) | Primer-into-CAS packaged smoke (G16) |
| 1 | [#322](https://github.com/endojs/endo-but-for-bots/pull/322) ([raw](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/feat/familiar-flatpak-pipeline/designs/familiar-flatpak-pipeline.md)) | Flatpak packaging design (G4) |
| 1 | [#317](https://github.com/endojs/endo-but-for-bots/pull/317) ([raw](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/design/familiar-telemetry/designs/familiar-telemetry-crash-reporting.md)) | telemetry / crash-reporting design (G13) |
| 1 | [#360](https://github.com/endojs/endo-but-for-bots/pull/360) | per-platform packaging lanes + pre-release CI |
| 2 | [#178](https://github.com/endojs/endo-but-for-bots/pull/178) | locator scheme v2 (`@`-delimited connection hints) — the `endo://` link's basis |
| 2 | [#138](https://github.com/endojs/endo-but-for-bots/pull/138) ([raw](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/design/ocapn-daemon-integration/designs/ocapn-daemon-integration.md)) | per-agent `@transports` design (network identity) |
| 2 | [#262](https://github.com/endojs/endo-but-for-bots/pull/262) | per-agent `@transports` gap-revealing prototype |
| 2 | [#340](https://github.com/endojs/endo-but-for-bots/pull/340) | OCapN-Noise daemon-to-daemon connectivity |
| 2 | [#343](https://github.com/endojs/endo-but-for-bots/pull/343) · [#356](https://github.com/endojs/endo-but-for-bots/pull/356) · [#337](https://github.com/endojs/endo-but-for-bots/pull/337) | `@endo/gateway` package / packaging+AWS / host-scope path funcs |
| 3 | [#241](https://github.com/endojs/endo-but-for-bots/pull/241) ([raw](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/design/familiar-run-vfs-apps/designs/familiar-run-apps-vfs.md)) | `familiar-run-apps-vfs.md` — run apps over a VFS (`endor` + sqlite module store) |
| 3 | [#160](https://github.com/endojs/endo-but-for-bots/pull/160) | exo-zip / exo-unzip — durable zip backing for clones |
| 3 | [#330](https://github.com/endojs/endo-but-for-bots/pull/330) | exo-stream — the streaming substrate the clone tree-stream rides |
| 3 | [#367](https://github.com/endojs/endo-but-for-bots/pull/367) | daemon git-tree `archive` (tar) — tree-as-archive prior art |
| 3 | [#135](https://github.com/endojs/endo-but-for-bots/pull/135) · [#127](https://github.com/endojs/endo-but-for-bots/pull/127) · [#277](https://github.com/endojs/endo-but-for-bots/pull/277) · [#358](https://github.com/endojs/endo-but-for-bots/pull/358) | mount / VFS source substrate (Phase 4, extensions, follow-name, importLocation) |
| 3 | [#238](https://github.com/endojs/endo-but-for-bots/pull/238) | rps-demo — a working shared distributed app |

> **Note on the raw-doc URLs:** they point at the PR head branches as they
> stand on 2026-06-01; if a branch is rebased or merged the link may move. The
> PR link is the durable anchor.

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

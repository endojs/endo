# Familiar Deep-Link Peer Invitations

| | |
|---|---|
| **Created** | 2026-06-01 |
| **Author** | Aaron (prompted) |
| **Status** | Proposed |

## What is the Problem Being Solved?

Two people running Familiar should be able to become peers by exchanging a
single link.
Today the daemon already has the machinery to mint and accept a peer
invitation — `host.invite(guestName)` produces a locator string and
`host.accept(locator, petName)` parses it, registers the remote node's
addresses via `addPeerInfo`, and binds a local pet name — but there is no
way to *deliver* that locator through the operating system into a running
Familiar and turn it into a guided, consent-gated flow.

The missing pieces are entirely in the shell and the Chat UI:

1. **OS deep-link capture.** Familiar does not register a custom URL scheme
   (e.g. `endo://`), so clicking an invite link in a browser, chat app, or
   email does nothing.
2. **A confirmation screen.** Accepting a peer is a trust decision. The user
   must see *who* they are about to add (a key fingerprint and any
   self-asserted label) and explicitly approve.
3. **A naming prompt.** The peer must be bound under a **pet name** chosen by
   the recipient — the locator cannot dictate the local name, and the user
   should be asked rather than defaulted silently.

This design adds the deep-link handler and the consent/naming UI on top of
the existing daemon `invite`/`accept` surface.

## Background: what already exists

| Capability | Location | Status |
|---|---|---|
| Locator format `endo://{nodeKey}/?id=…&type=invitation&at=host:port` | `packages/daemon/src/locator.js` | Complete |
| `host.invite(guestName)` → `Invitation` exo with `locate()` | `packages/daemon/src/host.js` | Complete |
| `host.accept(invitationLocator, guestName)` → parse, `addPeerInfo`, bind pet name | `packages/daemon/src/host.js` | Complete |
| OCapN-Noise transport (mutual Ed25519, IK handshake) | `packages/ocapn-noise`, [`ocapn-noise-network`](ocapn-noise-network.md) | Complete (PR #137) |
| Privileged custom scheme registration in Electron (`localhttp://`) | `packages/familiar/src/protocol-handler.js` | Complete (template) |

The `localhttp://` handler is the working reference for how to register and
service a custom scheme in the Familiar main process.

## Design

### 1. URL scheme and link shape

Register `endo:` as the application's default protocol client. An invitation
link reuses the existing locator query string under a stable host segment so
the same string round-trips through `host.accept`:

```
endo://invite/?node={nodeKey}&id={invitationNumber}&type=invitation&at=ws:host:port&label={optional}
```

- `node`, `id`, `type`, `at` mirror the daemon locator so the renderer can
  forward the reconstructed locator straight to `host.accept`.
- `label` is an **optional, untrusted** self-asserted display string shown on
  the confirmation screen for human recognition only. It is never used as the
  pet name and never granted trust weight.

### 2. Capturing the link in the shell

In `packages/familiar/electron-main.js`:

- `app.setAsDefaultProtocolClient('endo')` (guarded for dev vs packaged
  paths, matching how `localhttp` is set up).
- Register `endo` in `protocol.registerSchemesAsPrivileged` before
  `app.whenReady()`.
- Handle the three OS delivery paths:
  - **macOS:** `app.on('open-url', (event, url) => …)`.
  - **Windows / Linux:** `app.requestSingleInstanceLock()` plus
    `app.on('second-instance', (event, argv) => …)`, and parse `process.argv`
    on cold start.
- Normalise to a single internal event and forward the parsed invite to the
  renderer over the existing preload IPC bridge (`packages/familiar/preload.js`),
  never executing `accept` from the main process directly.

### 3. Confirmation + naming screen (Chat)

The renderer receives an `endo:invite` IPC message and opens a modal:

- **Identity block:** key fingerprint (short hash of `nodeKey`), the
  untrusted `label` clearly marked as self-asserted, and the connection hints
  (`at` addresses).
- **Name field:** "What should we call this peer?" — required, validated as a
  pet name, defaulted to a *suggestion* derived from `label` or the
  fingerprint that the user must confirm or replace.
- **Actions:** Accept / Decline. Accept calls
  `E(host).accept(reconstructedLocator, petName)` over the existing CapTP
  bridge; Decline discards the invite with no daemon side effects.

The barrier between the host chrome (the modal frame, the Accept button) and
any peer-supplied content (the `label`) follows the same chrome/guest
separation principle used for weblet hosting — peer-supplied strings are
rendered as inert text, never as markup or actionable controls.

## Dependencies

| Design | Relationship |
|---|---|
| [ocapn-noise-network](ocapn-noise-network.md) | Provides the secure transport the accepted peer connects over. |
| [daemon-agent-network-identity](daemon-agent-network-identity.md) | Per-agent keypairs / network registration that make the `nodeKey` in the link meaningful; soft prerequisite. In-flight as per-agent `@transports`: design `ocapn-daemon-integration.md` ([PR #138](https://github.com/endojs/endo-but-for-bots/pull/138) · [raw](https://github.com/endojs/endo-but-for-bots/raw/refs/heads/design/ocapn-daemon-integration/designs/ocapn-daemon-integration.md)), prototype [#262](https://github.com/endojs/endo-but-for-bots/pull/262). |
| [trust-on-first-bind](trust-on-first-bind.md) | Reference for the prompt-and-pin consent pattern the confirmation screen instantiates. |
| [familiar-localhttp-protocol](familiar-localhttp-protocol.md) | Working template for privileged custom-scheme registration in Electron. |
| [app-sharing-milestone](app-sharing-milestone.md) | Parent milestone; this is the "connect peers" pillar. |

**Related in-flight PRs:** locator scheme v2 with `@`-delimited connection hints
([#178](https://github.com/endojs/endo-but-for-bots/pull/178)) is the basis for
the `endo://` link's query params; daemon-to-daemon OCapN-Noise connectivity is
[#340](https://github.com/endojs/endo-but-for-bots/pull/340). No `endo://`
deep-link / confirmation-screen PR exists yet — this design is net-new.

## Phased Implementation

1. **Scheme registration + capture.** `setAsDefaultProtocolClient`, privileged
   scheme, `open-url` / `second-instance` / argv parsing, single-instance lock,
   IPC forward. No UI yet — log the parsed invite.
2. **Confirmation + naming modal.** Identity block, validated pet-name field,
   Accept → `host.accept`, Decline path. Untrusted-label rendering discipline.
3. **Polish.** Invite-link generation affordance in Chat ("Invite a peer" →
   copy `endo://invite/…`), error states (malformed link, unreachable peer,
   duplicate pet name), and a smoke test that drives a synthetic `endo://`
   URL end to end.

## Design Decisions

1. **Accept runs in the renderer over CapTP, not in the Electron main
   process.** The main process stays a thin transport for the URL; all
   capability use goes through the same audited preload bridge as the rest of
   Chat.
2. **The locator cannot name the peer.** The pet name is always the
   recipient's choice. The link may *suggest* via `label`, but the suggestion
   is untrusted and confirmable.
3. **Reuse the existing locator string verbatim.** The link is a thin
   `endo://` envelope around the daemon's own locator query params so there is
   one parser of record (`packages/daemon/src/locator.js`) and `host.accept`
   needs no changes.

## Prompt

> connect to other peers via a deep linking url format (needs a confirmation
> screen, should ask you to specify a name). Part of the app-sharing
> milestone.

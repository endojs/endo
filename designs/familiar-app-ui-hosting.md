# Familiar App UI Hosting (Partial Sandbox)

| | |
|---|---|
| **Created** | 2026-06-01 |
| **Author** | Aaron (prompted) |
| **Status** | Proposed |

## What is the Problem Being Solved?

A shared, runnable Endo app (see [endo-app-sharing](endo-app-sharing.md)) needs
a way to present a **user interface** — and because an app may be authored by
someone else, that UI must be **partially sandboxed**: confined enough that it
cannot exfiltrate data or escalate, but still able to talk to its own backing
exo over CapTP to do useful work.

The hosting substrate for this already exists or is designed across three
documents:

- [familiar-unified-weblet-server](familiar-unified-weblet-server.md) — one
  HTTP server that routes by virtual host to weblet handlers.
- [familiar-chat-weblet-hosting](familiar-chat-weblet-hosting.md) — embedding a
  weblet as an iframe pane inside Chat with a chrome/guest barrier.
- [daemon-weblet-application](daemon-weblet-application.md) — serving a
  `readable-tree` of static files plus a powers reference over CapTP.

What those documents do not yet pin down is the **app-specific** layer this
milestone needs:

1. A **UI manifest** on the app handle saying *what* to serve (entry HTML, the
   `readable-tree` of assets) and *how much* to sandbox it.
2. A small **sandbox-level policy** so an author can choose the confinement
   tier appropriate to their app.
3. The **CapTP wiring** from the sandboxed UI back to *that app's* exo
   specifically (not ambient daemon authority), so a cloned or referenced app's
   UI is bound to the right instance with the right powers.

This design adds that thin app-UI layer; it defers all core hosting mechanics
to the three documents above.

## Background: what already exists

| Capability | Location | Status |
|---|---|---|
| `localhttp://<weblet-id>/` privileged scheme, per-app origin isolation | `packages/familiar/src/protocol-handler.js` | Complete |
| CSP injection per response (`connect-src 'self'`, `object-src 'none'`, `frame-src 'self'`, …) | `packages/familiar/src/protocol-handler.js` | Complete |
| Navigation guards / exfiltration defenses | `packages/familiar/electron-main.js`, `src/exfiltration-defense.js` | Complete (partial) |
| Unified weblet server routing | [familiar-unified-weblet-server](familiar-unified-weblet-server.md) | In Progress |
| Chat iframe weblet pane | [familiar-chat-weblet-hosting](familiar-chat-weblet-hosting.md) | Not Started |
| Serve `readable-tree` files + powers over CapTP | [daemon-weblet-application](daemon-weblet-application.md) | Not Started |

Per-app origin isolation and CSP are the strong parts that already ship. The
gap is the app-facing manifest, the sandbox tiers, and binding the UI's CapTP
session to a specific app exo.

## Design

### App UI manifest

The `ui` field of an app handle ([endo-app-sharing](endo-app-sharing.md)):

```
ui: {
  entry:   'index.html',                 // path within the assets tree
  assets:  <readable-tree>,              // static files to serve
  sandbox: 'isolated' | 'connected' | 'trusted',
  bridge:  'message-port' | 'web-socket',// CapTP transport to the app exo
}
```

### Sandbox tiers

| Tier | Origin | CSP `connect-src` | CapTP to app exo | Use |
|---|---|---|---|---|
| `isolated` | unique `localhttp://<id>` | `'none'` | no | Pure presentational UI; no back-channel. |
| `connected` (default) | unique `localhttp://<id>` | `'self'` | yes, **only** to its own exo | The normal case: app UI drives its own backing capability. |
| `trusted` | unique `localhttp://<id>` | `'self'` + author-declared origins | yes | Author opts into extra reach (e.g. an allowlisted API), surfaced to the user at install. |

Every tier keeps the per-app unique origin and the `object-src 'none'` /
`form-action 'self'` baseline from the existing protocol handler. Tiers only
widen `connect-src` and whether a CapTP bootstrap is granted — they never relax
origin isolation.

### Binding the UI to its app exo

The CapTP bootstrap handed to a `connected`/`trusted` UI resolves to **that
app instance's exo**, carrying only the powers the app was run with
(`run.powers` from the app handle). This matters for the two share modes:

- A **referenced** app's UI bridges back to the author's running exo.
- A **cloned** app's UI bridges to the recipient's *local* exo, under the
  recipient's powers.

Transport is `MessagePort` for the in-Chat iframe (preferred, no network
surface) with a `web-socket` fallback for an external browser, matching
[daemon-weblet-application](daemon-weblet-application.md)'s integration point.

### Chrome / guest barrier

The host chrome (pane frame, close button, app title) lives outside the iframe;
the app's UI lives inside it. Controls that act on the app's lifecycle are
never rendered by the guest. This is the same barrier described in
[familiar-chat-weblet-hosting](familiar-chat-weblet-hosting.md), restated here
as a hard requirement for app UIs because app authors are potentially
untrusted third parties.

## Dependencies

| Design | Relationship |
|---|---|
| [familiar-unified-weblet-server](familiar-unified-weblet-server.md) | Provides the virtual-host HTTP routing this serves over. |
| [familiar-chat-weblet-hosting](familiar-chat-weblet-hosting.md) | Provides the in-Chat iframe pane and chrome/guest barrier. |
| [daemon-weblet-application](daemon-weblet-application.md) | Provides readable-tree file serving + CapTP-over-MessagePort/WebSocket. |
| [familiar-localhttp-protocol](familiar-localhttp-protocol.md) | The per-app origin + CSP mechanism the tiers build on. |
| [endo-app-sharing](endo-app-sharing.md) | Owns the app handle whose `ui` manifest this consumes. |
| [app-sharing-milestone](app-sharing-milestone.md) | Parent milestone; this is the "partially sandboxed UI" pillar. |

## Phased Implementation

1. **Manifest + `connected` tier.** Serve an app's `assets` tree at a unique
   origin with the existing CSP, bootstrap CapTP to the app's own exo over
   `MessagePort` inside a Chat iframe pane. (Depends on the unified server and
   chat-weblet-hosting integration points landing.)
2. **Tiers `isolated` and `trusted`.** Add the no-bridge and
   author-allowlisted-origin tiers; surface `trusted` origins to the user at
   install/open time.
3. **External-browser path.** `web-socket` bridge fallback for opening an app
   UI outside Familiar.

## Design Decisions

1. **Reuse the weblet substrate; add only an app-facing manifest.** This design
   deliberately owns no HTTP server or iframe mechanics — only the
   `{ entry, assets, sandbox, bridge }` shape and the exo-binding rule.
2. **Tiers widen reach, never relax origin isolation.** Per-app unique origin
   and the plugin/form lockdown are invariant across tiers.
3. **The UI is bound to a specific app exo, not ambient authority.** Whether
   referenced or cloned, the UI can only reach the instance and powers the app
   was run with.
4. **`connected` is the sensible default.** Most app UIs need exactly one
   thing: a confined back-channel to their own capability.

## Prompt

> apps … need a way of hosting partially sandboxed ui. Part of the app-sharing
> milestone.

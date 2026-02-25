# Familiar Chat Weblet Hosting

| | |
|---|---|
| **Date** | 2026-02-14 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Chat currently provides inbox, inventory, chat, and eval functionality, but
has no affordance for installing, instantiating, or interacting with weblet
applications. Weblets are installed via the CLI (`endo install`) and opened in
a separate browser tab. In the Familiar, weblets should be hosted **within**
the Chat UI, displayed in an iframe alongside the chat panel, each with their
own guest profile (identity, pet store, mailbox).

This requires Chat to become a weblet host: a place where users can discover,
install, launch, and interact with guest applications that have their own
confined capabilities.

## Description of the Design

### Weblet hosting panel

Add a content panel to the right of the Chat sidebar (inventory + inbox). When
a weblet is selected or launched, its content appears in this panel as an
iframe:

```
┌──────────────┬──────────────────────────────────┐
│  Inventory   │                                  │
│  ──────────  │                                  │
│  Handles     │        Weblet iframe             │
│  Hubs        │    (localhttp://<id>/ or         │
│  Everything  │     http://<id>.localhost:port/)  │
│              │                                  │
│  Inbox       │                                  │
│  ──────────  │                                  │
│  Messages... │                                  │
│              │                                  │
│  Chat input  │                                  │
└──────────────┴──────────────────────────────────┘
```

The iframe `src` is set to the weblet's URL (either `localhttp://` in Familiar
or `http://<id>.localhost:<port>/` in development). The iframe is sandboxed
with appropriate permissions:

```html
<iframe
  src="localhttp://<weblet-id>/"
  sandbox="allow-scripts allow-same-origin allow-forms"
  allow="clipboard-write"
></iframe>
```

### Weblet profiles: guest + handle

Each installed weblet should have its own **guest** identity. When the user
installs a weblet through Chat, the process is:

1. **Create a guest** for the weblet:
   `E(host).provideGuest(handlePetName, { agentName: webletAgentName })`
2. **Endow the guest** with capabilities the user selects (e.g., access to
   specific pet names, network powers, etc.).
3. **Install the weblet** in the guest's worker:
   The weblet bundle is evaluated in a worker associated with the guest, and
   the weblet's powers are the guest's `EndoGuest` capabilities.
4. **Register the weblet** with the unified server under the guest's handle
   identifier.

This means each weblet:
- Has its own pet store (can name things independently).
- Has its own mailbox (can receive messages and capability grants).
- Has its own handle (other agents can reference it by handle).
- Can only access capabilities explicitly granted by the host user.

### Install flow in Chat UI

Add an "Install Weblet" action (button or command). The flow:

1. **Select bundle**: User provides a bundle name (from inventory) or a file
   path.
2. **Name the weblet**: User gives the weblet a pet name.
3. **Configure powers**: A dialog shows available power levels:
   - `NONE` — no endowments (pure sandboxed UI).
   - `ENDO` — access to the Endo network (can look up capabilities by name).
   - `HOST` — full host powers (development/trusted apps only).
   - Custom — select specific pet names to endow.
4. **Create guest and install**: Chat calls the daemon API to create the guest
   and install the weblet in one operation.
5. **Open in panel**: The weblet appears in the right panel iframe.

### CapTP connection for weblets

Each weblet running in the iframe needs a CapTP connection to reach its guest
powers. The connection path:

1. **Weblet iframe** loads the weblet's HTML/JS from the unified server.
2. **Weblet JS** opens a WebSocket to its virtual host URL.
3. **Unified server** routes the WebSocket to the weblet's connection handler.
4. **Connection handler** sets up CapTP with the weblet's guest capabilities
   as the bootstrap.

This is the same mechanism as today's weblets, but routed through the unified
server instead of per-weblet ports.

### Alternative: MessagePort CapTP

For weblets running in iframes within the same Electron window, a more
efficient alternative to WebSocket is Electron's `MessagePort` or
`window.postMessage`:

1. Chat's main frame creates a `MessageChannel`.
2. One port is transferred to the weblet iframe via `postMessage`.
3. CapTP runs over the `MessagePort` directly, bypassing HTTP/WebSocket
   entirely.

This is a stretch goal. The WebSocket approach works universally (including
when weblets are opened in external browser tabs), while the MessagePort
approach is Familiar-specific and more performant.

### Weblet lifecycle in inventory

Installed weblets appear in the inventory (under "Hubs" or a new "Weblets"
group, per the `inventory-grouping-by-type` work item). Actions:

- **Click**: Open the weblet in the right panel iframe.
- **Live indicator** (from `live-reference-indicator` work item): Shows whether
  the weblet's worker is alive.
- **Cancel**: Stop the weblet's worker, close the iframe.
- **Remove**: Cancel + remove the pet name.

### Chat commands

Add commands to Chat's command registry:

- `/install <bundle-name> [--as <weblet-name>] [--powers <level>]` — install a
  weblet.
- `/open <weblet-name>` — open an installed weblet in the panel.
- `/close` — close the current weblet panel.

### Affected packages

- `packages/chat` — weblet panel UI, install flow, iframe hosting, commands
- `packages/daemon` — may need a combined "create guest + install weblet" API
  for atomicity

### Dependencies

- **familiar-gateway-migration** — weblets connect via the daemon gateway.
- **familiar-unified-weblet-server** — weblets are served from a single port.
- **inventory-grouping-by-type** — weblets benefit from being grouped in the
  inventory.

## Security Considerations

- Each weblet iframe is sandboxed. The `sandbox` attribute restricts its
  capabilities to script execution and same-origin access (to its own virtual
  host).
- Weblets cannot access Chat's DOM or capabilities. The iframe boundary
  enforces this.
- Each weblet's guest can only access capabilities explicitly endowed by the
  host user. The `NONE` power level is the safe default.
- The `localhttp://` origin isolation prevents cross-weblet data leakage
  (cookies, localStorage, etc.).
- Weblets should not be able to navigate the top-level window. The iframe
  `sandbox` attribute prevents this.

## Scaling Considerations

- Each open weblet iframe is a separate renderer process in Electron/Chromium.
  Opening many weblets simultaneously could consume significant memory.
  Consider limiting concurrent open weblets or lazy-loading iframe content.
- Weblet workers in the daemon are Node.js child processes. The daemon already
  manages worker lifecycle; no additional scaling concern.

## Test Plan

- Integration test: install a weblet via Chat, verify guest is created with
  correct powers, weblet renders in iframe.
- Integration test: weblet CapTP connection works — weblet can call methods on
  its guest powers.
- Integration test: weblet cannot access Chat's capabilities or other weblets'
  data.
- UI test: install flow dialog, power level selection, weblet panel
  open/close.
- Regression: existing Chat functionality (inbox, inventory, eval) unchanged.

## Compatibility Considerations

- Chat gains new UI elements (weblet panel, install command) but existing
  functionality is preserved.
- Weblets designed for the per-port model will work in the unified server model
  without changes (the weblet JS only cares about its own origin).

## Upgrade Considerations

- Weblets installed before this change (via CLI) won't have guest profiles.
  They'll appear as regular capabilities in the inventory without the weblet
  affordances. Users can reinstall them through Chat to get the full experience.

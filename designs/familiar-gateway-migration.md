
## What is the Problem Being Solved?

The WebSocket gateway that bridges browser clients to the Endo daemon currently
lives in `packages/chat/scripts/gateway-server.js` and is launched by the Vite
development plugin (`packages/chat/vite-endo-plugin.js`). This was appropriate
for development, but for the Familiar Electron application (and any production
deployment), the gateway must be a first-class capability of the daemon itself.

The gateway is the entry point for all browser-based CapTP connections. If it
remains in Chat, then every application that wants to connect to the daemon from
a browser must either depend on Chat or reimplement the gateway. The daemon
should own this concern.

## Description of the Design

### Move the gateway into the daemon

Relocate the gateway server logic from
`packages/chat/scripts/gateway-server.js` into the daemon package. The daemon
already has HTTP server infrastructure (`packages/daemon/src/web-server-node-powers.js`)
and WebSocket handling for weblets (`packages/daemon/src/web-server-node.js`).

The gateway becomes a built-in service of the daemon, started alongside the
Unix domain socket listener during daemon initialization
(`packages/daemon/src/daemon-node.js`).

### Gateway HTTP endpoint

The daemon's gateway listens on a configurable HTTP port (default: a
well-known port like 8920, or 0 for OS-assigned). It serves:

- **WebSocket connections** at `/` — CapTP sessions for browser clients. The
  existing gateway protocol is preserved: the client calls
  `E(gatewayBootstrap).fetch(token)` to obtain an agent reference.
- **HTTP requests** — routed to weblet virtual hosts (see
  `familiar-unified-weblet-server` work item) or returned 404 if no weblet
  matches.

### Bootstrap gateway capability

The daemon's `endoBootstrap` already exposes a `gateway()` method. The
in-daemon gateway should use this same mechanism, connecting to itself via the
internal CapTP rather than over the Unix socket.

### Update Chat for gateway-less development

With the gateway in the daemon, Chat's Vite plugin
(`packages/chat/vite-endo-plugin.js`) no longer needs to spawn a separate
gateway process. Instead, it:

1. Ensures the daemon is running (as it does today).
2. Queries the daemon for the gateway port (new CLI command or daemon info
   endpoint).
3. Injects the port and agent ID into the Vite environment.

The `packages/chat/scripts/gateway-server.js` file can be removed or retained
as a standalone debugging tool.

### CLI additions

- `endo gateway` — print the gateway WebSocket URL.
- `endo start --gateway-port <port>` — configure the gateway port at daemon
  startup.

### Affected packages

- `packages/daemon` — add gateway HTTP/WebSocket server
- `packages/chat` — remove gateway-server.js, update Vite plugin
- `packages/cli` — add `endo gateway` command, gateway port option on `start`

## Security Considerations

- The gateway currently restricts connections to localhost (127.0.0.1, ::1).
  This restriction must be preserved in the daemon implementation.
- The `fetch(token)` mechanism gates access to agent capabilities. The token is
  derived from a formula identifier and is unguessable.
- Moving the gateway into the daemon reduces the attack surface: one fewer
  process with access to the Unix socket.

## Scaling Considerations

- The gateway adds one HTTP listener to the daemon process. This is lightweight.
- Multiple browser clients can share the single gateway port.

## Test Plan

- Integration test: start daemon, connect to gateway WebSocket, fetch agent,
  list pet names.
- Integration test: Chat development server connects to daemon-hosted gateway.
- Regression: existing Chat functionality unchanged.

## Compatibility Considerations

- Chat's development workflow changes (no separate gateway process). This is a
  breaking change to the Chat dev setup, but the user experience is simpler.
- The WebSocket protocol is unchanged. Existing browser clients work without
  modification.

## Upgrade Considerations

- Daemons started before this change won't have a gateway. The CLI should
  detect this and either restart the daemon or fall back to the old gateway
  script.

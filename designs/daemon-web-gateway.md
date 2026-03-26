# Daemon Web Gateway

| | |
|---|---|
| **Created** | 2026-03-11 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |

## Status

**Implemented.** The gateway is a built-in daemon service in
`packages/daemon/src/web-server-node.js`, started as the `APPS` unconfined
guest formula in `packages/daemon/src/daemon-node.js`. Address filtering is
in `packages/daemon/src/cidr.js`. CapTP message framing is in
`packages/daemon/src/connection.js`. Chat's client-side connection is in
`packages/chat/connection.js`. The Familiar's `localhttp://` protocol
handler is in `packages/familiar/src/protocol-handler.js`.

**Design deviations:** None significant — the implementation matches the
design described below.

## What is the Problem Being Solved?

The Endo daemon communicates with the CLI over a UNIX domain socket using
netstring-framed CapTP. Browsers cannot open UNIX sockets. Chat, weblets,
and the Familiar's Electron renderer all need a web-accessible entry point
to the daemon's CapTP network. The gateway provides this as a single
HTTP+WebSocket server that multiplexes four distinct roles through one port.

## Design

### Single server, four roles

The gateway listens on `ENDO_ADDR` (default `127.0.0.1:8920`) and serves:

1. **CapTP bridge for Chat** — WebSocket connections from the Chat UI.
2. **Alternative to the UNIX socket for Familiar** — the Familiar can use
   the same WebSocket/CapTP path for its renderer process.
3. **Designated-port weblet hosting for browsers** — per-weblet HTTP
   servers on dedicated ports for conventional browser access.
4. **Virtual-host weblet hosting for Familiar** — all weblets share the
   gateway port, routed by `Host` header via the `localhttp://` custom
   protocol.

### CapTP bridge for Chat

Chat opens a WebSocket to the gateway port:

```js
const ws = new WebSocket(`ws://${gateway}/`);
ws.binaryType = 'arraybuffer';
```

The gateway creates a `GatewayBootstrap` exo with a single method:

```js
const GatewayBootstrapI = M.interface('GatewayBootstrap', {
  fetch: M.call(M.string()).returns(M.promise(M.remotable())),
});
```

Chat calls `E(gatewayBootstrap).fetch(agentId)` with the agent's 256-bit
hex formula identifier — which doubles as the bearer token — to obtain the
agent's powers over CapTP. Binary WebSocket frames carry JSON-encoded CapTP
messages (`messageToBytes` / `bytesToMessage` in `connection.js`).

A per-IP rate limiter penalizes failed `fetch()` attempts by 1 second each.
Successful fetches do not affect the rate limit. Stale entries are removed
after 10 seconds.

### Alternative to the UNIX socket for Familiar

The Familiar spawns the daemon as a detached child process and reads the
gateway address. For daemon control operations (stop, purge), it uses the
UNIX socket. For Chat UI connectivity in the Electron renderer, it connects
through the gateway port using the same WebSocket/CapTP protocol as a
browser.

### Designated-port weblet hosting for browsers

A weblet can request a dedicated port. The gateway spawns a per-weblet HTTP
server on that port, serving the weblet's content at:

```
http://127.0.0.1:<port>/<accessToken>/
```

This gives conventional browsers a navigable URL. Caveat emptor — there is
no `localhttp://` origin isolation in a regular browser. The access token
(first 32 characters of the weblet's formula ID) provides URL-level access
control but not same-origin isolation between weblets.

### Virtual-host weblet hosting for Familiar

In unified mode (the default), all weblets share the single gateway port.
Routing is by `Host` header — each weblet's access token is the virtual
hostname. The Familiar's `localhttp://` custom protocol handler intercepts
requests and proxies them:

```
localhttp://<accessToken>/path
  → http://127.0.0.1:8920/path  (with Host: <accessToken>)
```

The protocol handler injects CSP headers on the response. Each weblet gets
a unique origin (`localhttp://<accessToken>`) with full same-origin
isolation — separate cookies, localStorage, and DOM access — without
requiring DNS resolution of `*.localhost`.

WebSocket connections for weblet CapTP sessions use the same virtual-host
dispatch. When a WebSocket upgrade arrives with a `Host` header matching a
registered weblet, the gateway delegates to that weblet's `connect` handler
instead of creating a `GatewayBootstrap`.

### Weblet registration

The gateway exposes a `makeWeblet` method to the daemon:

```js
makeWeblet(webletBundle, webletPowers, requestedPort, webletId, webletCancelled)
// Returns: Far('Weblet', { getLocation, stopped })
```

Each weblet registers HTTP request and WebSocket connection handlers in a
`webletHandlers` map keyed by access token. `getLocation()` returns the
weblet's URL — either `localhttp://<accessToken>` in unified mode or
`http://127.0.0.1:<port>/<accessToken>/` in dedicated-port mode.

### Address filtering

Access control is configured via environment variables:

| Mode | Configuration | Allowed clients |
|------|--------------|----------------|
| Localhost only (default) | `ENDO_GATEWAY` unset or `''` | `127.0.0.1`, `::1`, `::ffff:127.0.0.1` |
| Remote | `ENDO_GATEWAY=remote` | All IPs (logs TLS warning) |
| CIDR allowlist | `ENDO_GATEWAY_ALLOWED_CIDRS='10.0.0.0/8,fd00::/8'` | Localhost + listed ranges |

The CIDR parser (`cidr.js`) handles IPv4, IPv6, and IPv4-mapped IPv6
address normalization.

### CapTP message framing

For WebSocket connections (gateway and weblet):

1. `messageToBytes`: `JSON.stringify(message)` → `TextEncoder` → `Uint8Array`
2. `bytesToMessage`: `Uint8Array` → `TextDecoder` → `JSON.parse`
3. Sent as binary WebSocket frames.

`makeMessageCapTP` in `connection.js` wraps `makeCapTP` with
reader/writer adapters, close tracking, and cancellation support.

For the UNIX domain socket (CLI), the same CapTP protocol is framed with
netstrings instead of WebSocket frames.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [familiar-gateway-migration](familiar-gateway-migration.md) | Moved gateway into daemon as built-in service |
| [familiar-unified-weblet-server](familiar-unified-weblet-server.md) | Virtual-host routing for weblets on shared port |
| [familiar-electron-shell](familiar-electron-shell.md) | Familiar's `localhttp://` protocol handler and daemon lifecycle |
| [gateway-bearer-token-auth](gateway-bearer-token-auth.md) | Agent ID as bearer token, rate limiting, CIDR filtering |
| [daemon-256-bit-identifiers](daemon-256-bit-identifiers.md) | 256-bit formula IDs used as access tokens |

## Affected Packages

- `packages/daemon/src/web-server-node.js` — gateway + weblet server.
- `packages/daemon/src/daemon-node.js` — `APPS` formula initialization.
- `packages/daemon/src/daemon.js` — `localGateway` Far object.
- `packages/daemon/src/connection.js` — `makeMessageCapTP`, message framing.
- `packages/daemon/src/cidr.js` — address filtering.
- `packages/chat/connection.js` — Chat gateway client.
- `packages/familiar/src/protocol-handler.js` — `localhttp://` handler.
- `packages/familiar/src/exfiltration-defense.js` — restricts non-localhttp
  requests from weblet contexts.

## Prompt

> Please summarize the design of the daemon's web gateway feature, which
> provides a mechanism for Chat to communicate with the Daemon (since it
> can't use a UNIX domain socket), an alternative to using the UNIX domain
> socket for the Familiar, hosting HTTP servers for each weblet with a
> designated port for conventional web browsers (caveat emptor), and virtual
> hosting HTTP servers for other weblets for Familiar.

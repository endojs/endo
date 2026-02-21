
## What is the Problem Being Solved?

Each weblet currently gets its own HTTP server on a dynamically assigned port
(`packages/daemon/src/web-server-node.js` calls `servePortHttp` per weblet).
This means N weblets require N listening ports, each with its own access token
in the URL path. This design doesn't work for the Familiar Electron application,
which needs to proxy all weblet traffic through a single HTTP port using a
Custom Protocol Handler (`localhttp://uniqueidentifier/...`).

For Familiar to route requests to the correct weblet, all weblets must be served
through a single HTTP server that uses the `Host` header (or path prefix, or
custom protocol identifier) to demultiplex requests to the appropriate weblet
handler.

## Description of the Design

### Single HTTP server for weblets

Replace the per-weblet `servePortHttp` pattern with a single HTTP server
managed by the daemon (or co-located with the gateway from
`familiar-gateway-migration`). This server:

- Listens on the gateway port (from `familiar-gateway-migration`).
- Uses the **Host header** to route HTTP requests to the correct weblet. Each
  weblet is identified by a unique virtual hostname:
  `<weblet-identifier>.localhost` or `<weblet-identifier>.endo.local`.
- Falls through to the gateway WebSocket handler for WebSocket upgrade requests
  that don't match a weblet.

### Virtual host routing

When a weblet is installed (`E(apps).makeWeblet(...)`), instead of binding a
new port, it registers a **request handler** and a **WebSocket connection
handler** with the unified server under a unique hostname derived from the
weblet's formula identifier:

```js
// In the unified server
const webletHandlers = new Map(); // hostname → { respond, connect }

const registerWeblet = (webletId, respond, connect) => {
  const hostname = `${webletId.slice(0, 32)}.localhost`;
  webletHandlers.set(hostname, { respond, connect });
  return hostname;
};
```

Incoming requests are routed by extracting the `Host` header:

```js
server.on('request', (req, res) => {
  const host = req.headers.host?.split(':')[0]; // strip port
  const handler = webletHandlers.get(host);
  if (handler) {
    handler.respond(req, res);
  } else {
    // Default: gateway or 404
  }
});
```

### Weblet location format

Weblet locations change from:
```
http://127.0.0.1:<random-port>/<access-token>/
```
to:
```
http://<weblet-id>.localhost:<gateway-port>/
```

Or, when accessed through Familiar's custom protocol:
```
localhttp://<weblet-id>/
```

### CapTP connection per weblet

Each weblet still gets its own CapTP session over WebSocket. The unified server
demultiplexes WebSocket upgrades by hostname and hands off to the weblet's
`connect` handler, which sets up CapTP with the weblet's specific powers.

### Backward compatibility: standalone mode

For development without Familiar (e.g., `endo install` + `endo open`), the
unified server can still be reached directly at
`http://<weblet-id>.localhost:<port>/`. Modern browsers resolve
`*.localhost` to 127.0.0.1 per RFC 6761, so no DNS configuration is needed.

Alternatively, retain the ability to spawn per-weblet servers as a fallback
when the unified server is not available.

### Changes to `makeWeblet`

The `makeWeblet` function in `packages/daemon/src/web-server-node.js` currently:
1. Receives a bundle, powers, and port.
2. Creates HTTP + WebSocket handlers.
3. Calls `servePortHttp` to bind a port.
4. Returns a `Weblet` far reference with `getLocation()`.

After this change:
1. Receives a bundle, powers, and a **server registrar** (instead of a port).
2. Creates HTTP + WebSocket handlers (same as today).
3. Registers handlers with the unified server under a virtual hostname.
4. Returns a `Weblet` far reference with `getLocation()` returning the virtual
   host URL.

### Affected packages

- `packages/daemon` — unified server, weblet registration, `web-server-node.js`
  refactor
- `packages/cli` — `endo install` and `endo open` updated for new URL format

### Dependency

- **familiar-gateway-migration** — the unified server is co-located with or
  replaces the gateway HTTP listener.

## Security Considerations

- Virtual host routing must prevent hostname spoofing. The weblet identifier
  in the hostname is derived from a formula identifier (128-char hex) and is
  unguessable.
- The unified server must enforce that WebSocket connections to a weblet
  hostname can only access that weblet's powers, not another weblet's or the
  host agent's.
- Cookies set by one weblet must not be readable by another. The `*.localhost`
  domain isolation in browsers provides this (each subdomain is a separate
  origin).

## Scaling Considerations

- A single server handling all weblets reduces resource usage (one listen
  socket instead of N).
- The `webletHandlers` map lookup is O(1) per request.
- WebSocket connections are long-lived; the unified server holds all of them.
  This is fine for typical Familiar usage (a handful of weblets).

## Test Plan

- Integration test: install two weblets, verify both are reachable on the same
  port via different hostnames.
- Integration test: WebSocket CapTP session to each weblet is isolated.
- Integration test: gateway WebSocket still works on the same port (no Host
  header or default host).
- Regression: `endo install` + `endo open` workflow works with new URL format.

## Compatibility Considerations

- Weblet URL format changes. Any stored/bookmarked weblet URLs will break.
  Since weblets are ephemeral (created per-install), this is acceptable.
- The `getLocation()` return value changes. Code that parses weblet URLs will
  need updating.
- Browser support for `*.localhost` is excellent in modern browsers (Chrome,
  Firefox, Safari all resolve it to 127.0.0.1).

## Upgrade Considerations

- Existing weblets created before this change used per-port servers. They
  will need to be reinstalled after the daemon upgrades.
- The `APPS` builtin formula may need versioning if the `makeWeblet` signature
  changes.

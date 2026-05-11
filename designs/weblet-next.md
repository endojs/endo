# Removed Weblet Implementation Reference

| | |
|---|---|
| **Created** | 2026-03-24 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Reference |

This document preserves the design of the weblet feature that was removed to
make room for its successor. It is intended as a reference for anyone
rebuilding this functionality. For the forward-looking design, see
`daemon-weblet-application.md`, `familiar-unified-weblet-server.md`, and
`familiar-chat-weblet-hosting.md`.

## Removed Files

| File | Role |
|------|------|
| `packages/daemon/src/web-server-node.js` | Unified HTTP/WebSocket server and weblet factory |
| `packages/daemon/src/web-server-node-powers.js` | HTTP server powers (port binding, WebSocket upgrade) |
| `packages/daemon/src/web-page.js` | Browser-side bootstrap (CapTP client, bundle executor) |
| `packages/daemon/src/interfaces/web.js` | `WebPageControllerInterface` Exo interface |
| `packages/daemon/src/serve-private-port-http.js` | Alternate private-port HTTP server (dead code) |
| `packages/cli/src/commands/install.js` | CLI handler for `endo install` |
| `packages/cli/src/commands/open.js` | CLI handler for `endo open` |
| `packages/cli/demo/cat.js` | Demo weblet (permission management UI, ~1065 lines) |

The `@apps` special formula was removed from `packages/daemon/src/daemon-node.js`.
The `specials` mechanism in `makeDaemon` is preserved (defaults to `{}`).

## Architecture Overview

The weblet system had four layers:

1. **CLI** (`endo install`, `endo open`) — bundled a JS file, stored it in the
   daemon, evaluated a formula that created a weblet, and optionally opened the
   resulting URL in a browser.

2. **Special formula** (`@apps`) — a `make-unconfined` formula injected by
   `daemon-node.js` that loaded `web-server-node.js` in the MAIN worker. This
   made the `@apps` pet name available in every host's store via the
   `platformNames` spread in `makePetSitter`.

3. **Unified server** (`web-server-node.js`) — a single HTTP/WebSocket server
   that served all weblets and the gateway. Weblets were registered by
   hostname, and the server dispatched requests based on the `Host` header.

4. **Browser bootstrap** (`web-page.js`) — loaded in the browser, connected
   back to the daemon over WebSocket/CapTP, received the application bundle,
   and executed it with `importBundle`.

## Detailed Component Descriptions

### 1. CLI: `endo install`

**Entry:** `packages/cli/src/endo.js` registered the `install` command.

**Handler:** `packages/cli/src/commands/install.js`

**Arguments and options:**

| Argument/Option | Description |
|-----------------|-------------|
| `[filePath]` | Path to JavaScript source file |
| `-l,--listen,--port <number>` | HTTP port for the weblet (required) |
| `-b,--bundle <bundle>` | Name of a pre-stored bundle |
| `-p,--powers <endowment>` | Powers to grant: a pet name, `@none`, `@self`, or `@endo` |
| `-n,--name <name>` | Pet name for the resulting weblet (required) |
| `-o,--open` | Open the weblet in the browser after creation |
| `-a,--as <agent>` | Pose as a named agent |

**Flow:**

1. If `filePath` is given and no `--bundle`, bundle the source with
   `bundleSource(programPath)`, encode as JSON, wrap in a `makeReaderRef`,
   and store in the daemon as a temporary blob named
   `tmp-bundle-<random-hex>`.

2. Authenticate with the daemon via `withEndoAgent`.

3. Store the bundle blob: `E(agent).storeBlob(bundleReaderRef, bundleName)`.

4. Evaluate the weblet creation expression in the MAIN worker:

   ```js
   E(agent).evaluate(
     '@main',
     `E(apps).makeWeblet(bundle, powers, ${requestedPort}, $id, $cancelled)`,
     ['apps', 'bundle', 'powers'],
     ['@apps', bundleName, powersName],
     parsePetNamePath(webletName),
   )
   ```

   The `$id` and `$cancelled` variables are injected by the daemon's eval
   formula. `$id` is the formula identifier for the eval result; `$cancelled`
   is a promise that rejects when the formula is cancelled.

5. Retrieve the URL: `E(weblet).getLocation()`.

6. Optionally open in browser with the `open` npm package.

7. Clean up the temporary bundle: `E(agent).remove(temporaryBundleName)`.

### 2. CLI: `endo open`

**Handler:** `packages/cli/src/commands/open.js`

Looked up the weblet by pet name, called `E(weblet).getLocation()`, printed
the URL, and opened it in the default browser.

### 3. Special Formula: `@apps`

Defined in `daemon-node.js`:

```js
'@apps': ({ MAIN, ENDO }) => ({
  type: 'make-unconfined',
  worker: MAIN,
  powers: ENDO,
  specifier: new URL('web-server-node.js', import.meta.url).href,
  env: {
    ENDO_ADDR: process.env.ENDO_ADDR || '127.0.0.1:8920',
    ENDO_WEB_PAGE_BUNDLE_PATH: process.env.ENDO_WEB_PAGE_BUNDLE_PATH || '',
    ENDO_GATEWAY: process.env.ENDO_GATEWAY || '',
    ENDO_GATEWAY_ALLOWED_CIDRS: process.env.ENDO_GATEWAY_ALLOWED_CIDRS || '',
  },
}),
```

The `specials` mechanism in `makeDaemon` (in `daemon.js`) preformulated this
at startup:

```js
const builtins = { NONE: leastAuthorityId, MAIN: mainWorkerId };
const platformNames = Object.fromEntries(
  await Promise.all(
    Object.entries(specials).map(async ([specialName, makeFormula]) => {
      const formula = makeFormula(builtins);
      const { id } = await preformulate(specialName, formula);
      return [specialName, id];
    }),
  ),
);
```

The resulting `platformNames` (e.g., `{ '@apps': <formulaId> }`) were spread
into each host's `PetSitter` special store, making `@apps` a reserved name
resolvable in any host context alongside `@agent`, `@self`, `@main`, etc.

### 4. Unified Server: `web-server-node.js`

This was the most complex component. It exported a `make` function (the
`make-unconfined` caplet convention) that returned a `WebletService` Far
object.

**Initialization:**

- Parsed `ENDO_ADDR` to determine the HTTP bind address and port (default
  `127.0.0.1:8920`).
- Built the `web-page.js` browser bootstrap into a bundle string using
  `@endo/compartment-mapper/bundle.js`. Alternatively, read a pre-built
  bundle from `ENDO_WEB_PAGE_BUNDLE_PATH`.
- Obtained a `gateway` reference from `E(powers).gateway()`.
- Created a single `http.createServer()` and `WebSocketServer` that served
  all weblets and the gateway on one port.

**Request dispatch:**

- HTTP requests were dispatched based on the `Host` header hostname.
- If the hostname matched a registered weblet handler, the request was
  delegated to that weblet's `respond` function.
- Otherwise, the default handler returned a plain-text "Endo Gateway" page.

**WebSocket dispatch:**

- WebSocket connections followed the same `Host`-based dispatch.
- Weblet connections were delegated to the weblet's `connect` handler.
- Non-weblet connections received a `GatewayBootstrap` exo that exposed
  a `fetch(token)` method for token-based capability retrieval, with
  per-IP rate limiting on failures.

**CapTP session helper:**

```js
const openCapTPSession = (name, frameWriter, frameReader, sessionCancelled, bootstrap) => {
  const messageWriter = mapWriter(frameWriter, messageToBytes);
  const messageReader = mapReader(frameReader, bytesToMessage);
  const { closed, getBootstrap } = makeMessageCapTP(
    name, messageWriter, messageReader, sessionCancelled, bootstrap,
  );
  const remoteBootstrap = getBootstrap();
  E.sendOnly(remoteBootstrap).ping();
  return { connectionNumber, capTpClosed: closed, remoteBootstrap };
};
```

This used `@endo/stream` `mapWriter`/`mapReader` to convert between byte
frames and CapTP messages, wrapping `makeMessageCapTP` from `connection.js`.

**CIDR-based access control:**

When `ENDO_GATEWAY=remote` was set, the server accepted non-local connections.
`ENDO_GATEWAY_ALLOWED_CIDRS` specified allowed IP ranges. The `makeAddressChecker`
from `cidr.js` validated `remoteAddress` on each WebSocket connection.

**Rate limiting:**

A per-IP rate limiter (`makeRateLimiter(1000)`) penalized failed
`gateway.provide(token)` calls with a 1-second delay on subsequent attempts.
State per key was a single timestamp (next allowed attempt time), with lazy
sweeping of stale entries.

### 5. Weblet Factory: `makeWeblet`

Called as `E(apps).makeWeblet(bundle, powers, port, id, cancelled)`.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `webletBundle` | object | Bundle with a `.json()` method returning the bundle string |
| `webletPowers` | object | Capabilities to pass to the application |
| `requestedPort` | number or undefined | Dedicated port, or undefined for unified server |
| `webletId` | string | Formula identifier for this weblet |
| `webletCancelled` | Promise\<never\> | Rejects when the weblet is cancelled |

**Access token:** First 32 characters of the weblet's formula ID.

**Two serving modes:**

1. **Dedicated port** (when `requestedPort` is defined): Started a separate
   HTTP server via `servePortHttp` on the requested port. Used
   path-prefix-based isolation: `/{accessToken}/`.

2. **Unified server** (when `requestedPort` is undefined): Registered
   `respond` and `connect` handlers in the `webletHandlers` map keyed by
   `accessToken` as the hostname. Electron's custom protocol handler sent the
   bare access token as the `Host` header.

**HTTP handler (`respond`):**

- `GET /{prefix}/` returned a minimal HTML page with `<script
  src="bootstrap.js"></script>`.
- `GET /{prefix}/bootstrap.js` returned the pre-built `web-page.js` bundle.
- Everything else returned 404.

**WebSocket handler (`connect`):**

1. Validated the URL against the access token (dedicated port mode only).
2. Opened a CapTP session with no local bootstrap (the browser was the
   bootstrap provider).
3. Called `E(webletBootstrap).makeBundle(await E(webletBundle).json(), webletPowers)`
   to send the application bundle and powers to the browser.
4. Tracked the connection for graceful shutdown.

**Return value:**

```js
Far('Weblet', {
  getLocation: async () => {
    // Dedicated: `http://127.0.0.1:${port}/${accessToken}/`
    // Unified:   `localhttp://${accessToken}`
  },
  stopped: () => stopped,
})
```

### 6. Browser Bootstrap: `web-page.js`

This ran in the browser. It was bundled at server startup using
`@endo/compartment-mapper/bundle.js` and served as `/bootstrap.js`.

**Initialization:**

1. Imported `@endo/init/debug.js` to establish the SES lockdown.
2. Created hardened endowments: `E`, `Far`, `makeExo`, `M`, `TextEncoder`,
   `TextDecoder`, `URL`.
3. Collected all `window` properties via prototype chain traversal
   (`getPrototypeChain` + `collectPropsAndBind`), binding methods to
   `window`. Excluded `undefined`, `NaN`, `Infinity` to avoid conflicts
   with Compartment globals.
4. Froze the combined endowments object.

**CapTP connection:**

1. Derived the WebSocket URL from `window.location.href` by changing the
   protocol to `ws:`.
2. Created a `WebSocket` with `binaryType = 'arraybuffer'`.
3. On `open`, instantiated `makeCapTP('WebClient', send, bootstrap)` where
   `bootstrap` was the local `EndoWebPageForServer` exo.
4. Routed `message` events through `dispatch` and `close` through `abort`.

**Bootstrap exo (`EndoWebPageForServer`):**

Implemented `WebPageControllerInterface` (passable default guards):

- **`ping()`**: Logged "received ping", returned "pong". Used as a
  heartbeat by the server.
- **`makeBundle(bundle, powers)`**: Called `importBundle(bundle, { endowments })`
  to load the application in a new Compartment, then called `namespace.make(powers)`
  to start it.
- **`reject(message)`**: Replaced the page body with an error message.

**Message encoding:**

- Outgoing: `JSON.stringify(message)` → `TextEncoder.encode` → `ws.send` (binary).
- Incoming: `TextDecoder.decode(event.data)` → `JSON.parse` → `dispatch`.

This used `@endo/captp`'s `makeCapTP` directly (not `makeMessageCapTP` from
`connection.js`), because the browser had no access to the daemon's stream
utilities.

### 7. HTTP Server Powers: `web-server-node-powers.js`

Provided `servePortHttp`, a utility for binding an HTTP server to a port
with optional HTTP response and WebSocket connection handlers.

**`servePortHttp({ port, host, respond, connect, cancelled })`:**

1. Created `http.createServer()`.
2. If `respond` provided: registered a `request` handler that called
   `respond(harden({ method, url, headers }))`, then wrote the response
   status, headers, and content (string, `Uint8Array`, or async iterable)
   to the Node.js `res` object.
3. If `connect` provided: created a `WebSocketServer({ server })` and
   on each connection:
   - Created a `makePipe()` reader/sink pair for incoming frames.
   - Created a writer that called `socket.send(bytes, { binary: true })`.
   - Called `connect(harden({ reader, writer, closed }), harden({ method, url, headers }))`.
4. Called `server.listen(port, host)`.
5. Registered cancellation to close the server.
6. Resolved with the assigned port number.

### 8. Private Port Server: `serve-private-port-http.js`

This was **dead code** — not imported by anything at the time of removal.
It was an earlier iteration of the weblet server that served the daemon's
own management UI on a private port.

It served:
- `GET /` — a minimal HTML page loading `bootstrap.js`.
- `GET /bootstrap.js` — fetched via `E(endoBootstrap).webPageJs()`.

On WebSocket connections, it:
1. Parsed the `Host` header for `{formulaNumber}.endo.localhost:{port}`.
2. Validated the port number matched.
3. Called `E(endoBootstrap).importAndEndowInWebPage(webBootstrap, formulaNumber)`
   to deliver the application to the browser.

### 9. Demo Weblet: `cat.js`

A ~1065-line demonstration weblet implementing a permission management UI
("Familiar Chat"). It:

- Rendered a message inbox showing requests from guests.
- Allowed resolving or rejecting requests by entering pet names.
- Used `E(powers)` for daemon interaction (listing, looking up, following
  inbox changes).
- Demonstrated async iteration over message streams with `makeRefIterator`.
- Showed DOM manipulation patterns compatible with the weblet endowment set.

Usage:
```
endo install cat.js --powers @agent --listen 8920 --name cat
endo open cat
```

## Patterns Worth Preserving

### The `specials` extension point

The mechanism for injecting platform-specific formulas via `specials` in
`makeDaemon` is clean and general. The new web application formula can reuse
it. The key insight is that special names become available in every host's
pet store via `makePetSitter`, making them first-class daemon capabilities
without requiring per-host configuration.

### CapTP over WebSocket

The `makeMessageCapTP` wrapper in `connection.js` (not removed) combined
with `mapWriter(frameWriter, messageToBytes)` and `mapReader(frameReader,
bytesToMessage)` provides a clean abstraction for CapTP over any byte
stream. The `openCapTPSession` helper in `web-server-node.js` showed how
to set this up with connection tracking and a heartbeat ping.

### Hostname-based dispatch

The unified server's `webletHandlers` map keyed by hostname demonstrated
how a single HTTP server can multiplex many applications. The pattern of
registering `{ respond, connect }` handler pairs per hostname, with
cleanup on cancellation, is directly reusable.

### Access token derivation

Deriving the access token from the formula ID (first 32 chars) provided
a deterministic, unforgeable token without additional state. For dedicated
ports this was used as a path prefix; for the unified server it was the
hostname key. The new design should consider whether hostname-only
isolation (via port or virtual host) eliminates the need for explicit
tokens.

### Rate limiting for gateway fetch

The `makeRateLimiter` pattern (per-key next-allowed timestamp with lazy
sweeping) is a minimal, zero-dependency rate limiter suitable for
protecting capability-granting endpoints.

### Connection lifecycle tracking

The pattern of maintaining a `connectionClosedPromises` set and awaiting
all on cancellation ensured graceful shutdown. Each connection tracked
both its transport close and its CapTP close:

```js
trackConnection(
  Promise.race([connectionClosed, capTpClosed]),
  `Closed connection ${connectionNumber}`,
);
```

### Browser endowment collection

`collectPropsAndBind(window)` traversed the prototype chain, bound
methods to `window`, and excluded Compartment-conflicting globals. This
is necessary for any future code that needs to provide a browser-like
endowment set to a Compartment-based sandbox.

## Note on the Next Rendition

The next iteration may use a special named `@webs` — a directory where each
entry is a registered local HTTP web application, keyed by pet name. Each
entry would combine some powers with a readable filesystem, producing a
served web application.

The filesystem should probably be restricted to a `readable-tree` so that
the content address can be passed to a static file server. A readable-tree
is immutable and content-addressed, which means the server can serve files
without needing ongoing access to mutable storage — it just needs the tree's
formula identifier.

A future version of the web application formula might also capture
properties for **static and dynamic routing rules** and **dynamic content**,
allowing applications to define server-side behavior beyond static file
serving. For the first pass, static serving from a readable-tree is
sufficient.

## Prompt

> Remove the "install" command in the CLI and the "weblet" feature in the
> daemon. Leave a design, based on insights about the current design, about
> how to reconstruct this feature. Capture a detailed description of the
> erstwhile weblet design, such that the portions we have abandoned can be
> reused.

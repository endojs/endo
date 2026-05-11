
## Status

**Partially implemented.** The Familiar-side infrastructure is in place:

- `packages/familiar/src/protocol-handler.js` — `localhttp://` scheme
  registration and request handler with CSP injection. (Layers 1)
- `packages/familiar/src/navigation-guard.js` — `will-navigate` and
  `setWindowOpenHandler` interception with confirmation dialog. (Layer 4)
- `packages/familiar/src/exfiltration-defense.js` — command-line flags,
  DNS poisoning, request interception, permission handler, and runtime
  verification. (Layers 2, 3, 5)
- `packages/familiar/electron-main.js` — integrates all modules: registers
  scheme before app ready, installs handler and defenses after app ready,
  sends security warnings to renderer via IPC.
- `packages/familiar/preload.js` — exposes `onSecurityWarnings` callback.

**Not yet implemented:**

- Layer 6 (iframe sandbox attributes) — applied by Chat when creating weblet
  iframes (see `familiar-chat-weblet-hosting`).
- MessagePort bridge — Chat-side WebSocket-to-MessagePort bridging for weblet
  CapTP connections.
- Chat security warning banner — renderer-side display of warnings from the
  `familiar:security-warnings` IPC channel.

**Design deviations from implementation:**

- The implementation splits the exfiltration defense code into a dedicated
  `src/exfiltration-defense.js` module rather than inlining it in
  `electron-main.js`. The design's `src/navigation-guard.js` is also a
  separate module as described.
- The Host header sent to the gateway uses the bare weblet ID (access token),
  not `<weblet-id>.localhost`. This matches the daemon's unified server
  implementation which registers handlers keyed by the bare access token
  (`webletHandlers.set(accessToken, ...)`).

## What is the Problem Being Solved?

The Familiar Electron shell must serve weblet content to iframe guests without
exposing the daemon's gateway port or allowing guest pages to make arbitrary
network requests. Today, Chat loads directly from `file://` or
`http://127.0.0.1:5173` (Vite dev server), and weblets are not yet hosted
inside the Familiar at all.

Three problems arise:

1. **Origin isolation.** Every weblet needs a unique origin so browser security
   guarantees (same-origin policy, cookie jars, localStorage) keep weblets
   isolated from each other and from Chat. A `file://` URL has a null origin
   and provides no isolation.

2. **Network confinement.** A guest page running arbitrary code must not be able
   to send HTTP requests, open WebSocket connections, or trigger DNS lookups to
   external hosts. Without confinement, a compromised or malicious guest can
   exfiltrate data via fetch, image loads, DNS prefetch, or WebSocket to an
   attacker-controlled server.

3. **Navigation confinement.** Hyperlinks in guest content or in Chat itself
   must not silently navigate the Electron window away from the application.
   Off-origin links should only open in the system browser after the user
   explicitly confirms.

## Description of the Design

### `localhttp://` custom protocol

Register `localhttp` as a custom protocol scheme in Electron's main process.
The scheme gives each weblet a unique origin of the form
`localhttp://<weblet-id>/` and routes all HTTP-like traffic through the
protocol handler, which proxies to the daemon's gateway on 127.0.0.1:8920.

#### Registration

Register the scheme at startup with `protocol.handle` (Electron ≥ 25):

```js
import { protocol, session } from 'electron';

// Register as a privileged scheme before app is ready.
// "standard" gives it URL parsing like http (host, path, query).
// "secure" lets it access secure-context APIs (crypto.subtle, etc.).
// "supportFetchAPI" allows fetch() from renderer to this scheme.
// "corsEnabled" allows CORS requests within the scheme.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'localhttp',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
```

#### Request handling

After `app.whenReady()`, register the handler:

```js
protocol.handle('localhttp', async request => {
  const url = new URL(request.url);
  const webletId = url.hostname;
  const pathAndQuery = url.pathname + url.search;

  // Proxy to the daemon's unified gateway server.
  const target = `http://127.0.0.1:${gatewayPort}${pathAndQuery}`;
  const proxyResponse = await fetch(target, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers.entries()),
      Host: webletId,
    },
    body: request.body,
  });

  // Inject Content-Security-Policy on every response.
  const headers = new Headers(proxyResponse.headers);
  headers.set('Content-Security-Policy', cspDirectives);

  return new Response(proxyResponse.body, {
    status: proxyResponse.status,
    statusText: proxyResponse.statusText,
    headers,
  });
});
```

Chat does **not** use the `localhttp://` scheme. In dev mode, Chat loads from
the Vite dev server (`http://127.0.0.1:<vite-port>`). In production mode, Chat
loads from `file://` (the built dist bundled in the Electron app). Only weblet
iframes use `localhttp://` origins.

#### Content-Security-Policy

The protocol handler injects a CSP header on every response. The policy allows
a weblet to evaluate arbitrary code but denies it the ability to send requests
anywhere outside its own origin:

```
default-src 'self';
script-src  'self' 'unsafe-inline' 'unsafe-eval';
style-src   'self' 'unsafe-inline';
connect-src 'self';
img-src     'self' data: blob:;
media-src   'self' blob:;
font-src    'self' data:;
frame-src   'self';
object-src  'none';
base-uri    'self';
form-action 'self';
```

Key properties:

- `script-src 'unsafe-eval'` — weblets can run `eval()`, `new Function()`,
  etc. This is required for SES lockdown's `eval`-based module loader.
- `connect-src 'self'` — `fetch()`, `XMLHttpRequest`, `WebSocket`, and
  `EventSource` are restricted to the page's own origin. Since the origin is
  `localhttp://<weblet-id>`, the browser will block any attempt to reach
  `http://`, `https://`, or `ws://` URLs.
- `form-action 'self'` — prevents form submissions to external URLs.
- `object-src 'none'` — blocks plugins (Flash, Java applets, etc.).

Chat is not served through `localhttp://` and is not subject to this CSP.
Chat connects to the daemon gateway via its own WebSocket from its `file://`
or `http://` origin. Only weblet iframes receive the restrictive CSP.

### WebSocket bridging via MessagePort

Electron's `protocol.handle` does not intercept WebSocket upgrade requests.
Weblet iframes served on `localhttp://<weblet-id>/` cannot open a raw
WebSocket to the daemon gateway because (a) the CSP blocks `ws://` connect-src
and (b) the protocol handler wouldn't intercept it anyway.

Instead, Chat bridges WebSocket connections to the daemon using MessagePorts
transferred into weblet iframes.

#### Flow

```
┌─────────────────────────────┐      MessagePort       ┌────────────────────┐
│  Chat (file:// or http://)  │◄═══════════════════════►│  Weblet iframe     │
│                             │  ArrayBuffer transfers  │  (localhttp://     │
│  1. Creates MessageChannel  │                         │   <weblet-id>/)    │
│  2. Opens ws:// to gateway  │                         │                    │
│     with Host: <weblet-id>  │                         │  Receives port     │
│  3. Bridges ws ↔ port       │                         │  Runs CapTP over   │
│                             │                         │  MessagePort       │
└─────────────────────────────┘                         └────────────────────┘
         │
         │ ws://127.0.0.1:8920/
         ▼
┌─────────────────────────────┐
│  Daemon gateway             │
│  (routes by Host header     │
│   to weblet handler)        │
└─────────────────────────────┘
```

1. When Chat opens a weblet iframe, it creates a `MessageChannel`.
2. Chat transfers `port2` to the weblet iframe via
   `iframe.contentWindow.postMessage({ type: 'endo:captp-port' }, '*', [port2])`.
3. Chat opens a WebSocket to `ws://127.0.0.1:${gatewayPort}/` with a `Host`
   header set to the weblet identifier.
4. Chat pumps marshaled CapTP messages bidirectionally as `ArrayBuffer`
   transfers (zero-copy): `port1.onmessage → ws.send(buffer)` and
   `ws.onmessage → port1.postMessage(buffer, [buffer])`. The `[buffer]`
   transfer list moves ownership of the ArrayBuffer rather than copying it.
5. The weblet's JavaScript receives the port and runs CapTP over it, treating
   the MessagePort as its transport. Messages are `ArrayBuffer` containing
   marshaled CapTP frames. The weblet never opens a network connection itself.

#### Weblet bootstrap

The weblet's served HTML includes a small bootstrap script that waits for the
MessagePort:

```js
window.addEventListener('message', event => {
  if (event.data?.type === 'endo:captp-port') {
    const port = event.ports[0];
    // Initialize CapTP over this MessagePort
    startCapTP(port);
  }
});
```

This is the only communication channel the weblet has to the outside world.
The CSP ensures it cannot open any network connections independently.

### Navigation delegate

All navigation away from the Familiar's expected origins must be intercepted.
This prevents guest content from silently redirecting the Electron window to
an external site, and ensures users consciously choose to leave the
application.

#### Implementation

Use Electron's `will-navigate` event on the `webContents` and
`setWindowOpenHandler` for new-window requests:

```js
// Chat loads from file:// (production) or http://127.0.0.1:vitePort (dev).
// Both are allowed origins. localhttp:// weblet origins are also allowed
// (they are confined by CSP and sandbox, not by the navigation delegate).
const allowedProtocols = new Set([
  'file:',
  'localhttp:',
]);

// Intercept in-window navigation (e.g., clicking a link, JS location change)
win.webContents.on('will-navigate', (event, navigationUrl) => {
  const target = new URL(navigationUrl);

  if (allowedProtocols.has(target.protocol)) {
    return; // Allow navigation within the app
  }
  // In dev mode, allow navigation to the Vite dev server
  if (isDevMode && target.origin === `http://127.0.0.1:${vitePort}`) {
    return;
  }

  // Block the navigation
  event.preventDefault();

  // Prompt user and open in system browser if confirmed
  promptExternalNavigation(navigationUrl);
});

// Intercept window.open() and target="_blank" links
win.webContents.setWindowOpenHandler(({ url }) => {
  const target = new URL(url);
  if (target.protocol === 'localhttp:') {
    return { action: 'allow' };
  }
  promptExternalNavigation(url);
  return { action: 'deny' };
});
```

#### Confirmation dialog

```js
import { dialog, shell } from 'electron';

const promptExternalNavigation = async url => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Open in Browser', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Open External Link',
    message: 'This link will open in your system web browser.',
    detail: url,
  });
  if (response === 0) {
    shell.openExternal(url);
  }
};
```

#### Webview and iframe navigation

For weblet iframes (which run in the same renderer process), navigation is
already confined by the iframe `sandbox` attribute and the CSP. The
`will-navigate` handler on the main webContents covers top-level navigation
attempts. Weblet iframes should include `sandbox="allow-scripts
allow-same-origin"` without `allow-top-navigation` to prevent them from
navigating the top-level window.

### Exfiltration defense: defense in depth

A malicious guest page could attempt to exfiltrate data through multiple
channels. The Familiar applies redundant mitigations to each channel. Where a
channel cannot be conclusively blocked, the Familiar detects this at runtime
and warns the user.

#### Layer 1: Content-Security-Policy (network requests)

The CSP on `localhttp://` responses (described above) blocks `fetch()`,
`XMLHttpRequest`, `WebSocket`, `EventSource`, form submissions, and resource
loads (`<img>`, `<script>`, `<link>`, etc.) to any origin other than `'self'`.
This is the primary network confinement mechanism.

#### Layer 2: Electron request interception

Use `session.defaultSession.webRequest.onBeforeRequest` to intercept and
block any request from a `localhttp://` page that targets an external URL.
This catches requests that might bypass CSP (e.g., service worker fetch,
navigation requests, or future browser features not yet governed by CSP):

```js
session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
  const requestUrl = new URL(details.url);
  const initiator = details.referrer || details.url;

  // Allow all requests from non-localhttp origins (Chat itself).
  if (!initiator.startsWith('localhttp://')) {
    callback({ cancel: false });
    return;
  }

  // Allow requests to the localhttp scheme (handled by protocol handler).
  if (requestUrl.protocol === 'localhttp:') {
    callback({ cancel: false });
    return;
  }

  // Block everything else from localhttp origins.
  console.warn(
    `[Security] Blocked request from ${initiator} to ${details.url}`,
  );
  callback({ cancel: true });
});
```

#### Layer 3: DNS poisoning (DNS prefetch and speculative connects)

Chromium performs DNS prefetching for hostnames found in page content, even
when the page does not navigate to them. A malicious guest page could encode
exfiltrated data as subdomain labels (e.g.,
`stolen-data.attacker.example.com`) and rely on DNS prefetch to transmit
the data without making any HTTP request.

**Invalid DNS-over-HTTPS configuration:**

```js
app.configureHostResolver({
  secureDnsMode: 'secure',
  // An invalid DoH endpoint that will fail all DNS resolution.
  // Only 127.0.0.1 literal addresses (used by the gateway proxy)
  // bypass DNS, so the app continues to function.
  secureDnsServers: ['https://invalid.localhost/dns-query'],
});
```

In `secure` mode, Chromium will *only* use the configured DoH servers and
will not fall back to the system DNS resolver. Since
`https://invalid.localhost/dns-query` is unreachable, all DNS resolution
fails. This is acceptable because:

- The gateway proxy uses `127.0.0.1` (a literal IP, no DNS needed).
- `localhttp://` URLs are handled by the protocol handler (no DNS).
- `file://` URLs require no DNS.
- External links are opened in the system browser (which has its own DNS).

**Chromium command-line flags (redundant, belt-and-suspenders):**

```js
// Disable DNS prefetching explicitly
app.commandLine.appendSwitch('disable-features',
  'DnsOverHttpsUpgrade,AsyncDns');
app.commandLine.appendSwitch('no-pings');
// Map all hostnames to NOTFOUND, except literal IPs which bypass the resolver
app.commandLine.appendSwitch(
  'host-resolver-rules',
  'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
);
```

The `--host-resolver-rules` flag provides a definitive block: any hostname
that reaches the resolver is mapped to NOTFOUND, while literal IP addresses
(`127.0.0.1`) are excluded from the rule and resolve normally.

#### Layer 4: Navigation delegate (described above)

Prevents the window from navigating to external URLs.

#### Layer 5: WebRTC disabled

WebRTC ICE candidate gathering is a viable exfiltration channel: a guest page
can create an `RTCPeerConnection`, add ICE candidates containing encoded data
in the `ufrag` field, and trigger STUN/TURN requests to attacker-controlled
servers — bypassing CSP entirely since WebRTC traffic is not governed by CSP
directives.

Disable WebRTC globally at startup via Electron's `webPreferences` or
command-line flags:

```js
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy',
  'disable_non_proxied_udp');
```

Additionally, use `session.defaultSession.setPermissionRequestHandler` to deny
WebRTC-related permissions by default:

```js
session.defaultSession.setPermissionRequestHandler(
  (webContents, permission, callback) => {
    // Deny media (camera/mic) and other permissions from localhttp origins.
    const url = webContents.getURL();
    if (url.startsWith('localhttp://')) {
      callback(false);
      return;
    }
    callback(true);
  },
);
```

In the future, specific `localhttp://` origins can be allowlisted for WebRTC
by checking the hostname in the permission handler and maintaining a set of
origins granted WebRTC access by the user.

#### Layer 6: iframe sandbox

Weblet iframes use `sandbox="allow-scripts allow-same-origin"` without
`allow-top-navigation`, `allow-popups`, or `allow-popups-to-escape-sandbox`.
This prevents the iframe from opening new windows, navigating the parent,
or escaping its sandbox.

#### Runtime verification and user notification

At startup, the Familiar runs a one-time verification of each defense layer.
If a layer cannot be confirmed (e.g., `app.configureHostResolver` is not
available in the Electron version, or a command-line flag is not recognized),
the Familiar sends a list of warnings to the renderer, which displays them
as a non-blocking banner at the top of the Chat UI.

**Main process (verification):**

```js
const verifyExfiltrationDefenses = async () => {
  const warnings = [];

  // Verify DNS poisoning is active by attempting a resolution.
  // dns.resolve('canary.exfiltration-test.invalid', ...) should fail.
  // If it succeeds, DNS is leaking.
  try {
    await dns.promises.resolve('canary.exfiltration-test.invalid');
    // Resolution succeeded unexpectedly — DNS is leaking.
    warnings.push(
      'DNS resolution succeeded unexpectedly. ' +
      'DNS-based exfiltration may be possible.',
    );
  } catch {
    // Expected: resolution should fail.
  }

  // Verify host-resolver-rules flag was accepted.
  if (!app.commandLine.hasSwitch('host-resolver-rules')) {
    warnings.push(
      'host-resolver-rules flag not set. ' +
      'DNS prefetch may not be fully blocked.',
    );
  }

  return warnings;
};
```

**Renderer notification (via IPC):**

The main process sends warnings to the renderer via the existing preload
bridge. The Chat UI displays them as a dismissible yellow banner. This
banner is only shown when running inside the Familiar (detected via the
`window.familiar` API exposed by the preload script). In dev mode (Vite
server without Electron), `window.familiar` is undefined and no banner
appears.

```js
// In preload.js, expose a new IPC channel:
contextBridge.exposeInMainWorld('familiar', {
  // ... existing methods ...
  onSecurityWarnings: callback =>
    ipcRenderer.on('familiar:security-warnings', (_event, warnings) =>
      callback(warnings)),
});

// In electron-main.js, after verification:
const warnings = await verifyExfiltrationDefenses();
if (warnings.length > 0) {
  mainWindow.webContents.send('familiar:security-warnings', warnings);
}
```

#### Research needed

- Verify that `app.configureHostResolver` with an unreachable DoH server
  prevents *all* DNS queries (including prefetch, speculative connects, and
  OCSP checks) in Electron's network stack.
- Confirm that literal IP addresses (`127.0.0.1`) bypass the
  `--host-resolver-rules` MAP and the DoH path entirely.
- Test whether `ses.setProxy({ proxyRules: 'direct://' })` provides
  additional DNS isolation by preventing proxy-based DNS leaks.
- Determine whether `<a ping="...">` hyperlink auditing bypasses the CSP
  `connect-src` directive (the `--no-pings` flag should cover this, but
  verify).

### Affected packages

- `packages/familiar/electron-main.js` — protocol registration, navigation
  delegate, DNS configuration **(implemented)**
- `packages/familiar/src/protocol-handler.js` — `localhttp://` handler and
  CSP injection **(implemented)**
- `packages/familiar/src/navigation-guard.js` — navigation interception and
  external link confirmation **(implemented)**
- `packages/familiar/src/exfiltration-defense.js` — command-line flags, DNS
  poisoning, request interception, permission handler, runtime verification
  **(implemented)**
- `packages/familiar/preload.js` — `onSecurityWarnings` IPC bridge
  **(implemented)**
- `packages/chat/` — weblet iframe hosting: MessagePort creation, WebSocket
  bridging, port transfer to iframes **(not yet implemented)**

### Dependencies

- **familiar-unified-weblet-server** — the daemon's gateway must route HTTP
  requests by Host header to the correct weblet handler.
- **familiar-gateway-migration** — the gateway must be a built-in daemon
  service on port 8920.
- **familiar-chat-weblet-hosting** — Chat hosts weblet iframes and must
  implement the MessagePort bridge.

## Security Considerations

- The `localhttp://` scheme provides per-weblet origin isolation. Each weblet
  has a unique origin (`localhttp://<weblet-id>`) and cannot read another
  weblet's cookies, localStorage, or DOM.
- Six defense layers (CSP, request interception, DNS poisoning, navigation
  delegate, WebRTC disabled, iframe sandbox) provide redundant exfiltration
  prevention. Each layer independently blocks a category of exfiltration; a
  guest would need to bypass all of them simultaneously.
- The MessagePort bridge is the only communication path from a weblet to the
  daemon. It is mediated by Chat, which controls which gateway WebSocket
  each port connects to. Messages are marshaled CapTP frames as ArrayBuffers,
  not arbitrary data.
- Chat runs from `file://` (production) or Vite dev server (development) and
  is not subject to the `localhttp://` CSP. Chat is trusted first-party code.
- The navigation delegate prevents clickjacking attacks where a guest page
  tricks the user into navigating to a phishing site.
- Runtime verification checks that each defense layer is functioning. If any
  layer cannot be confirmed, the user is notified of the specific risk so
  they can make an informed decision about running untrusted weblets.

## Scaling Considerations

- The `protocol.handle` callback runs in Electron's main process. Heavy
  weblet traffic (large file downloads, streaming) could block the main
  process event loop. If this becomes a problem, the proxy could be moved
  to a utility process.
- Each open weblet iframe adds a renderer process. Memory usage scales with
  the number of concurrent weblets.
- The MessagePort bridge adds one WebSocket per open weblet iframe. The
  daemon gateway already handles multiple concurrent WebSocket connections.

## Test Plan

- **Protocol handler**: Load a weblet via `localhttp://<id>/`, verify it
  renders and is proxied to the daemon gateway.
- **Weblet isolation**: Open two weblet iframes on different
  `localhttp://<id>/` origins, verify they cannot read each other's
  localStorage or cookies.
- **CSP enforcement**: From a weblet iframe, attempt `fetch('https://example.com')`,
  verify it is blocked by CSP. Attempt `new WebSocket('ws://example.com')`,
  verify blocked.
- **MessagePort bridge**: Open a weblet iframe, verify CapTP session
  establishes over the MessagePort and the weblet can call methods on its
  guest powers.
- **Navigation delegate**: Click an `https://` link in Chat content, verify a
  confirmation dialog appears and the link opens in the system browser (not
  in the Electron window).
- **DNS prevention**: From a weblet, create an `<img>` tag pointing to
  `http://exfil-test.attacker.example/pixel.gif`, verify no DNS query is
  made (monitor with `tcpdump` or similar).

## Compatibility Considerations

- The `localhttp://` scheme is Familiar-specific. In browser-based development
  (Vite dev server), weblets use `http://<id>.localhost:<port>/` URLs as
  described in `familiar-unified-weblet-server`. Chat must support both URL
  schemes for weblet iframes.
- The MessagePort bridge is only needed inside Familiar (where CSP blocks raw
  WebSocket). In browser development, weblets connect via WebSocket directly.
  The weblet bootstrap script should detect which transport is available.
- The navigation delegate only applies in the Electron context. The Chat web
  app running in a regular browser relies on normal browser navigation
  behavior.

## Upgrade Considerations

- The `localhttp://` scheme is registered at Electron startup. Changing the
  scheme name in a future version would break any persisted weblet URLs (e.g.,
  in bookmarks or history). The scheme name should be considered stable.
- The CSP policy may need revision as new browser features emerge. It should
  be reviewed with each Electron major version upgrade.

## Open Questions

(None remaining.)

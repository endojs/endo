# Familiar Electron Shell

| | |
|---|---|
| **Date** | 2026-02-14 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Complete |

## Status

**Mostly implemented.** The core Electron shell is functional:

- `packages/familiar/electron-main.js` — daemon lifecycle, window creation,
  menu, IPC handlers, `localhttp://` protocol, navigation guard, exfiltration
  defenses.
- `packages/familiar/src/daemon-manager.js` — daemon start/restart/purge.
- `packages/familiar/src/gateway-manager.js` — gateway process management.
- `packages/familiar/src/resource-paths.js` — dev/packaged path resolution.
- `packages/familiar/src/protocol-handler.js` — `localhttp://` scheme and
  CSP injection (see `familiar-localhttp-protocol`).
- `packages/familiar/src/navigation-guard.js` — navigation interception.
- `packages/familiar/src/exfiltration-defense.js` — DNS poisoning, request
  interception, WebRTC, permission handler, runtime verification.
- `packages/familiar/preload.js` — IPC bridge with security warnings.
- `packages/familiar/forge.config.cjs` — Electron Forge packaging.
- `packages/familiar/scripts/` — build, bundle, download-node, packaging.

**Design deviations:**

- The package structure diverges from the original design: source modules
  live in `src/` (not `resources/`), bundled artifacts go in `bundles/`,
  and Electron Forge (not electron-builder) handles packaging.
- The `proxy.js` module described below was replaced by
  `src/protocol-handler.js` (for HTTP) and the MessagePort bridge design
  (for WebSocket, not yet implemented in Chat).
- Config is passed via URL fragment (`#gateway=...&agent=...`), not query
  params or `window.ENDO_PORT`.

## What is the Problem Being Solved?

Endo currently requires users to install Node.js, clone the monorepo, and use
the CLI to interact with the daemon. This is a developer-oriented workflow.
The Familiar is an Electron application that packages the entire Endo stack —
daemon, Chat UI, and Node.js runtime — into a native desktop application that
non-developer users can install and run.

The Familiar must:
1. Carry a platform-specific Node.js executable and the bundled daemon.
2. Manage the daemon lifecycle (start, restart, purge).
3. Serve Chat as the primary UI in the Electron window.
4. Proxy HTTP and WebSocket traffic to the daemon's unified server.
5. Register a custom protocol handler (`localhttp://`) for routing weblet
   traffic.
6. Play well with a daemon that is already running.

## Description of the Design

### Package structure

```
packages/familiar/
  package.json
  electron-main.js          # Electron main process
  preload.js                # Preload script for renderer security
  src/
    daemon-manager.js       # Daemon lifecycle management
    protocol-handler.js     # localhttp:// custom protocol
    proxy.js                # HTTP/WebSocket proxy to daemon
  resources/
    node-<platform>-<arch>  # Bundled Node.js (per-platform)
    endo-daemon.cjs         # Bundled daemon (from familiar-daemon-bundling)
    endo-worker.cjs         # Bundled worker entry point
  build/
    electron-builder.yml    # Electron packaging configuration
```

### Daemon lifecycle management

The `daemon-manager.js` module manages the daemon process:

**Start:**
1. Check if a daemon is already running by probing the Unix socket
   (`~/.local/state/endo/daemon.sock` or platform equivalent via `@endo/where`).
2. If a daemon is running, connect to it. Do not spawn a second daemon. The
   Familiar works with any compatible daemon, whether started by the CLI or a
   previous Familiar session.
3. If no daemon is running, spawn one using the bundled Node.js and daemon
   artifact:
   ```js
   const daemon = spawn(bundledNodePath, [bundledDaemonPath, sockPath, ...], {
     detached: true,       // Survives Familiar exit
     stdio: 'ignore',      // No console attachment
   });
   daemon.unref();         // Don't keep Familiar alive for the daemon
   ```
4. Wait for the daemon to be ready (probe the socket with retries).

**Key property: the daemon outlives the Familiar.** Spawning with `detached:
true` and `daemon.unref()` ensures the daemon continues running as a background
process even if the Familiar window is closed. This matches the CLI behavior
where `endo start` spawns a persistent daemon.

**Restart:**
- Connect to the existing daemon and send a shutdown signal, then spawn a new
  one. Exposed as a menu action or Chat command.

**Purge (dangerous):**
- Stop the daemon, delete the state directory (`~/.local/state/endo/`), and
  optionally restart. Requires confirmation dialog. Exposed as a menu action.

### Electron main process

The `electron-main.js` sets up:

1. **BrowserWindow** — loads Chat at `http://localhost:<gateway-port>/` (or
   directly from bundled Chat assets if offline).
2. **Custom protocol handler** — registers `localhttp://` (see below).
3. **Application menu** — includes Daemon controls (Restart, Purge), standard
   Edit/View menus, and DevTools toggle.
4. **Tray icon** (optional) — indicates daemon status (running/stopped).

### Custom protocol handler: `localhttp://`

Register `localhttp://` as a privileged protocol in Electron:

```js
protocol.handle('localhttp', async (request) => {
  // Parse: localhttp://<weblet-id>/path
  const url = new URL(request.url);
  const webletId = url.hostname;
  const path = url.pathname + url.search;

  // Proxy to daemon's unified server with Host header
  const response = await fetch(`http://127.0.0.1:${gatewayPort}${path}`, {
    method: request.method,
    headers: {
      ...request.headers,
      Host: `${webletId}.localhost`,
    },
    body: request.body,
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});
```

This gives each weblet a unique origin (`localhttp://<weblet-id>`) with full
browser security isolation (separate cookie jars, localStorage, etc.) without
requiring DNS resolution of `*.localhost`.

### WebSocket proxy

Electron's `protocol.handle` does not support WebSocket upgrade. For weblet
CapTP connections, the Familiar runs a minimal local proxy:

1. Weblets open a WebSocket to `localhttp://<weblet-id>/` which Electron
   intercepts.
2. The Familiar's main process opens a corresponding WebSocket to
   `ws://127.0.0.1:<gateway-port>/` with the appropriate `Host` header.
3. Messages are forwarded bidirectionally.

Alternatively, weblets can connect directly to `ws://127.0.0.1:<gateway-port>/`
with a `Host` header if the browser security model permits it from the
`localhttp://` origin. This avoids the proxy but requires CORS configuration.

### Chat as the primary UI

The Electron BrowserWindow loads Chat. Chat connects to the daemon via the
gateway WebSocket (same as in development). No changes to Chat's connection
logic are needed — it connects to `ws://127.0.0.1:<port>/` with the injected
port and agent ID.

The Familiar provides these values to Chat:
- Via query parameters: `http://localhost:<port>/?endoPort=<port>&endoId=<id>`
- Or via Electron's `preload.js` injecting `window.ENDO_PORT` and
  `window.ENDO_ID`.

### Playing well with existing daemons

The Familiar must handle these scenarios:

| Scenario | Behavior |
|----------|----------|
| No daemon running | Spawn bundled daemon |
| CLI-started daemon running | Connect to it (compatible) |
| Older daemon version running | Warn user, offer restart |
| Familiar-started daemon running | Connect to it |
| Daemon crashes while Familiar is open | Detect disconnect, offer restart |

Detection: probe the Unix socket path. If a connection succeeds and
`E(bootstrap).ping()` responds, the daemon is alive and compatible.

### Electron packaging

Use `electron-builder` or `electron-forge` to produce platform installers:
- macOS: `.dmg` with signed `.app` bundle
- Linux: `.AppImage` or `.deb`
- Windows: `.exe` installer via NSIS or `.msi`

The bundled Node.js and daemon artifacts go into the `resources/` directory
of the packaged Electron app.

### Affected packages

- `packages/familiar` (new) — Electron main process, daemon manager, protocol
  handler, proxy, build configuration
- `packages/chat` — minor changes to accept connection parameters from Familiar
- `packages/daemon` — gateway must be in-daemon (from `familiar-gateway-migration`)

### Dependencies

- **familiar-gateway-migration** — gateway must be in the daemon for the
  Familiar to connect to it.
- **familiar-unified-weblet-server** — weblets must be served through a single
  port for the custom protocol handler to proxy them.
- **familiar-daemon-bundling** — daemon must be bundled for Electron packaging.

## Security Considerations

- The `localhttp://` protocol must be treated as a privileged scheme. Electron
  should not allow arbitrary web content to navigate to `localhttp://` URLs.
- Each weblet gets a unique origin via its `localhttp://<weblet-id>` URL,
  providing the same-origin isolation that separate ports provided before.
- The Familiar's preload script should expose minimal APIs to the renderer
  process. Chat should not have access to Node.js APIs directly.
- The daemon runs as the user's process with user-level permissions. No
  privilege escalation occurs.
- The `Purge` action is destructive (deletes all state). It must require
  explicit user confirmation.

## Scaling Considerations

- Electron adds ~150MB to the distribution (Chromium + Node.js). The bundled
  Endo daemon + second Node.js adds another ~50MB. Total: ~200MB.
- The Familiar is a single-user desktop application. No multi-user scaling
  concerns.

## Test Plan

- Smoke test: launch Familiar, verify Chat loads and connects to daemon.
- Lifecycle test: start Familiar with no daemon, verify daemon spawns. Close
  Familiar, verify daemon continues running. Reopen Familiar, verify it
  reconnects.
- Protocol test: install a weblet, open it via `localhttp://`, verify it
  renders and CapTP connects.
- Restart test: trigger restart from menu, verify daemon stops and restarts,
  Chat reconnects.
- Cross-platform: build and test on macOS, Linux.

## Compatibility Considerations

- The Familiar is a new package. No backward compatibility concerns.
- The Familiar must be compatible with daemons started by the CLI (`endo start`).
  This is ensured by using the same socket path and CapTP protocol.
- Electron version should be chosen for stability and security update cadence.

## Upgrade Considerations

- Familiar updates ship a new Electron binary, new bundled Node.js, and new
  bundled daemon. Auto-update via `electron-updater` is recommended.
- If the daemon persistence format changes between versions, the daemon's own
  migration logic handles it. The Familiar should display a migration progress
  indicator if the daemon takes time to start after an upgrade.

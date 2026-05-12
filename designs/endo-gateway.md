# Endo Gateway

| | |
|---|---|
| **Created** | 2026-05-10 |
| **Updated** | 2026-05-10 (review pass: no TLS, Noise netlayer, `/ocapn` WS, Host→CAS, separate config trees, defer key rotation, defer daemon-hosting variant) |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | Issue [#173](https://github.com/endojs/endo-but-for-bots/issues/173) (extracted from PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134) `feat(docker,daemon): docker self-hosting` review at 2026-05-10T06:14:41Z) |

## What is the Problem Being Solved?

The current Endo daemon is per-user.
It binds its own port, hosts its own gateway service
([`daemon-web-gateway`](daemon-web-gateway.md)), and serves weblets
with the agent's own authority through that port.
This collapses cleanly when one user owns the host, but it does not
extend to a host that hosts several users at once, and it leaves no
single bind point at which the operating system can publish "OCapN
for this machine" to the network.
PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)
(`feat(docker,daemon): docker self-hosting`) is paused on exactly
this question.
Its container image bundles one daemon and exposes one port; that
shape does not extend to a service that virtual-hosts many users on
one address, and the maintainer has signalled
([issue #173](https://github.com/endojs/endo-but-for-bots/issues/173))
that the hosting concern should be lifted out of the per-user daemon
into a separate **Endo Gateway**: a system-service Daemon
configuration that listens on one port per host, HTTP-virtual-hosts
OCapN to many users (local and remote), and forwards weblet traffic
to per-user daemons that register with it.

This design proposes that split.
The Gateway and the per-user Daemon are the same binary in two
configurations.
The Gateway owns the host's external surface (one port, virtual
hosting, the OCapN cryptographic transport over Noise) and relays
into per-user daemons by their public keys.
The Gateway does not terminate TLS; OCapN's confidentiality and peer
authentication are provided in-band by the Noise Protocol netlayer
described in
[`ocapn-network-transport-separation`](ocapn-network-transport-separation.md),
so the WebSocket carrying OCapN traffic does not need the
transport-level secrecy that TLS would otherwise provide.
Per-user daemons no longer terminate external HTTP for the host;
they connect outbound to the Gateway over a local-only channel and
register the weblets they want exposed.

## Background

The per-user daemon already does almost everything described here,
but for one user at a time:

- It owns a content-addressed store, a formula graph, and per-agent
  Ed25519 keypairs that double as OCapN node identifiers
  ([`daemon-256-bit-identifiers`](daemon-256-bit-identifiers.md)).
- It hosts a built-in HTTP+WebSocket gateway as the `@apps` special
  formula
  ([`daemon-web-gateway`](daemon-web-gateway.md),
  [`familiar-bundled-agents.md`](familiar-bundled-agents.md),
  [`weblet-next.md`](weblet-next.md)), routing virtual
  hosts to per-weblet handlers and bridging Chat to CapTP over a
  WebSocket.
  (The convention for the special name is `@apps`; older drafts of
  this design used `APPS` and have been updated to match.)
- It has been migrated out of the Chat dev server into the daemon
  proper ([`familiar-gateway-migration`](familiar-gateway-migration.md))
  and its remote-access mode (bearer token, per-IP rate limit, CIDR
  allowlist) is implemented
  ([`gateway-bearer-token-auth`](gateway-bearer-token-auth.md)).
- The Familiar Electron shell terminates a `localhttp://` scheme in
  the renderer to give each weblet its own origin without DNS
  ([`familiar-localhttp-protocol`](familiar-localhttp-protocol.md)).
- The single-port unified web server inside the daemon
  ([`familiar-unified-weblet-server`](familiar-unified-weblet-server.md))
  has noted, in its 2026-04-17 revision, exactly the multi-user
  multiplex and per-session-confidentiality problems that this design
  addresses; that revision flags Noise (per
  [`ocapn-network-transport-separation`](ocapn-network-transport-separation.md))
  as the missing piece.
- The OCapN Noise netlayer and the WebSocket transport described in
  [`ocapn-network-transport-separation`](ocapn-network-transport-separation.md)
  are ready, including the `ws:` connection-hint encoding in OCapN
  locators.
  This implementation is an opportunity to validate them end-to-end
  in the Gateway's integration tests; the Gateway's external surface
  is the first production-shape consumer of the
  Noise-over-WebSocket netlayer outside the OCapN test harness.

The per-user Daemon is the wrong place to host a multi-user
virtual-host service for three reasons.
(1) It runs as one OS user and would have to be granted privileges
that crossed user boundaries to relay another user's traffic.
(2) Two daemons on the same host would race for the same port; the
service is implicitly a per-host singleton, but the daemon is
implicitly per-user.
(3) Hosting policy (which users may register weblets, which OCapN
public keys are allowed to host at the host's local virtual-host
hierarchy, whether to expose to the public internet) is
host-administrator policy, not user policy.

The Gateway is the locus for those concerns.
Everything else (formulas, agents, weblet code, content) stays in
the per-user Daemon.

## Architectural Shape

The Gateway and the per-user Daemon are two **modes** of the same
generic Daemon binary, selected at startup by a configuration flag
(working name: `--mode=gateway` vs `--mode=user`, with `user` the
default for backward compatibility).
A given host runs at most one Gateway and zero or more User Daemons.

```
                 ┌──────────────────────────────────────────────┐
                 │           Endo Gateway (system service)      │
                 │           one per host, one TCP port         │
                 │                                              │
   internet ───► │  HTTP virtual hosting + WS /ocapn (Noise)    │
                 │  virtual host: <weblet-id>.<host>            │
                 │                                              │
                 │  ┌────────────────────────────────────────┐  │
                 │  │ pubkey table                           │  │
                 │  │   pk_alice  → conn(local)  → user 1001 │  │
                 │  │   pk_bob    → conn(local)  → user 1002 │  │
                 │  │   pk_carol  → conn(remote) → ...       │  │
                 │  └────────────────────────────────────────┘  │
                 └────────┬──────────────┬───────────┬──────────┘
                          │ local        │ local     │ remote
                          │ IPC          │ IPC       │ OCapN
                          ▼              ▼           ▼
        ┌──────────────────────┐  ┌──────────────────────┐  ┌────────┐
        │  User Daemon (alice) │  │  User Daemon (bob)   │  │ remote │
        │  one per OS user     │  │                      │  │ peer   │
        │                      │  │                      │  └────────┘
        │  weblets:            │  │  weblets:            │
        │   wb_chat   → handler│  │   wb_inbox → handler │
        │   wb_inbox  → handler│  │                      │
        └──────────────────────┘  └──────────────────────┘
```

A single host runs:

- **One Endo Gateway**, started as a system service (systemd /
  launchd / Windows Service), running as a dedicated unprivileged
  service account.
  The Gateway holds the listening socket, terminates the OCapN
  cryptographic protocol, and maintains the public-key-to-User-Daemon
  routing table.
  It carries no formula store of its own beyond what it needs to
  represent its registration table and operator policy.
- **N User Daemons**, one per OS user account, started either by
  the user's own session (the existing
  [`familiar-gateway-migration`](familiar-gateway-migration.md)
  flow), by `systemd --user`, or by a daemon-hosting service (the
  "different config" the issue body mentions: a service account
  that operates User Daemons on behalf of users without their own
  shell sessions).
- **M weblets per User Daemon**, exactly as today
  ([`familiar-unified-weblet-server`](familiar-unified-weblet-server.md)).

The Gateway does not embed a User Daemon and a User Daemon does not
embed a Gateway.
A standalone single-user developer install can still run a User
Daemon with no Gateway in front of it (today's flow), in which case
the User Daemon binds its own port as it does now.
A multi-user host runs a Gateway and the User Daemons configure
themselves to register with it instead of binding their own ports.

Reusing one binary keeps the formula machinery, content store,
worker plumbing, and OCapN client common between modes.
The Gateway's "mode" is largely a startup configuration that
disables the formula-execution side, enables the registration table
and the proxying handlers, and selects a different unconfined-guest
formula at boot in place of the user-side `@apps` formula.

## Registration Protocol

Per-user Daemons make their presence known to the Gateway by
opening an outbound CapTP connection over a local-only IPC channel
and presenting their Ed25519 public key.
The Gateway maintains a `publicKey -> User Daemon connection` table
keyed by the registrant's public key (the same per-agent key
material described in
[`daemon-256-bit-identifiers`](daemon-256-bit-identifiers.md)).

### Local-only registration channel

The Gateway exposes a UNIX domain socket on Linux/macOS and a named
pipe on Windows, at a well-known location chosen by the operator
(default: `/run/endo-gateway/registrar.sock`).
File-system permissions on the socket gate **who may register at
all**.
The default policy is "any OS user on this host" (mode 0666 on the
socket directory, with the parent directory writable only by the
service account).
Stricter setups can group-restrict the socket.

The registration channel speaks CapTP framed by netstrings, the
same wire framing the daemon already uses for its CLI socket
(`packages/daemon/src/connection.js`).
Reusing the existing local CapTP transport means no new framing
or marshalling code paths.

### Handshake

The User Daemon connects, fetches the Gateway's `Registrar`
bootstrap exo, and calls:

```js
const registration = await E(registrar).register(harden({
  publicKey,            // 32-byte Ed25519 public key
  proofOfPossession,    // signature over a Gateway-issued nonce
  daemon,               // Far('UserDaemon', { ... handlers ... })
}));
```

`proofOfPossession` is a signature, with the registrant's Ed25519
private key, over a fresh nonce returned by an immediately preceding
`E(registrar).challenge()` call.
This proves that the registrant controls the private key for the
public key it claims, even though the registration channel itself
is local-only and would otherwise admit any OS user to register any
public key.
Without this step a local user could register another user's public
key and intercept that user's traffic.

`daemon` is the User Daemon's relay-side exo, presenting the
methods the Gateway will call on it to deliver an inbound HTTP
request, complete a WebSocket upgrade, or look up a weblet's
content address.
Its interface is sketched in the next section.

`registration` is a `Far('Registration', { update, deregister })`
handle.
The User Daemon may call `update` to advertise additional public
keys (one Daemon may host more than one agent) or to refresh the
weblet table.
Calling `deregister` removes its entries.

### Proposed interfaces

The wire is CapTP, so "interfaces" here are exo guards for the
remotables exchanged across the registration channel.
The TypeScript-style sketch is the contract the implementation PR
should produce, with `M.interface` guards and `harden`'d records
on the JavaScript side; the field types are normative, the method
names indicative.

```ts
/** A 32-byte Ed25519 public key. */
type PublicKey = Uint8Array;

/** Ed25519 signature over a Gateway-issued nonce. */
type ProofOfPossession = Uint8Array;

/** First 32 hex characters of the weblet's formula ID. */
type WebletId = string;

/** SHA-256 hex of a content-tree root in the CAS. */
type ContentTreeRoot = string;

/**
 * Static request shape passed across the relay.
 */
interface HttpRequestRecord {
  method: string;
  path: string;
  headers: ReadonlyArray<readonly [string, string]>;
  body: Uint8Array; // streaming for bodies above an inline threshold
}

interface HttpResponseRecord {
  status: number;
  headers: ReadonlyArray<readonly [string, string]>;
  body: Uint8Array;
}

interface WebletDescriptor {
  webletId: WebletId;
  contentTreeRoot: ContentTreeRoot;
  hasWebSocket: boolean;
}

/** What the User Daemon presents to the Gateway. */
interface UserDaemon {
  /**
   * Static fallback when the request path does not resolve under
   * the weblet's contentTreeRoot.
   */
  handleHttp(
    webletId: WebletId,
    request: HttpRequestRecord,
  ): Promise<HttpResponseRecord>;

  /**
   * Returns a frame-level handler for an upgraded WebSocket.
   * The Gateway pumps frames in both directions.
   */
  handleWebSocketUpgrade(
    webletId: WebletId,
    request: HttpRequestRecord,
  ): Promise<WebSocketHandler>;

  /**
   * Asked by the Gateway when it sees a contentTreeRoot it has
   * not cached. Returns a `readable-tree`-shaped object the
   * Gateway can ingest into its CAS.
   */
  fetchContentTree(root: ContentTreeRoot): Promise<ReadableTree>;
}

interface WebSocketHandler {
  onMessage(frame: Uint8Array): void;
  onClose(code: number, reason: string): void;
}

/** Bootstrap exo on the Gateway side. */
interface Registrar {
  /** Returns a fresh nonce for the proof-of-possession step. */
  challenge(): Promise<Uint8Array>;

  register(args: {
    publicKey: PublicKey;
    proofOfPossession: ProofOfPossession;
    daemon: UserDaemon;
  }): Promise<Registration>;
}

/** Per-User-Daemon registration handle. */
interface Registration {
  /**
   * Publish or update a weblet under the registered User Daemon.
   * The Gateway records (webletId → User Daemon, contentTreeRoot)
   * in its sqlite formula store.
   */
  publishWeblet(descriptor: WebletDescriptor): Promise<void>;

  /** Add an additional public key to this registration. */
  addPublicKey(args: {
    publicKey: PublicKey;
    proofOfPossession: ProofOfPossession;
  }): Promise<void>;

  /** Remove a previously-published weblet. */
  unpublishWeblet(webletId: WebletId): Promise<void>;

  /** Tear down this registration. */
  deregister(): Promise<void>;
}
```

The proof-of-possession nonce is a fresh 32-byte random value
returned by `challenge()`; it must be consumed within a short
window (suggested 30s) and is single-use.
The Gateway hashes the nonce with a domain-separation prefix
(suggested literal `endo-gateway:registrar:nonce`) before checking
the signature; this prevents a captured registration signature
from being misused as a signature in another OCapN protocol step.
Heartbeat cadence and the inline-body threshold for the streaming
relay are tuned in the implementation PR; sensible starting
values are 30s heartbeat (as already noted in Liveness) and a
64 KiB inline-body threshold.

### Liveness

The Gateway watches the CapTP channel for closure (TCP-style RST,
EPIPE on the IPC socket) and prunes the registration on close.
A defensive heartbeat (Gateway pings the User Daemon every 30s,
prunes on three missed responses) covers the case where a User
Daemon is wedged but its IPC socket has not yet closed.
Heartbeats reuse `__getMethodNames__` rather than a bespoke `ping`
method; the existing CapTP introspection round-trip is enough.

In-flight HTTP/WS connections to a pruned User Daemon are closed by
the Gateway with a 503; clients reconnect and the next attempt
fails with NXDOMAIN-style virtual-host-not-found (HTTP 404 on the
unmatched virtual host) until the User Daemon re-registers.

## Weblet Registration and WebSocket Relay

The Gateway routes incoming HTTP and WebSocket traffic by virtual
hostname.
A weblet's virtual hostname is its access token (today, the first
32 hex characters of the weblet's formula ID, per
[`daemon-web-gateway`](daemon-web-gateway.md)).
That convention is preserved.

### Weblet entry

When a User Daemon publishes a weblet, it registers, on its
relay-side exo:

```js
await E(registration).publishWeblet(harden({
  accessToken,          // virtual hostname (first 32 hex of weblet ID)
  contentAddress,       // SHA-256 hex of the static content archive
  hasWebSocket,         // whether the weblet handles a WS upgrade
}));
```

Two pieces of information matter:

1. **The locator** for the powers behind the weblet, which is the
   User Daemon's relay-side exo plus the access token.
   The Gateway never holds the powers; it only holds the
   access-token-to-User-Daemon-handle mapping.
2. **The content address** of the weblet's static assets (a
   `readable-tree` per
   [`daemon-checkin-checkout`](daemon-checkin-checkout.md), or an
   `exo-zip` archive per
   [`exo-zip-package`](exo-zip-package.md)), which the Gateway is
   *permitted* to serve directly out of its content-addressed
   cache.
   This permission is what makes static-asset delivery cheap: the
   Gateway can answer GETs for known immutable URLs from its own
   disk without round-tripping into the User Daemon for every
   request.

If the Gateway has not seen the content address before, it asks
the User Daemon for it (out of the same content-addressed store)
and caches it.
On a cache hit it serves directly.
This is content-addressed delivery in the same shape as the daemon's
existing `readable-blob` store
([`daemon-cas-management`](daemon-cas-management.md)).

### Routing an HTTP request

The Gateway's HTTP server is itself the static-asset server.
On a request, the Gateway reads the `Host` header, parses out the
weblet identifier, looks up the corresponding weblet formula in
its sqlite store, reads the formula's tree-root content hash, and
serves the requested path directly out of the Gateway's
content-addressed store.
There is no per-request round-trip to the User Daemon for
content-addressed (immutable) assets; the User Daemon's only role
in static-asset delivery is to publish the formula in advance and
to make sure the Gateway has the underlying CAS objects.

```
1. TCP accept on the Gateway's listening port (plain HTTP, no TLS).
2. Read HTTP request line + Host header.
3. Parse the weblet identifier out of the Host header
   (the leftmost label, which by convention is the access token,
   the first 32 hex characters of the weblet's formula ID).
4. Look up the weblet formula in the Gateway's sqlite formula store.
   - Miss: 404.
5. Read the formula's content-tree root hash.
6. Resolve the request path against that tree root in the CAS.
   - Hit: serve the bytes directly out of the CAS.
   - Miss (path is dynamic, not in the static tree):
       E(userDaemon).handleHttp(webletId, requestRecord) → response.
7. Write response.
```

The Gateway's sqlite formula store is the same on-disk shape used
by the per-user Daemon ([`daemon-endo-rust-sqlite`](daemon-endo-rust-sqlite.md)),
populated by the registration handshake with the subset of formulas
the User Daemon has chosen to expose (typically: the weblet
formulas).
The CAS is the same content-addressed blob store
([`daemon-cas-management`](daemon-cas-management.md)) reused at
host scope.

`requestRecord` (used only for the dynamic-fallback case) is a
passable record of method, path, headers, and body bytes.
The reply is a passable record of status, headers, and body bytes.
Bodies that exceed an inline-body threshold are streamed as
[`daemon-message-streaming`](daemon-message-streaming.md) chunks
rather than passed inline; this avoids buffering large uploads
through the Gateway's CapTP channel.

### Routing a WebSocket upgrade

The Gateway accepts the WebSocket upgrade itself and proxies
frame-for-frame into the User Daemon.
TLS is not in the picture; the WebSocket connection is plain `ws://`
and any session-level confidentiality is provided by the Noise
handshake that OCapN performs inside the WebSocket frames.

```
1. HTTP request with Upgrade: websocket, Host: <weblet-id>.
2. Resolve User Daemon as for HTTP (sqlite formula → User Daemon
   handle).
3. E(userDaemon).handleWebSocketUpgrade(webletId, requestRecord)
     returns a Far('WebSocketHandler', { onMessage, onClose }).
4. Gateway completes the WS handshake and pumps frames:
     incoming frame  → E(handler).onMessage(frame)
     outgoing frame  ← E(returnedSink)
5. On close from either side, both sides close.
```

The Gateway does **not** parse or understand the application-level
CapTP carried over the WebSocket; it is a frame-level relay.
The Gateway and User Daemon split on protocol responsibility:
the Gateway owns the HTTP and WebSocket framing; the User Daemon
owns CapTP and (for OCapN traffic) the Noise handshake that runs
inside those frames.
The Gateway proxies WS frames in both directions without
inspection.
This matches the framing already used by
[`daemon-web-gateway`](daemon-web-gateway.md): binary WS frames
carrying JSON-encoded CapTP messages.

### OCapN endpoint, separately

Distinct from the per-weblet HTTP path, the Gateway also exposes a
single OCapN endpoint at the well-known WebSocket path `/ocapn` on
the host's bare name (no virtual host).
Remote OCapN peers contact `ws://<host>/ocapn`, the Gateway accepts
the WebSocket upgrade, and the Noise handshake then runs inside the
WebSocket frames.
OCapN locators encode the destination with a connection hint of the
form `ws:host` (per
[`ocapn-network-transport-separation`](ocapn-network-transport-separation.md)),
which assumes WebSocket on the canonical `/ocapn` path; clients
need no per-host configuration to find the endpoint.

The destination node's public key and the secret object identifier
are carried in-band by OCapN itself, so the Gateway does not need
to inspect the URL beyond `/ocapn` to route the session.
The Gateway demultiplexes OCapN sessions to the appropriate User
Daemon by the destination node public key carried in OCapN's own
session-establishment frames.
This is the same routing key (Ed25519 public key) used by the local
registration table, so a single lookup serves both paths.

## Lifecycle

### Boot order

The Gateway is a system service.
It starts at boot and is supervised by the OS service manager
(systemd, launchd, Windows Service).
It binds its port, opens its registration socket, and waits.

User Daemons start independently, either at user login (the
existing flow), at boot via `systemd --user`, or on demand from a
daemon-hosting service that operates User Daemons for users
without shell sessions.
Each User Daemon, on startup, reads its configured Gateway address
(default: the well-known local registration socket) and attempts to
register.

The Gateway must tolerate User Daemons being absent or in flux.
A request for a Host whose User Daemon is down returns 404 (not
503) so that the response is cacheable and gives no signal about
which users exist on the host.
A User Daemon that finds the Gateway absent retries with backoff
(1s, 2s, 4s, capped at 60s) and registers as soon as the Gateway
appears.

### Teardown

Graceful: the User Daemon calls `deregister()` on its registration
handle, then closes the IPC channel.
The Gateway prunes the entry, closes any in-flight WebSocket
connections to the affected weblets with a normal-close opcode,
and answers further requests for those Hosts with 404.

Ungraceful: the IPC channel closes (process death, OOM kill, host
suspend).
The Gateway detects the close and prunes as above; in-flight WS
connections receive an abnormal close.
The User Daemon, on next start, simply re-registers; clients
reconnect.

### Restart semantics

A User Daemon restart is transparent to OCapN clients in the steady
state: the new instance presents the same public key, registers the
same weblets, and the same access tokens resolve.
In-flight WebSocket sessions are not transparent; CapTP sessions
have to re-establish.
This matches the existing daemon-restart story.

The Gateway itself should restart only at administrator request.
A Gateway restart drops every connection (TCP closes), and clients
reconnect.
User Daemons reconnect to the registration socket and re-publish
their weblets; the Gateway's registration table is rebuilt from
those incoming registrations rather than persisted across restarts.
This keeps the Gateway's on-disk state minimal (operator policy
files, the sqlite formula store, the CAS cache; no TLS key, no
certificate, no Noise static key beyond what the OCapN netlayer
manages itself) and avoids the Gateway's table going stale
relative to the live User Daemons.

### Cross-platform service shape

The Gateway lives or dies by the platform's idiomatic service
manager.
There is no bespoke Endo supervisor; each platform uses the
service manager that is already there and that the platform's
administrator already knows how to operate.

- **Linux**: systemd unit (`endo-gateway.service`), service account
  `endo-gateway`, `Restart=on-failure`, runtime directory
  `/run/endo-gateway/` for the registration socket.
  systemd is the assumed service manager on every supported Linux
  distribution; non-systemd init systems (sysvinit, OpenRC, runit)
  are out of scope and would be packaged by their downstream
  distributors if at all.
- **macOS**: launchd `LaunchDaemon` plist under
  `/Library/LaunchDaemons/`, runtime directory under `/var/run/`.
  Installed by the macOS distribution of the Endo binary or by the
  Familiar app's installer (see the Familiar packaging section
  below).
- **Windows**: Windows Service registered with `sc.exe` or via
  the platform Service Control Manager API, named-pipe registration
  channel at `\\.\pipe\endo-gateway`.
- **Container**
  (PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)):
  one container running the Gateway, one or more sidecar
  containers running User Daemons.
  Containers share a tmpfs volume for the registration socket; see
  the PR-#134 impact section below.
  Inside a container there is typically no systemd (and a
  systemd-as-PID-1 container is the wrong shape for our use case),
  so the Gateway is `PID 1` of its own container and the container
  runtime (Docker, Podman, Kubernetes) plays the role of the
  service manager: restart policy, health-check, logs.
  The container image therefore must not assume any service
  manager beyond a plain process supervisor.

### Familiar app packaging impact

The Familiar Electron app is the most user-visible packaging
target for the Endo binary, and its single-host single-user shape
is exactly the case where the Gateway should not impose
operator-style configuration on the user.
Familiar's existing build pipeline uses `@electron/packager` plus
`electron-installer-dmg` / `appdmg` (see
[`packages/familiar/scripts/make-distributables.mjs`](../packages/familiar/scripts/make-distributables.mjs)
and
[`packages/familiar/scripts/package-app.mjs`](../packages/familiar/scripts/package-app.mjs)),
producing per-platform artifacts that already bundle Node, the
daemon, and Familiar's own assets.
The Gateway adds a second daemon process to bundle and a system
service to register at install time on hosts where one is wanted.
The per-platform impact:

- **macOS (`.dmg`, `.zip`)**: the existing `electron-installer-dmg`
  / `appdmg` flow ships the Familiar `.app` bundle.
  When the user opts in to host-wide hosting (a Familiar-side
  setting), Familiar writes a `LaunchDaemon` plist into
  `/Library/LaunchDaemons/`, requiring an authorization prompt.
  By default Familiar runs the User Daemon under the logged-in
  user's `LaunchAgent` and binds a per-user port (today's flow);
  the Gateway is opt-in.
  No notarization or codesigning impact on top of what Familiar
  already needs for the renderer.
- **Linux (`.zip` and downstream `.deb` / `.rpm` / AppImage)**:
  `make-distributables.mjs` currently emits a `.zip`.
  Downstream distribution packaging (`.deb`, `.rpm`, AppImage) is
  out of scope of the in-tree scripts but should ship a
  `systemd` unit file (`endo-gateway.service`, optionally an
  `endo-gateway.socket` for socket activation) installed under
  `/lib/systemd/system/` and enabled on opt-in.
  AppImage cannot install system services directly; the AppImage
  build of Familiar therefore offers Gateway only as a "save this
  unit file and `systemctl --user link` it" prompt, not a one-click
  install.
- **Windows (`.zip` and downstream installer)**:
  the in-tree scripts emit a `.zip`; downstream Windows installer
  packaging (NSIS, MSIX, MSI) needs to register the Gateway as a
  Windows Service via `sc.exe create` or the SCM API at install
  time, and offer to start it.
  The User Daemon side continues to be a per-user process.
- **All platforms**: Familiar should detect at startup whether a
  Gateway is reachable on the local rendezvous socket; if so, the
  in-process User Daemon registers with it instead of binding a
  port; if not, Familiar falls back to today's behaviour
  (User Daemon binds a per-user port).
  This keeps the user's first-run experience unchanged when no
  Gateway is installed, and lets the Gateway take over
  transparently when one is.
- **Bundling**: the Gateway is a configuration of the same daemon
  binary
  ([`packages/daemon`](../packages/daemon)),
  so no new native module is added to Familiar's bundle.
  The `@electron/packager` invocation does not need to change; the
  Gateway is launched as a sibling Node process by the platform's
  service manager, not embedded in the renderer or the Electron
  main process (Electron must not import `@endo/init` or `ses`,
  per the Familiar architecture constraints).

## Local-vs-Remote Attestation

The Gateway grants every successfully-registered Daemon some basic
rights (it can register weblets and serve them through the Gateway).
But one specific right is **implicit for local Daemons only**: the
right to host weblets at the local host's virtual-host hierarchy.
A User Daemon attached to the host machine should be able to publish
`weblet.alice.host.example/` without any operator-side configuration.
A remote Daemon should not be able to claim a virtual host on this
machine just by connecting; it should only be granted what the
operator explicitly configured.

The Gateway therefore tags each successful registration as `local`
or `remote`, and only `local` entries enjoy the implicit
host-locally right.

### How is "local" attested?

**Decision: a local-only IPC channel** (UNIX domain socket on
Linux/macOS, named pipe on Windows).
This is the rendezvous shape: a single, well-known local IPC path
where every User Daemon on the host converges to find the Gateway.
A registration that arrives over the local IPC socket is, by
construction, from a process on this host; "local" is then a
property of the channel rather than of any kernel-credential check
or attested secret.

For completeness, two alternatives were considered and rejected:

- **Loopback TCP plus a kernel credential check** (`SO_PEERCRED`
  on Linux, `LOCAL_PEERCRED` on macOS,
  `GetNamedPipeClientProcessId` on Windows).
  Works, but requires per-OS kernel-API plumbing for what is
  otherwise the same property the IPC channel gives us by
  construction.
- **Cryptographic attestation** backed by a host-only secret
  (e.g., a TPM-sealed key, a file readable only by the local
  daemon at boot).
  Heaviest infrastructure, gains nothing over the IPC channel on
  a cooperative host.

The IPC channel slots cleanly into the existing daemon transport
(the daemon already binds a UNIX domain socket for the CLI).
On Linux and macOS this is a UNIX domain socket; on Windows it is
a named pipe; in both cases file-system / pipe permissions handle
who-may-connect.

The proof-of-possession step in the registration handshake is
**not** about local-vs-remote (the socket is local-by-construction);
it is about distinguishing one local user from another so that a
malicious local user cannot register another local user's public
key.

### Remote registrations

Remote Daemons reach the Gateway over the public OCapN-over-Noise
endpoint at `ws://<host>/ocapn`, not the local IPC socket.
The Gateway tags those `remote` and refuses any registration
attempt to host at the host's local virtual-host hierarchy unless
the operator's explicit policy file
([`daemon-checkin-checkout`](daemon-checkin-checkout.md)-style
policy is one possible inspiration here, but its current scope is
local check-in / check-out and the cross-host policy file remains
an Open Question; see below) names that public key.

## Cryptographic Protocol: Noise, Not TLS

The Gateway does **not** terminate TLS.
HTTP and WebSocket are spoken in plaintext on the Gateway's bind
port.
Session-level confidentiality and peer authentication for OCapN
are provided by the Noise Protocol netlayer described in
[`ocapn-network-transport-separation`](ocapn-network-transport-separation.md):
once the WebSocket handshake at `/ocapn` completes, the OCapN
session begins with a Noise handshake whose static keys are the
Ed25519 keys that double as OCapN node identifiers
([`daemon-256-bit-identifiers`](daemon-256-bit-identifiers.md)).
After the handshake, OCapN frames are encrypted and authenticated
end-to-end between the remote peer and the User Daemon; the
Gateway, sitting in the middle, sees only ciphertext.

Pushing confidentiality and authentication into Noise rather than
TLS has three consequences worth pinning:

1. **No certificate management.**
   The Gateway has no key/cert files, no ACME client, no rotation
   tooling, and no configuration knobs for cipher suites or SNI.
2. **Authentication is by Ed25519 public key, not by hostname.**
   The Gateway never claims to be a particular host on a CA-signed
   certificate; the remote peer authenticates the destination
   User Daemon by its public key during the Noise handshake.
3. **Browsers are out of scope for the OCapN endpoint.**
   The OCapN endpoint at `ws://<host>/ocapn` is for OCapN clients
   (other Endo daemons, the CLI, peer hosts), not for browsers.
   The browser-facing path is per-weblet HTTP/WebSocket on the
   weblet's virtual host, which is plain HTTP.
   Operators who want TLS in front of the browser path are free to
   put a reverse proxy in front of the Gateway, but the Gateway
   does not do TLS itself.

For the in-browser weblet path, the WebSocket frames carry the
existing CapTP framing
([`daemon-web-gateway`](daemon-web-gateway.md)) end-to-end between
the browser and the User Daemon.
The Gateway does not see inside the CapTP messages; it only knows
the destination weblet identifier from the `Host` header.

Against the local IPC registration socket no encryption is needed
because the channel is local-by-construction (UNIX domain socket on
Linux/macOS, named pipe on Windows; see the rendezvous-location
section below).

## Impact on PR #134 (Docker Self-Hosting)

PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134) is
paused on this design.
The original PR shape (one daemon, one container, one port) does
not extend cleanly to Gateway + User Daemons.
With this design landed, the docker-self-hosting story becomes:

- **Image**: one image, two entrypoints (`endo-gateway` and
  `endo-user-daemon`) selecting the Daemon mode.
- **Compose / Pod**: a Gateway container plus N User Daemon
  containers, sharing a tmpfs volume mounted at
  `/run/endo-gateway/` for the registration socket.
- **Single-user shorthand**: a compose file with one User Daemon
  container alongside the Gateway, for hosts that exist to serve
  one user (the most common self-host case today).
- **Reverse proxy** (operator option, not required by the
  Gateway): operators who want browser-facing TLS for the
  per-weblet HTTP virtual hosts may put a reverse proxy
  (Caddy, nginx, Traefik) in front of the Gateway.
  The Gateway itself does not terminate TLS and does not need to;
  OCapN traffic is confidential under Noise irrespective of the
  reverse proxy.
  PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)'s
  reverse-proxy guidance is still useful as an example deployment.

PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)'s
remote-bearer-token work
([`gateway-bearer-token-auth`](gateway-bearer-token-auth.md)) is
unaffected; it now applies to the Gateway's own surface rather
than the User Daemon's.
PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)
will need to be rebased to use the Gateway image and to drop its
single-port assumption.

## Resolved by review

The first review pass closed several earlier open questions; the
resolutions are recorded here so that future readers do not
re-litigate them.

- **Config trees are separate.**
  The Gateway and the per-user Daemon have **distinct config
  trees**.
  The Gateway lives under host-scoped paths (e.g.,
  `/etc/endo-gateway/`, `/var/lib/endo-gateway/`,
  `/run/endo-gateway/` on Linux); the User Daemon lives under
  per-user paths
  (e.g., `~/.local/state/endo/`,
  `${XDG_RUNTIME_DIR}/endo/`).
  The `@endo/where`
  ([`packages/where`](../packages/where/index.js)) module needs
  a corresponding mux: today it computes
  `whereEndoState`, `whereEndoEphemeralState`, `whereEndoSock`,
  and `whereEndoCache` for one shape (the per-user daemon); it
  needs an analogous set of paths for the Gateway shape, selected
  by the daemon's mode flag.
  The implementation PR for the Gateway must extend `@endo/where`
  to expose Gateway-side paths (likely
  `whereEndoGatewayState`, `whereEndoGatewayEphemeralState`,
  `whereEndoGatewayRegistrarSock`, `whereEndoGatewayCache`)
  alongside the existing per-user functions.
- **No TLS.**
  The Gateway does not terminate TLS at any layer.
  OCapN over Noise provides session-level confidentiality and
  authentication for the OCapN endpoint; operators who want
  browser-facing TLS for the per-weblet HTTP virtual hosts may
  put a reverse proxy in front of the Gateway.
  See the "Cryptographic Protocol: Noise, Not TLS" section above.
- **Platform service management is the supervisor.**
  The Gateway does not implement its own singleton enforcement
  beyond what the platform's service manager already provides.
  systemd on Linux, launchd on macOS, the Service Control
  Manager on Windows, the container runtime in containers; each
  enforces "one instance" by being the thing that started it.
  See the "Cross-platform service shape" section above.
- **OCapN endpoint is `ws://<host>/ocapn`.**
  A single canonical WebSocket path serves OCapN at the host
  level.
  OCapN locators encode the destination's connection hint as
  `ws:host` (per
  [`ocapn-network-transport-separation`](ocapn-network-transport-separation.md));
  the public key and the secret object identifier are carried
  in-band by OCapN itself, so no per-pubkey URL path is needed.
- **Static-asset delivery is direct from the Gateway's CAS.**
  The Gateway's HTTP server hosts directly from its content-
  addressed store, multiplexed by the weblet identifier in the
  `Host` header.
  The `Host` header denotes a weblet formula in the Gateway's
  sqlite formula store, and the formula carries the tree-root
  hash that the Gateway resolves the request path against.
  See "Routing an HTTP request" above.
- **Registration interfaces are proposed.**
  The "Proposed interfaces" subsection of the Registration
  Protocol pins the TypeScript-style shape of the
  `Registrar`, `Registration`, `UserDaemon`, and
  `WebSocketHandler` exos; the implementation PR turns these
  into `M.interface` guards.

## Open Questions

1. **Public-key rotation and the Pass-Invariant-Eq problem.**
   A User Daemon's per-agent keypair is its routing key.
   The protocol allows a Daemon to register additional public keys
   (`addPublicKey` on the registration handle) and to retire old
   ones, so the *operational* rotation path exists: a Daemon can
   start advertising a new key, tell its peers, and eventually
   deregister the old one.
   What we do **not** yet have is a rotation that preserves the
   **Pass-Invariant Eq** property from E
   (object identity is preserved across grants, so two paths to
   the "same" object compare equal under `===` / `Eq`).
   When a public key changes, anything that hard-coded the old
   key as part of a locator continues to point at the old entry,
   and the new key is, from the recipient's perspective, a
   fresh object even though the operator intended a continuation.
   This is out of scope for this design but is recorded as a
   follow-up before the Gateway can be relied on for long-lived
   grants.
   The OCapN-side rotation story
   ([`daemon-agent-network-identity`](daemon-agent-network-identity.md))
   is the natural place to land the answer; the Gateway only
   needs to accept multi-key registrations and let policy decide
   which keys to keep.

2. **Daemon-hosting service mode (deferred).**
   The issue body mentions a "daemon hosting service" config: one
   process operating multiple agents on behalf of users without
   their own shell sessions.
   The expected shape is **a variant of the Gateway itself**
   where the Gateway manages **virtual users** rather than
   addressing system-level User Daemons.
   In that variant the Gateway holds the formula stores and the
   agent powers directly (one logical User Daemon per virtual
   user, all in-process), instead of relaying to N OS processes.
   This is deferred; the present design covers only the
   "address system user daemons" shape.
   The interfaces above are written so that a virtual-users
   variant can implement the same `UserDaemon` exo internally.

3. **Relationship to `daemon-checkin-checkout`.**
   The check-in / check-out commands defined by
   [`daemon-checkin-checkout`](daemon-checkin-checkout.md) move
   immutable trees in and out of one user's daemon.
   A Gateway-mediated host might want a host-scoped variant
   ("publish this `readable-tree` to the Gateway's CAS cache so
   that all User Daemons can serve weblets from it without
   per-user re-ingest").
   The Host-header → sqlite-formula → CAS routing decided above
   already serves this for the read path; a write path
   (operator pre-populates the Gateway's CAS) is still
   underspecified and should be considered before
   `daemon-checkin-checkout` lands.

4. **Cross-host policy file.**
   Remote registrations (those that arrive at the Gateway over
   the public OCapN endpoint rather than the local IPC socket)
   are tagged `remote` and may not host at the host's local
   virtual-host hierarchy unless an operator policy file names
   the public key.
   The format and location of that policy file are not pinned
   here; the implementation PR proposes a concrete shape (likely
   a file under `/etc/endo-gateway/peers/` containing the
   allowed public keys and the virtual-host names they may
   claim).

## Affected Designs

| Design | Relationship |
|--------|-------------|
| [daemon-web-gateway](daemon-web-gateway.md) | The per-user gateway becomes the User Daemon's local registration client; HTTP-virtual-hosting moves to the Endo Gateway. |
| [familiar-gateway-migration](familiar-gateway-migration.md) | Familiar continues to spawn a User Daemon; if a Gateway exists on the host, the User Daemon registers with it instead of binding its own port. |
| [familiar-unified-weblet-server](familiar-unified-weblet-server.md) | The Gateway is the unified server, lifted to host scope; addresses the multi-user multiplex and per-session-confidentiality concerns flagged in that design's 2026-04-17 revision. |
| [familiar-localhttp-protocol](familiar-localhttp-protocol.md) | Unchanged on the Familiar side; the renderer still proxies `localhttp://` to a local HTTP origin, but the origin may now be the Gateway rather than the User Daemon. |
| [gateway-bearer-token-auth](gateway-bearer-token-auth.md) | The bearer-token / rate-limit / CIDR-allowlist work now applies to the Gateway's external surface. |
| [daemon-256-bit-identifiers](daemon-256-bit-identifiers.md) | Per-agent Ed25519 public keys are the registration table's keys. |
| [ocapn-network-transport-separation](ocapn-network-transport-separation.md) | Provides the Noise-based network for the Gateway's external OCapN endpoint. |
| [daemon-docker-selfhost](daemon-docker-selfhost.md) | Docker-self-host design needs to be revised on top of this; PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134) is paused pending. |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) | Possible future host-scoped write path for Gateway CAS pre-population (Open Question 3). |
| [daemon-agent-network-identity](daemon-agent-network-identity.md) | Public-key rotation story; Pass-Invariant-Eq follow-up (Open Question 1). |
| [exo-zip-package](exo-zip-package.md) | Format option for the weblet content archive that the Gateway caches. |
| [daemon-cas-management](daemon-cas-management.md) | Reused for the Gateway's content-addressed cache of weblet assets, served directly from the HTTP path. |
| [daemon-message-streaming](daemon-message-streaming.md) | Streaming chunked HTTP request / response bodies through the relay. |
| [daemon-endo-rust-sqlite](daemon-endo-rust-sqlite.md) | The Gateway holds its weblet-formula table in the same sqlite shape as the per-user daemon. |
| [familiar-bundled-agents](familiar-bundled-agents.md) | The `@apps` special formula on the user side; the Gateway picks a different special formula for its own boot. |
| [weblet-next](weblet-next.md) | Same `@apps` background. |
| [`packages/where`](../packages/where/index.js) | Needs Gateway-side path functions to mux per-mode config trees. |

## Prompt

> Per kriskowal at https://github.com/endojs/endo-but-for-bots/issues/173:
> the Endo project needs an Endo Gateway, a per-host system service that
> HTTP-virtual-hosts OCapN to many users by relaying to per-user Daemons,
> with public-key-keyed registration, weblet + websocket relay, lifecycle
> for both Gateway and User Daemons, and credible local-vs-remote
> attestation for the implicit local-host weblet right.

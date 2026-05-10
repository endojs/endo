# Endo Gateway

| | |
|---|---|
| **Created** | 2026-05-10 |
| **Updated** | 2026-05-10 |
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
The Gateway owns the host's external surface (one port, TLS, virtual
hosting, the OCapN cryptographic transport) and relays into per-user
daemons by their public keys.
Per-user daemons no longer terminate external HTTP for the host;
they connect outbound to the Gateway over a local-only channel and
register the weblets they want exposed.

## Background

The per-user daemon already does almost everything described here,
but for one user at a time:

- It owns a content-addressed store, a formula graph, and per-agent
  Ed25519 keypairs that double as OCapN node identifiers
  ([`daemon-256-bit-identifiers`](daemon-256-bit-identifiers.md)).
- It hosts a built-in HTTP+WebSocket gateway as the `APPS` formula
  ([`daemon-web-gateway`](daemon-web-gateway.md)), routing virtual
  hosts to per-weblet handlers and bridging Chat to CapTP over a
  WebSocket.
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

The per-user Daemon is the wrong place to host a multi-user
virtual-host service for three reasons.
(1) It runs as one OS user and would have to be granted privileges
that crossed user boundaries to relay another user's traffic.
(2) Two daemons on the same host would race for the same port; the
service is implicitly a per-host singleton, but the daemon is
implicitly per-user.
(3) Hosting policy (which users may register weblets, what TLS
certificate to use, whether to expose to the public internet) is
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
   internet ───► │  HTTPS + WSS (OCapN over HTTP)               │
                 │  virtual host: <pubkey>.<host>               │
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
formula at boot in place of the user-side `APPS` formula.

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

```
1. TCP accept on the Gateway's listening port.
2. TLS terminate (if configured); read HTTP request line + Host header.
3. Look up Host in the access-token table.
   - Miss: 404.
   - Hit: locate the (User Daemon, weblet) pair.
4. If method is GET and path resolves to a content-addressed
   asset under the weblet's contentAddress tree:
     serve from the Gateway's CAS cache; no User Daemon round-trip.
5. Otherwise:
     E(userDaemon).handleHttp(accessToken, requestRecord) → response.
6. Write response.
```

`requestRecord` is a passable record of method, path, headers, and
body bytes.
The reply is a passable record of status, headers, and body bytes.
Bodies that exceed an inline-body threshold are streamed as
[`daemon-message-streaming`](daemon-message-streaming.md) chunks
rather than passed inline; this avoids buffering large uploads
through the Gateway's CapTP channel.

### Routing a WebSocket upgrade

The Gateway accepts the WebSocket upgrade itself (this is where
TLS terminates) and proxies frame-for-frame into the User Daemon.

```
1. HTTP request with Upgrade: websocket, Host: <accessToken>.
2. Resolve (User Daemon, weblet) as for HTTP.
3. E(userDaemon).handleWebSocketUpgrade(accessToken, requestRecord)
     returns a Far('WebSocketHandler', { onMessage, onClose }).
4. Gateway completes the WS handshake and pumps frames:
     incoming frame  → E(handler).onMessage(frame)
     outgoing frame  ← E(returnedSink)
5. On close from either side, both sides close.
```

The Gateway does **not** parse or understand the application-level
CapTP carried over the WebSocket; it is a frame-level relay.
This is the only place where the Gateway and User Daemon disagree
about who terminates a protocol layer: TLS terminates at the
Gateway (since it owns the certificate), but CapTP terminates at
the User Daemon (since the User Daemon owns the agent).
The Gateway therefore proxies WS frames in both directions without
inspection.
This matches the framing already used by
[`daemon-web-gateway`](daemon-web-gateway.md): binary WS frames
carrying JSON-encoded CapTP messages.

### OCapN endpoint, separately

Distinct from the per-weblet HTTPS path, the Gateway also exposes a
single OCapN-over-Noise-over-WSS endpoint at the host's bare name
(no virtual host).
Remote OCapN peers contact `wss://<host>/ocapn` and the Gateway
relays into the appropriate User Daemon by the destination node
public key carried in the OCapN locator
([`ocapn-network-transport-separation`](ocapn-network-transport-separation.md)).
This is the same routing key (Ed25519 public key) used by the
local registration table, so a single lookup serves both paths.

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
files, optionally a TLS key, optionally a CAS cache) and avoids
the Gateway's table going stale relative to the live User Daemons.

### Cross-platform service shape

- **Linux**: systemd unit (`endo-gateway.service`), service account
  `endo-gateway`, `Restart=on-failure`, runtime directory
  `/run/endo-gateway/` for the registration socket.
- **macOS**: launchd `LaunchDaemon` plist under
  `/Library/LaunchDaemons/`, runtime directory under `/var/run/`.
- **Windows**: Windows Service with named-pipe registration channel
  at `\\.\pipe\endo-gateway`.
- **Container** (PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)):
  one container running the Gateway, one or more sidecar
  containers running User Daemons.
  Containers share a tmpfs volume for the registration socket; see
  the PR-#134 impact section below.

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

Three options were considered:

(a) **Local-only IPC channel** (UNIX socket / Windows named pipe).
    A registration that arrives over the local IPC socket is, by
    construction, from a process on this host.
    No kernel API is needed beyond the existence of UNIX-domain
    sockets and named pipes.
    The proof-of-possession step described above defends against a
    malicious local user trying to register another user's public
    key on a shared host.

(b) **Loopback TCP plus a kernel credential check** (`SO_PEERCRED`
    on Linux, `LOCAL_PEERCRED` on macOS, `GetNamedPipeClientProcessId`
    on Windows).
    Works, but requires per-OS kernel-API plumbing for what is
    otherwise the same property as (a).

(c) **Cryptographic attestation** backed by a host-only secret
    (e.g., a TPM-sealed key, a file readable only by the local
    daemon at boot).
    Heaviest infrastructure, gains nothing over (a) on a
    cooperative host.

**Recommendation: (a).**
A local-only IPC channel is local-by-construction, requires no
kernel-API portability work, and slots cleanly into the existing
daemon transport (the daemon already binds a UNIX domain socket
for the CLI).
On Linux and macOS this is a UNIX domain socket; on Windows it is
a named pipe; in both cases file-system / pipe permissions handle
who-may-connect.

The proof-of-possession check is **not** about local-vs-remote (the
socket is local-by-construction); it is about distinguishing one
local user from another so that a malicious local user cannot
register another local user's public key.

### Remote registrations

Remote Daemons reach the Gateway over the public OCapN-over-WSS
endpoint, not the local IPC socket.
The Gateway tags those `remote` and refuses any registration
attempt to host at the host's local virtual-host hierarchy unless
the operator's explicit policy file
([`daemon-checkin-checkout`](daemon-checkin-checkout.md)-style
policy is one possible inspiration here, but its current scope is
local check-in / check-out and the cross-host policy file remains
an Open Question; see below) names that public key.

## Cryptographic Protocol for OCapN-over-HTTP

The Gateway terminates HTTP / TLS at the host's port; OCapN runs as
the application protocol over WebSocket frames inside that HTTP
session.
This is the same shape as today
([`daemon-web-gateway`](daemon-web-gateway.md)) but it now sits at
the host scope rather than the user scope.

The session-level confidentiality and authentication that the
existing per-user gateway lacks (and that the
[`familiar-unified-weblet-server`](familiar-unified-weblet-server.md)
2026-04-17 revision flagged as needing Noise) is provided by the
OCapN-Noise network defined in
[`ocapn-network-transport-separation`](ocapn-network-transport-separation.md).
The Gateway speaks Noise to remote peers; against the local IPC
registration socket no encryption is needed because the channel
is local-by-construction.

For the in-browser weblet path, TLS terminates at the Gateway and
the WebSocket frames carry the existing CapTP framing
([`daemon-web-gateway`](daemon-web-gateway.md)) end-to-end between
the browser and the User Daemon.
The Gateway does not see inside the CapTP messages; it only knows
the destination Host.

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
- **Reverse-proxy / TLS**: continues to live in front of the
  Gateway as PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)
  proposes; the Gateway is still the only thing that binds to the
  outside.

PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)'s
remote-bearer-token work
([`gateway-bearer-token-auth`](gateway-bearer-token-auth.md)) is
unaffected; it now applies to the Gateway's own surface rather
than the User Daemon's.
PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)
will need to be rebased to use the Gateway image and to drop its
single-port assumption.

## Open Questions

1. **One config tree or two?**
   Should the Gateway's configuration directory be entirely
   separate (`/etc/endo-gateway/`) from per-user state
   (`~/.local/state/endo/`), or does the User Daemon also have a
   per-host configuration block (e.g., for the registration
   socket path) that lives outside `~/.local`?
   A clean split is simpler to reason about; a shared block is
   nicer for the developer single-host single-user case.

2. **TLS termination policy.**
   Does the Gateway terminate TLS itself (the operator drops a
   key/cert into `/etc/endo-gateway/tls/`), or does it expect a
   reverse proxy in front of it (Caddy, nginx, Traefik) and only
   speak plain HTTP/WS on its bind port?
   PR [#134](https://github.com/endojs/endo-but-for-bots/pull/134)
   leans reverse-proxy.
   A Gateway-terminated path simplifies single-host deployments;
   a reverse-proxy path simplifies certificate management at scale.
   The Gateway probably needs to support both.

3. **Per-host singleton enforcement.**
   How does the Gateway prevent two instances on the same host
   from racing for the port and the registration socket?
   `flock` on a pidfile under the runtime directory is the
   simplest answer; the OS service manager makes this mostly a
   non-issue in production but a concern for dev / test
   environments.

4. **Direct OCapN-CapTP exposure for non-weblet clients.**
   The Gateway's HTTP virtual-host path serves weblets.
   Bare OCapN clients (other daemons, the CLI on a remote machine)
   want to reach a specific agent's powers.
   The OCapN endpoint at `wss://<host>/ocapn` described above is
   one shape; a parallel path at `wss://<host>/ocapn/<pubkey>`
   that scopes to a specific User Daemon is another.
   The choice interacts with how OCapN locators encode the
   destination
   ([`ocapn-network-transport-separation`](ocapn-network-transport-separation.md)).

5. **Relationship to `daemon-checkin-checkout`.**
   The check-in / check-out commands defined by
   [`daemon-checkin-checkout`](daemon-checkin-checkout.md) move
   immutable trees in and out of one user's daemon.
   A Gateway-mediated host might want a host-scoped variant
   ("publish this `readable-tree` to the Gateway's CAS cache so
   that all User Daemons can serve weblets from it without
   per-user re-ingest").
   This is not in scope for the present design but should be
   considered before that design lands.

6. **Public-key rotation.**
   A User Daemon's per-agent keypair is the routing key.
   What is the rotation story?
   The User Daemon can register a new public key (via
   `update()`), but anything that hard-coded the old public key
   in a locator continues to point at the old entry until the
   Gateway is told to retire it.
   The OCapN-side rotation story
   ([`daemon-agent-network-identity`](daemon-agent-network-identity.md))
   is the natural place for this; the Gateway just needs to
   accept multiple-key registrations and let policy decide
   which to keep.

7. **Wire format for the registration protocol.**
   The handshake is described above in CapTP terms (an exo with
   `register`, `publishWeblet`, `update`, `deregister` methods).
   The exact `M.interface` guards, the proof-of-possession nonce
   format, and the heartbeat cadence are not pinned here; they
   should be settled in the implementation PR with the
   maintainer's concurrence.

8. **Daemon-hosting service mode.**
   The issue body mentions a "daemon hosting service" config:
   one Daemon process operating multiple User Daemons on behalf
   of users without their own shell sessions.
   This is plausibly a third Daemon mode (`--mode=user-host`?) on
   top of the two described here, or it is a deployment pattern
   that runs N `--mode=user` instances under one service account.
   Pinning this awaits an explicit need; for now the design
   admits both shapes.

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
| [daemon-checkin-checkout](daemon-checkin-checkout.md) | Possible future host-scoped variant for Gateway CAS pre-population (Open Question 5). |
| [daemon-agent-network-identity](daemon-agent-network-identity.md) | Public-key rotation story (Open Question 6). |
| [exo-zip-package](exo-zip-package.md) | Format option for the weblet content archive that the Gateway caches. |
| [daemon-cas-management](daemon-cas-management.md) | Reused for the Gateway's content-addressed cache of weblet assets. |
| [daemon-message-streaming](daemon-message-streaming.md) | Streaming chunked HTTP request / response bodies through the relay. |

## Prompt

> Per kriskowal at https://github.com/endojs/endo-but-for-bots/issues/173:
> the Endo project needs an Endo Gateway, a per-host system service that
> HTTP-virtual-hosts OCapN to many users by relaying to per-user Daemons,
> with public-key-keyed registration, weblet + websocket relay, lifecycle
> for both Gateway and User Daemons, and credible local-vs-remote
> attestation for the implicit local-host weblet right.

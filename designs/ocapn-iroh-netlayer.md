# OCapN Iroh Netlayer

| | |
|---|---|
| **Created** | 2026-07-13 |
| **Updated** | 2026-07-13 |
| **Author** | Aaron Davis (prompted) |
| **Status** | **Complete** |

## Status

Implemented as `@endo/ocapn-iroh` (`packages/ocapn-iroh/`):

- `src/netlayer.js` — `makeIrohNetLayer`, a connect-style OCapN netlayer
  over iroh 1.0 QUIC.
- `src/stream-adapter.js` — iroh BiStream to `@endo/stream`
  Reader/Writer (mirrors the daemon's iroh stream adapter).
- `src/heartbeat.js` — datagram keep-alive against iroh's ~2 minute QUIC
  idle timeout (mirrors the daemon's iroh heartbeat).
- `src/location.js` — pure location/hints helpers, unit-tested without
  the native binding.
- `test/_mock-iroh.js` — an in-memory duck-typed `@number0/iroh` 1.0
  stand-in; the end-to-end tests (bootstrap fetch, bidirectional
  sessions, crossed hellos, three-party handoff, shutdown) run against
  it in CI. A real two-endpoint integration test is opt-in via
  `ENDO_IROH_INTEGRATION=1`.
- `@endo/ocapn` gained two subpath exports (`./client/types`,
  `./client/util`) so out-of-tree netlayers can reach the
  `NetLayer`/`NetlayerHandlers` types and `locationToLocationId`.

## What is the Problem Being Solved?

`@endo/ocapn` ships two connect-style netlayers: `tcp-testing-only`
(explicitly not for production; no authentication) and `websocket`
(requires a routable listener and layers a challenge/response
`init:peer-auth` protocol over the socket because websockets
authenticate nothing). `@endo/ocapn-noise` adds authenticated
encryption via Noise IK, but still rides on transports that need
routable addresses.

[iroh](https://www.iroh.computer) 1.0 provides exactly the transport
properties an OCapN netlayer wants as intrinsic features:

1. **Dial keys, not IPs.** An iroh `EndpointId` is a 32-byte Ed25519
   public key. Discovery (DNS/pkarr) and the relay mesh resolve it to
   live paths, hole-punching a direct QUIC connection when possible and
   falling back to relays otherwise. Peers behind NAT are reachable
   with no listener configuration.
2. **Mutually authenticated, encrypted connections.** Every QUIC
   connection is end-to-end encrypted and both ends are authenticated
   by their Ed25519 keys.

The daemon already has an iroh transport
(`packages/daemon/src/networks/iroh.js`, design in
[`packages/daemon/designs/iroh-network-design.md`](../packages/daemon/designs/iroh-network-design.md))
speaking the daemon's CapTP-over-netstring protocol. This design brings
the same substrate to the OCapN protocol stack.

## Description of the Design

A new package, `@endo/ocapn-iroh`, exporting
`makeIrohNetLayer({ handlers, logger, ... })` — a **connect-style
netlayer** in the sense of `packages/ocapn/src/client/types.js`: it
moves whole OCapN messages and leaves session establishment to the
OCapN client's standard `op:start-session` handshake (including the
client's crossed-hello resolution), exactly like the tcp and websocket
netlayers. It is registered through the `makeOcapn({ network })`
factory form:

```js
const client = await makeOcapn({
  codec: syrupCodec,
  network: (handlers, logger) => makeIrohNetLayer({ handlers, logger }),
});
```

### Identity and locations

The netlayer binds one iroh endpoint from a 32-byte Ed25519 secret
(caller-supplied for a stable identity, random otherwise). The OCapN
designator **is** the iroh `EndpointId` string:

```
{ type: 'ocapn-peer', network: 'iroh', transport: 'iroh',
  designator: '<EndpointId>',
  hints: false | { relay: '<url>', addrs: '<addr> <addr>' } }
```

Dialing the designator is what authenticates the peer: iroh's QUIC TLS
proves the remote holds the designator's key, so no `init:peer-auth`
style challenge is layered on top. Hints (home relay, public direct
addresses) are optional accelerators; loopback/private addresses are
filtered out unless `publishPrivateAddresses` is set (same-host tests).
The location is computed once at bind time because OCapN identifies
sessions by the full location URI (designator *and* hints): a mutating
advertised location would strand pending sessions.

### Wire shape

- **ALPN** `ocapn/netstring/0`.
- One bidirectional QUIC stream per connection; the dialer opens the
  stream and writes the first frame (`op:start-session`).
- Netstring framing (`@endo/netstring`) over the stream, with a 16 MiB
  inbound frame cap bounding hostile allocations. Each whole frame is
  one OCapN message dispatched to `handlers.handleMessageData`.
- A QUIC datagram heartbeat (30 s beat, 60 s watchdog, lazily armed)
  keeps quiet CapTP sessions alive across iroh's idle timeout and tears
  down demonstrably dead peers, mirroring the daemon transport. The
  heartbeat starts only once a connection is authenticated (see below),
  so it cannot keep an un-authenticated junk connection alive past the
  idle timeout.

### Identity binding

Dialing an `EndpointId` authenticates the peer over QUIC TLS, but the
`op:start-session` handshake — run by the OCapN client — carries a
*claimed* location signed only by a fresh per-session key. The netlayer
binds the two: it exposes a `verifyPeerLocation(connection, peerLocation)`
hook that the client calls during the handshake (after the location
signature validates), and the netlayer asserts the claimed `designator`
equals the QUIC-authenticated remote `EndpointId` (read from the
connection via the 1.0 binding's `remoteId()`). A peer presenting a third
party's designator is rejected with `op:abort`. Without this, an inbound
peer could claim any designator and poison the client's location-keyed
session cache, hijacking later sturdyref fetches and three-party handoffs
to that designator. This mirrors the check the OCapN-Noise network makes
against its Noise-authenticated key. `verifyPeerLocation` is an optional
`NetLayer` method; netlayers without transport authentication (e.g.
`tcp-testing-only`) omit it and are trusted at face value, unchanged.

### Denial-of-service bounds

Inbound connections are unauthenticated until the handshake completes, so
their state is bounded:

- **Handshake deadline.** A connection that completes QUIC/ALPN but does
  not authenticate an OCapN session within `handshakeTimeoutMs` (default
  30 s) is closed.
- **In-progress cap.** At most `maxInboundInProgress` (default 256)
  inbound connections may be wired-but-unauthenticated at once; excess
  inbound connections are refused before any session state is built.
- **Lazy identity.** The OCapN client mints a connection's session keypair
  lazily, on first use, so an inbound connection that never sends a valid
  hello never costs a keypair.
- **Heartbeat gating.** The keep-alive heartbeat starts only after
  authentication, so an un-authenticated silent peer is reaped by the
  handshake deadline (and an authenticated-then-silent peer by the
  keep-alive watchdog) rather than being kept alive indefinitely.

### Hint hygiene

A location can arrive from an untrusted third party (in a gift, a
sturdyref, or a handoff). Private/loopback direct-address hints on a
received location are dropped before dialing (unless the netlayer is in
same-host `publishPrivateAddresses` mode), so a hostile location cannot
steer our QUIC dials at internal hosts. The `EndpointId` still
authenticates the peer and discovery can resolve it without hints.

### Testability without the native binding

`@number0/iroh` is a NAPI binding declared as an `optionalDependency`
and imported dynamically. The binding surface is injectable
(`makeIrohNetLayer({ iroh })`); the test suite runs the full OCapN
session flow against an in-memory mock network that chunks writes into
7-byte pieces to exercise netstring reassembly. The real-binding
integration test is gated behind `ENDO_IROH_INTEGRATION=1` because it
can reach iroh's public relay and discovery services.

## Security Considerations

- Outbound authenticity: dialing an `EndpointId` authenticates the peer
  end-to-end via QUIC TLS — stronger than the websocket netlayer's
  challenge protocol and equivalent in intent to the Noise IK
  handshake's responder authentication.
- Identity binding (see § Identity binding): the peer's claimed OCapN
  designator is bound to the QUIC-authenticated `EndpointId` via
  `verifyPeerLocation`, so a peer cannot present a third party's location.
  The OCapN session key remains a fresh per-connection Ed25519 keypair
  exchanged in `op:start-session`; the iroh key authenticates the
  transport designator, and the binding ties the two together.
- Inbound connections are accepted from any endpoint speaking the ALPN,
  as with the tcp/websocket netlayers; capability discipline (swissnum
  possession) governs authority, and the DoS bounds above cap the state
  an unauthenticated flood can pin.
- Frame length is capped; per-connection state is torn down on stream
  EOF, QUIC close, write failure, or keep-alive timeout.

## Compatibility Considerations

- New package; no changes to existing wire protocols.
- `@endo/ocapn` adds two subpath exports (`./client/types`,
  `./client/util`), an optional `verifyPeerLocation` method on the
  `NetLayer` type (called during the handshake when a netlayer provides
  it), and hardens the client's session establishment against
  asynchronous `connect` (in-flight dedup and a post-connect active-
  session re-check). All additive/behavioral-fix; no wire change.
- The daemon's iroh transport (`endo/captp/0` ALPN, daemon CapTP) and
  this netlayer (`ocapn/netstring/0` ALPN, OCapN CapTP) are distinct
  protocols and do not cross-connect; they can share one machine (and
  even one identity scheme) without interference thanks to ALPN
  dispatch.

## Test Plan

- Pure unit tests: location/hints round-trips and private-address
  filtering; stream adapter read/EOF/finish/reset semantics.
- Mock end-to-end: bootstrap fetch, session reuse, bidirectional
  sessions, simultaneous crossed dials, three-party handoff, unknown
  designator rejection, wrong-network rejection, shutdown behavior.
- Security/robustness: designator-vs-EndpointId mismatch rejected;
  concurrent same-location establishment deduped to one session; an
  inbound session completing during an outbound dial is adopted; a peer
  that never completes the handshake is reaped by the deadline; the
  inbound in-progress cap refuses excess connections.
- Opt-in integration: two real iroh endpoints carry an OCapN session
  (`ENDO_IROH_INTEGRATION=1`).

## Design Decisions

1. **Connect-style netlayer, not a `provideSession` network.** iroh
   already provides authentication and encryption, so the standard
   `op:start-session` handshake over the encrypted stream suffices; the
   noise package's session machinery (crossed-hello tiebreakers,
   inbound session queues) would be duplicated complexity for no
   security gain.
2. **Designator = EndpointId.** One name to dial and authenticate.
   Deriving the iroh key from a separate OCapN identity (as the daemon
   derives its iroh secret from the NodeNumber) is left to embedders
   via the `secretKey` option.
3. **Netstring framing** for parity with the daemon iroh transport and
   the ocapn-noise transports, rather than the comma-less syrup framing
   the tcp-testing netlayer is migrating toward; the framing is private
   to this netlayer and versioned by its ALPN.
4. **Static location.** Hints are read once at bind; peers can always
   dial by designator alone through discovery.

## Prompt

> make an iroh 1.0 net layer for ocapn

# Iroh Network Transport for the Endo Daemon

Status: Draft / proposal with an initial implementation.
Owner: networking.

## Motivation

Endo daemons connect to one another through a pluggable network transport
abstraction (`EndoNetwork`).
Before this transport, three real transports existed:

- `tcp-netstring` — direct TCP, requires an open, routable port.
- `libp2p` — peer-to-peer over the IPFS/Amino DHT with WebRTC, circuit
  relay, and DCUtR hole-punching.
- `ws-relay` — a WebSocket relay for browser and NAT-bound clients.

We want a transport with two properties in particular:

1. **Dial keys, not IPs.**
   A peer should be reachable by its public key alone.
   The caller names *who* it wants to talk to, and the transport finds a
   path — direct when possible, relayed when not — without the caller ever
   handling an IP address or worrying about NAT.

2. **TLS / mutual authentication and encryption.**
   Every connection should be end-to-end encrypted and both ends should be
   cryptographically authenticated by their key.

[iroh](https://www.iroh.computer) ("dial keys, not IPs") delivers exactly
these two properties as intrinsic features:

- An iroh `NodeId` is a 32-byte Ed25519 public key.
  You dial a `NodeId`; iroh's discovery services (DNS / pkarr / mDNS) and
  relay mesh resolve it to live network paths and hole-punch a direct QUIC
  connection whenever possible, falling back to relays otherwise.
- iroh is built on QUIC, so every connection is end-to-end encrypted and
  mutually authenticated by the endpoints' Ed25519 keys, and can carry any
  number of concurrent multiplexed streams.

iroh also subsumes most of what the `libp2p` transport wires up by hand
(bootstrap nodes, DHT, circuit relay, DCUtR): discovery, hole-punching, and
relay fallback are built in.
The Ed25519 `NodeId` is the same key family as Endo's `NodeNumber`, which
makes the identity story unusually clean (see
[§ Identity and trust](#identity-and-trust)).

iroh ships a maintained Node.js NAPI binding,
[`@number0/iroh`](https://www.npmjs.com/package/@number0/iroh), so the
transport can run inside an Endo worker like the `libp2p` transport does.

## Background: how a transport plugs in

Each transport implements the `EndoNetwork` interface
(`packages/daemon/src/types.d.ts`):

```ts
interface EndoNetwork {
  supports: (network: string) => boolean;       // matches a URL protocol
  addresses: () => Array<string>;               // self-addresses to publish
  connect: (address: string, ctx) => Promise<EndoGateway>;
}
```

A transport is an *unconfined* caplet exporting `make(powers, context)`.
It is installed with `makeUnconfined` and then moved under `@nets/<name>`,
where the daemon discovers it at boot (see `setup-libp2p.js`).
From its `powers` a transport gets:

- `getPeerInfo()` → `{ node: NodeNumber, addresses }`
- `greeter()` → the local `EndoGreeter` (bootstrap for inbound connections)
- `gateway()` → the local `EndoGateway` (bootstrap for outbound connections)
- `lookup(name)` / `storeValue(value, name)` for persisting transport config.

The transport's only job is to move bytes.
On top of each byte stream it layers CapTP over netstring framing via
`makeNetstringCapTP(name, writer, reader, cancelled, bootstrap)`
(`packages/daemon/src/connection.js`), then performs the greeter handshake:

- **Outbound** (`connect`): bootstrap is `localGateway`; the transport
  retrieves the remote greeter with `getBootstrap()` and calls
  `E(remoteGreeter).hello(localNodeId, localGateway, canceller, cancelled)`,
  returning the remote gateway.
- **Inbound** (accept): bootstrap is `localGreeter`; the remote calls our
  `hello(...)` and the daemon's `remote-control.js` state machine resolves
  crossed-hellos by `NodeNumber` bias.

The transport reuses all of this unchanged.
Everything below is about producing the byte streams.

## Design

### Components

```
packages/daemon/src/networks/
  iroh.js                 # the EndoNetwork transport (make/connect/accept)
  iroh-stream-adapter.js  # iroh BiStream  <->  @endo/stream Reader/Writer
  iroh-address.js         # pure URL <-> NodeAddr helpers (unit-tested)
  setup-iroh.js           # installer caplet: makeUnconfined + move to @nets/iroh
```

`@number0/iroh` is added to `optionalDependencies` (see
[§ Packaging](#packaging-and-native-binaries)).

### Address scheme

Mirroring the `libp2p` transport's URL-with-hints form, an iroh address is:

```
iroh+captp0:///<nodeId>?relay=<relayUrl>&addr=<directAddr1>&addr=<directAddr2>
```

- The case-sensitive `NodeId` lives in the URL *pathname* (URL hostnames are
  lowercased; the iroh `NodeId` base32 is lowercase today, but pathname
  placement matches the `libp2p` precedent and is robust to that changing).
- `relay` carries the node's home relay URL, and each `addr` carries a known
  direct socket address.
  These are *hints*: a fresh peer can dial by `NodeId` alone and let
  discovery do the work, but published hints let a dialer skip the discovery
  round-trip.
  Loopback/private addresses are excluded from published hints, as in the
  `libp2p` transport.

`iroh-address.js` exposes pure, unit-tested helpers:

- `buildIrohAddress({ nodeId, relayUrl, addresses })` → address string
- `parseIrohAddress(address)` → `{ nodeId, relayUrl, addresses }`
  (an iroh `NodeAddr`, which is a plain object — no native class needed)
- `supportsIrohAddress(addressOrProtocol)` → boolean

### Connection mechanics

iroh's connection model differs from libp2p's "one duplex stream per
protocol": an iroh `Connection` is a QUIC connection that carries multiple
bidirectional streams.
For CapTP we use exactly one bidi stream per connection.

**Outbound** (`connect(address, ctx)`):

```js
const nodeAddr = parseIrohAddress(address);          // { nodeId, relayUrl, addresses }
const addr = new EndpointAddr(                        // 1.0 dials an EndpointAddr
  EndpointId.fromString(nodeAddr.nodeId),
  nodeAddr.relayUrl,
  nodeAddr.addresses,
);
const conn = await endpoint.connect(addr, ALPN);      // QUIC, TLS-authenticated
const bi = await conn.openBi();                       // { send, recv }
const { reader, writer, closed } = adaptIrohStream(bi, conn);
const { getBootstrap } = makeNetstringCapTP('Endo', writer, reader, cancelled, localGateway);
return E(getBootstrap()).hello(localNodeId, localGateway, canceller, cancelled);
```

`ALPN` is the CapTP protocol identifier as a plain `Array<number>` byte array
(the binding marshals `Vec<u8>` from a JS Array, not a TypedArray).

**Inbound** is driven by an explicit accept loop. 1.0 removed the 0.35
`protocols` table; instead the endpoint advertises the ALPN at bind time and
`acceptNext()` yields one inbound connection attempt at a time (or `null` once
the endpoint closes), each driven through `Incoming → Accepting → Connection`:

```js
const endpoint = await Endpoint.bind({ secretKey, alpns: [ALPN] });

const acceptLoop = async () => {
  for (;;) {
    const incoming = await endpoint.acceptNext();
    if (!incoming) return;                  // endpoint closed
    handleIncoming(incoming).catch(logAndIgnore); // isolate per-connection errors
  }
};

const handleIncoming = async incoming => {
  const conn = await (await incoming.accept()).connect();
  const bi = await conn.acceptBi();
  const { reader, writer } = adaptIrohStream(bi, conn);
  makeNetstringCapTP('Endo', writer, reader, cancelled, localGreeter);
  await conn.closed();
};
```

By convention the dialer opens the bi stream and writes the first CapTP
frame (the `hello` call); the accepter's `acceptBi()` resolves when that
stream arrives.

### Stream adapter

`adaptIrohStream(bi, conn)` bridges iroh's `SendStream`/`RecvStream` to the
`@endo/stream` `Reader<Uint8Array>` / `Writer<Uint8Array>` that
`makeNetstringCapTP` consumes:

- **Read**: each `reader.next()` does one `recv.read(sizeLimit)`, which
  resolves with the next chunk of bytes; an empty result means EOF (iroh's
  QUIC read only yields zero bytes once the stream has finished), which
  resolves `closed`. Otherwise the chunk (an `Array<number>` or Buffer) is
  normalised to a `Uint8Array` and yielded.
  Netstring reframes across read boundaries, so short reads are fine.
- **Write**: `writer.next(bytes)` → `send.writeAll(Array.from(bytes))` (the
  binding takes a plain `Array<number>`); `writer.return()` → `send.finish()`;
  `writer.throw()` → `send.reset()`.
- **closed**: resolves on EOF, on `conn.closed()`, or on writer teardown.

The adapter depends only on the duck-typed shape of the stream object, so it
is unit-testable with a fake stream and needs no native binding.

### Node lifecycle

- One `Endpoint.bind({ secretKey, alpns: [ALPN] })` per transport instance.
  `bind` applies iroh's n0 preset (relays + discovery), then our options, so
  the transport keeps the "dial keys, not IPs" default.
  Endo owns identity and persistence, so the key is supplied deterministically
  (below) rather than persisted by iroh.
- `addresses()` must be synchronous; since 1.0 `endpoint.addr()` is also
  synchronous, so the current `EndpointAddr` is read on demand and built into
  an address string (no interval-based cache is needed). If the read throws,
  the transport falls back to a bare-key address — the peer is still dialable
  by NodeId through discovery.
- The disposal hook (`addDisposalHook`) closes the endpoint (which also ends
  the accept loop, since `acceptNext()` then resolves to `null`) and waits for
  in-flight connections to drain, matching the `libp2p` transport.

### Keep-alive and liveness

iroh's QUIC stack closes a connection after its default max idle timeout
(~2 minutes), and `@number0/iroh`'s `NodeOptions` exposes no transport config
to shorten that or to enable QUIC-level keep-alive.
A quiet but healthy CapTP session — two daemons that have swapped bootstrap
references and are each awaiting the other — was therefore being torn down
after about two minutes of silence, surfacing as `iroh stream closed`.

`makeIrohHeartbeat(connection)` (see `src/networks/iroh-heartbeat.js`) keeps
such sessions alive and detects a genuinely dead peer:

- **Heartbeat.** Every `HEARTBEAT_INTERVAL_MS` (30 s) it sends a one-byte QUIC
  **datagram**.
  DATAGRAM frames are ack-eliciting and travel out-of-band from the CapTP bi
  stream, so a beat resets both endpoints' QUIC idle timers (RFC 9000 § 10.1)
  without disturbing the netstring frame the reader and writer share.
  Both peers run the module, so beats flow in both directions.
- **Keep-alive watchdog.** `KEEPALIVE_TIMEOUT_MS` is twice the heartbeat
  interval (60 s), so a single dropped beat is tolerated.
  If a peer that has been heartbeating falls silent for a full window, the
  session is presumed dead.
- **Lazy arming.** The watchdog is armed by the peer's *first* inbound
  datagram, not at connection start.
  A peer that never heartbeats — an older daemon without this module — is left
  to iroh's QUIC idle timeout instead of being torn down at 60 s, so the
  heartbeat is safe to roll out before every peer has it.

On a keep-alive timeout (and on any stream close), `serveStream` tears the
session down so reachable objects break promptly rather than hanging:
`capTp.close(reason)` aborts CapTP — rejecting every outstanding question and
revoking imported presences with `reason` — and the QUIC connection is closed.
On the outbound path that, via the existing `capTp.closed → cancelConnection`
wiring, also cancels the peer's connection context.

## Identity and trust

This is the crux of the "dial keys" property and deserves care.

### What the keys are

- An Endo `NodeNumber` is a 64-hex-character string that **is** the daemon's
  root Ed25519 public key (`types.d.ts`: *"A 64-character hex string
  (Ed25519 public key) identifying a node"*).
  The matching private key is held by the daemon core; caplets are given a
  `sign()` *capability* (`daemon.js`: `sign: hexBytes => …signBytes…`), not
  raw private key bytes.
- An iroh `NodeId` is **also** a 32-byte Ed25519 public key, and an iroh node
  is constructed from a 32-byte Ed25519 secret.

So in principle the two identities can be made *the same key*: if iroh's
secret were the daemon's root Ed25519 private key, then iroh `NodeId` would
equal the Endo `NodeNumber`, and "dial the key" would mean dialing the node's
real Endo identity, authenticated end-to-end by QUIC TLS. That is the ideal.

### What this initial implementation does

The initial implementation derives the iroh secret **deterministically from
the `NodeNumber`**, exactly as the existing `libp2p` transport derives its
peer key (`derivePrivateKey` in `libp2p.js`):

```js
secretKey = Array.from(fromHex(localNodeId).slice(0, 32)); // 32-byte seed
```

This yields a stable iroh `NodeId` across restarts and is consistent with
the precedent already in the tree.
The resulting iroh `NodeId` is a *transport-layer* identity, distinct from
but deterministically tied to the Endo `NodeNumber`, and it is published in
the address (like the `libp2p` peer id).
At the transport layer this fully delivers the two requested properties:
peers are dialed by key, and connections are TLS-mutual-authenticated and
encrypted.

### Known limitation and the principled end-state

Because `NodeNumber` is a *public* value (it appears in formula identifiers
and `endo://` URLs), deriving the transport key from it as a seed means the
transport key is itself derivable by anyone who knows the `NodeNumber`.
The `libp2p` transport has the same property today.
Consequently the iroh `NodeId` here authenticates *a* deterministic
transport key, not exclusive possession of the node's root secret, and an
accept-side check of the form "does the claimed `NodeNumber` derive to the
QUIC-authenticated key" would add no security under this scheme (an
impersonator can derive the same key).
We therefore do **not** add such a check; doing so would be security theater.

The principled end-state, recommended as a follow-up, is to bind the iroh
identity to the daemon's **real** root key so that
`iroh NodeId === NodeNumber`:

- Option A — give the transport caplet the root Ed25519 secret seed through a
  narrow new power (e.g. `getNodeNetworkSecret()` returning 32 bytes).
  Simplest; the tradeoff is handing root key material to an unconfined
  transport caplet (which is already highly trusted).
- Option B — have the daemon core construct the iroh node (it already holds
  the secret and exposes `signBytes`) and hand the transport only the live
  endpoint.
  Keeps the secret in the core at the cost of a wider power surface.

Either option makes the QUIC TLS handshake prove possession of the node's
real Endo identity, at which point dialing an iroh `NodeId` is
indistinguishable from authenticating an Endo `NodeNumber`, and the
crossed-hello `hello(localNodeId, …)` assertion becomes cryptographically
backed rather than asserted.
This is a daemon-core change with its own review surface and is intentionally
out of scope for the initial transport.

## Packaging and native binaries

`@number0/iroh` is a prebuilt NAPI native module with per-platform packages.

- It is declared in `optionalDependencies` so that `install` does not hard
  fail on platforms without a prebuilt binary; the transport simply will not
  be installable there.
- The native module is loaded **only** inside the unconfined iroh worker.
  Per the daemon's lockdown rules the Electron main process and any
  SES-locked context must never import it; the transport caplet runs in an
  already-unconfined worker, as `libp2p` does.

## Testing

- **Unit (no native binding, run in CI):**
  - `iroh-address.test.js` — round-trips `build`/`parse`, hint filtering,
    `supports`.
  - `iroh-stream-adapter.test.js` — read framing, EOF, write/finish/reset,
    and `closed` resolution against a fake stream.
  - key-derivation determinism and 32-byte length.
- **Integration (opt-in via `ENDO_IROH_INTEGRATION=1`, also requires the
  native binding):** `iroh-network.test.js` stands up two real iroh nodes and
  drives a CapTP round-trip through the same stream adapter and
  netstring/CapTP layering the transport uses. It is gated behind an env var
  because it reaches iroh's public relay/discovery network and is therefore
  unsuitable for unattended CI; the pure logic it covers is also unit tested.

### Verifying discovery

The headline property — dialing a peer by its **NodeId alone**, with no
relay or direct-address hints — depends on iroh's default discovery
(`discovery_n0`, enabled because the transport binds with the n0 preset).
This cannot be exercised in a restricted sandbox (which blocks iroh's
DNS/pkarr endpoints and reports placeholder addresses), so it is verified
manually on a real network.

`scripts/iroh-discovery-check.mjs` runs two checks in one process and prints
a verdict: it dials by NodeId only with the server bound under the n0 preset
(discovery enabled — expected to succeed) and again with the server bound
under the minimal preset (no discovery or relay — expected to fail with "No
addressing information for NodeId"). A success-then-failure proves discovery
is what carried the dial.

```sh
cd packages/daemon
node scripts/iroh-discovery-check.mjs
# slower networks may need a longer publish-propagation wait:
IROH_DISCOVERY_WAIT_MS=20000 node scripts/iroh-discovery-check.mjs
```

Requires outbound access to iroh's relay (`*.relay.iroh.network`) and
discovery (`dns.iroh.link`) plus UDP for QUIC/hole-punching. A FAIL on the
discovery-enabled check therefore indicates blocked egress (or a publish
that has not yet propagated — raise `IROH_DISCOVERY_WAIT_MS`), not a
transport defect.

For a faithful cross-network result (NAT traversal + relay + discovery),
run two nodes on **different machines/networks**. Server (prints its NodeId
and stays up):

```js
import { Endpoint } from '@number0/iroh';
const ALPN = Array.from(new TextEncoder().encode('endo/captp/0'));
const enc = new TextEncoder();
const node = await Endpoint.bind({
  secretKey: Array.from(crypto.getRandomValues(new Uint8Array(32))),
  alpns: [ALPN],
}); // n0 preset (relays + discovery) by default
console.log('Dial me by this NodeId:', node.id().toString());
(async () => {
  for (;;) {
    const incoming = await node.acceptNext();
    if (!incoming) return;
    const conn = await (await incoming.accept()).connect();
    const bi = await conn.acceptBi();
    await bi.recv.readToEnd(64);
    await bi.send.writeAll(Array.from(enc.encode('pong')));
    await bi.send.finish();
    await conn.closed();
  }
})();
await new Promise(() => {}); // keep running
```

Client on the other machine (`node client.mjs <NodeId>`):

```js
import { Endpoint, EndpointAddr, EndpointId } from '@number0/iroh';
const ALPN = Array.from(new TextEncoder().encode('endo/captp/0'));
const enc = new TextEncoder();
const dec = new TextDecoder();
const client = await Endpoint.bind({
  secretKey: Array.from(crypto.getRandomValues(new Uint8Array(32))),
});
const addr = new EndpointAddr(EndpointId.fromString(process.argv[2]));
const conn = await client.connect(addr, ALPN);
const bi = await conn.openBi();
await bi.send.writeAll(Array.from(enc.encode('ping')));
await bi.send.finish();
const out = await bi.recv.readExact(4);
console.log('SUCCESS:', dec.decode(Uint8Array.from(out)), '— dialed by key across networks');
await client.close();
```

Note: the Endo daemon path does not exercise *pure* discovery by default,
because invitation locators embed the relay/address hints alongside the key,
so connections succeed via the hints before discovery is needed. To force
the discovery path end-to-end, strip an accepted address down to a bare
`iroh+captp0:///<nodeId>` (no query string) before connecting.

## Open questions


1. Pursue the real-key binding (§ Identity) in this milestone or as a
   follow-up?
   The initial transport is shippable and matches `libp2p`; the binding is
   the security upgrade.
2. Persistent vs. memory iroh node — memory is correct given Endo-owned
   identity, but a persistent node would let iroh cache discovery/peer state
   across restarts.
3. Self-hosted relay/discovery: n0's public relays are free through
   2026-12-31; production deployments should plan to point at their own.

## References

- iroh 1.0 — "Dial Keys, not IPs": https://www.iroh.computer/blog/v1
- `@number0/iroh` (npm): https://www.npmjs.com/package/@number0/iroh
- Endo `libp2p` transport: `packages/daemon/src/networks/libp2p.js`
- CapTP-over-netstring: `packages/daemon/src/connection.js`

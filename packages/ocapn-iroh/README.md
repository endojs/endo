# @endo/ocapn-iroh

An [iroh](https://www.iroh.computer) 1.0 QUIC netlayer for
[`@endo/ocapn`](../ocapn/README.md).

"Dial keys, not IPs": a peer's OCapN designator is its iroh `EndpointId` —
a 32-byte Ed25519 public key — and iroh resolves it to live network paths
through its discovery services and relay mesh, hole-punching a direct QUIC
connection whenever possible and falling back to relays otherwise.
Every connection is end-to-end encrypted and mutually authenticated by the
endpoints' keys, so dialing a designator authenticates the peer at the
transport layer; no challenge/response protocol is layered on top
(contrast the websocket netlayer's `init:peer-auth` exchange, which exists
because plain websockets authenticate nothing).

## Wire shape

- **ALPN** — `ocapn/netstring/0`.
- **Streams** — one bidirectional QUIC stream per connection; by
  convention the dialer opens the stream and writes the first frame (the
  OCapN `op:start-session`).
- **Framing** — netstring-framed OCapN messages, in the codec the
  embedding `makeOcapn` instance was constructed with.
- **Sessions** — the standard OCapN `op:start-session` handshake, run by
  the OCapN client over this netlayer; crossed hellos are resolved by the
  client's session-key comparison, as with the other connect-style
  netlayers.
- **Keep-alive** — a QUIC datagram heartbeat keeps quiet CapTP sessions
  alive across iroh's ~2 minute idle timeout and presumes the peer dead
  after two missed beats (mirroring the `@endo/daemon` iroh transport).

## Locations

```js
{
  type: 'ocapn-peer',
  network: 'iroh',
  transport: 'iroh', // legacy field; prefer `network`
  designator: '<iroh EndpointId string>',
  hints: false | { relay: '<relayUrl>', addrs: '<addr> <addr>' },
}
```

The designator alone is sufficient: iroh discovery resolves an
`EndpointId` to live paths.
`relay` and `addrs` are dialing hints that let a dialer skip a discovery
round-trip; loopback/private addresses are excluded from published hints
by default (pass `publishPrivateAddresses: true` for same-host tests).
The location is computed once, when the endpoint binds, because OCapN
identifies sessions by the full location URI (designator *and* hints).

## Usage

```js
import { makeOcapn } from '@endo/ocapn';
import { syrupCodec } from '@endo/ocapn/syrup';
import { makeIrohNetLayer } from '@endo/ocapn-iroh';

const client = await makeOcapn({
  codec: syrupCodec,
  network: (handlers, logger) => makeIrohNetLayer({ handlers, logger }),
  locator: new Map([['Greeter', greeter]]),
});
```

Supply a persistent 32-byte `secretKey` to keep a stable designator
across restarts; a fresh random key is generated when omitted.

## The native binding

The netlayer drives iroh through the
[`@number0/iroh`](https://www.npmjs.com/package/@number0/iroh) NAPI
binding, declared as an `optionalDependency` because prebuilt binaries do
not exist for every platform.
The binding is imported dynamically the first time `makeIrohNetLayer` is
called without an injected `iroh` module, so the package remains loadable
where the binding is absent.
The binding surface is injectable (`makeIrohNetLayer({ iroh })`), which is
how the test suite runs against an in-memory mock network without native
code; a real two-endpoint integration test is opt-in via
`ENDO_IROH_INTEGRATION=1`.

## Related

- Design: [`designs/ocapn-iroh-netlayer.md`](../../designs/ocapn-iroh-netlayer.md)
- The `@endo/daemon` iroh transport this mirrors:
  [`packages/daemon/designs/iroh-network-design.md`](../daemon/designs/iroh-network-design.md)

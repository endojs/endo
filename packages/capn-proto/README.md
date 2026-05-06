# @endo/capn-proto

A pure-JavaScript implementation of the [Cap'n Proto RPC
protocol](https://capnproto.org/rpc.html), built on `@endo/eventual-send` so
that remote capabilities are exposed as `HandledPromise`-backed `Presence`
values usable through the wavy-dot `E()` operator.

Highlights:

- **Real Cap'n Proto wire format** — segments, pointers (struct, list, far,
  capability), text/data, packed encoding, and stream framing as specified by
  `c++/src/capnp/rpc.capnp`. A peer running this implementation is byte-level
  compatible with other Cap'n Proto RPC implementations at the message layer.
- **Four-table state machine** — Questions, Answers, Exports, Imports,
  scoped per peer connection, with 32-bit unsigned IDs and free-list reuse.
- **Promise pipelining** — `PromisedAnswer { questionId, transform }` with
  `getPointerField` ops keyed by **field ordinals** (registered via per-interface
  ordinal maps).
- **Identity preservation** — reference equality of `Presence` objects across
  re-imports of the same `ExportId`; a `WeakMap` keeps each value mapped to one
  `ExportId` until it is `Release`d.
- **GC** — automatic `Release` and `Finish` messages driven by
  `FinalizationRegistry` on imported `Presence` and on returned question
  promises.
- **Tribble resolution rule** — when a promise `P` resolves to a remote `R`,
  further messages addressed to `P` are routed strictly via `R`. Combined with
  the standard 2-hop `Disembargo { senderLoopback / receiverLoopback }`
  exchange, this avoids the Tribble 4-way race entirely (see
  `test/tribble-4way.test.js`).
- **Three-party handoff (Level 3)** — `Provide` / `Accept` with vines for
  fallback, including the `Disembargo { context.accept / context.provide }`
  exchange for cross-vat embargo extension.
- **Trap** — the synchronous `SharedArrayBuffer`-backed Trap mechanism from
  `@endo/captp` is reused to permit synchronous round-trips when both peers
  share an `Atomics`-capable transfer buffer.
- **Schema-driven, byte-compatible with capnp-C++.** Method parameters
  and results are encoded as Cap'n Proto structs at the
  `Payload.content` AnyPointer slot — wire-identical to what
  `capnpc`-generated code emits. Every called method needs a
  registered `methodCodec`, typically derived automatically via
  `loadSchema(text).registerInterface(registry, name)`.
- **Per-interface ordinal maps** — explicitly registered, no name-to-ordinal
  heuristic.

## Status

Implementation in this package targets RPC Level 1 + Level 3. Level 2 (saved
references) and Level 4 (Join) are out of scope for this release.

## Quick start

```js
import { makeCapnp, loadSchema, makeInterfaceRegistry, E } from '@endo/capn-proto';
import { makeExo } from '@endo/exo';

const schema = loadSchema(`
@0xa1b2c3d4e5f60001;
interface Greeter @0xa1b2c3d4e5f60718 {
  hello @0 (name :Text) -> (greeting :Text);
}
`);
const interfaceRegistry = makeInterfaceRegistry();
schema.registerInterface(interfaceRegistry, 'Greeter');

// `transport` is any duplex carrier of framed bytes (TCP socket, WebSocket,
// MessageChannel, ...). It must call `dispatch` for each inbound message
// and accept outbound bytes via the `send` callback we pass to makeCapnp.
const greeter = makeExo('greeter', undefined, {
  hello({ name }) {
    return { greeting: `hello, ${name}` };
  },
});
const { dispatch, getBootstrap, abort, stats } = makeCapnp({
  send: framed => transport.write(framed),
  bootstrap: greeter,
  interfaceRegistry,
});
transport.onMessage(framed => dispatch(framed));

const remote = getBootstrap();
const { greeting } = await E(remote).hello({ name: 'world' });
console.log(greeting);
```

For multi-peer setups (Level 3 three-party handoff), instantiate one
`makeCapnp` per peer and share both an `InterfaceRegistry` AND a
`CapHomeRegistry` between them. The `CapHomeRegistry` is the network-wide
WeakMap of `Presence → { hostConnection, hostImportId }` that lets B's
encoder recognise "this cap was imported from C, not minted locally" and
trigger the auto-Provide flow instead of becoming an L1 forwarder.

```js
import { makeCapnp, makeInterfaceRegistry, makeCapHomeRegistry } from '@endo/capn-proto';

const interfaceRegistry = makeInterfaceRegistry();
const capHomes = makeCapHomeRegistry();

const aToB = makeCapnp({ send: ..., interfaceRegistry, capHomes, network, recipientVatId: VAT_B });
const aToC = makeCapnp({ send: ..., interfaceRegistry, capHomes, network, recipientVatId: VAT_C });
// ... one makeCapnp per (vat, peer) pair, all sharing the same registry.
```

## Public API surface

The package re-exports a wider-than-usual set of helpers from
`src/index.js`. In addition to the high-level `makeCapnp`, `makeLoopback`,
`makeTwoPartyVatNetwork`, `makeInterfaceRegistry`, `makeCapHomeRegistry`,
and `loadSchema` factories, we also re-export:

- The wire primitives `frameSegments`, `unframeSegments`, `pack`, `unpack`,
  `readPointer`, `writePointer`, `resolvePointer`, `makeMessageBuilder`,
  `makeMessageReader`, and `WORD_SIZE`.
- The rpc.capnp message encoders / decoders `encodeBootstrap`,
  `encodeCall`, `encodeReturn`, `encodeFinish`, `encodeResolve`,
  `encodeRelease`, `encodeDisembargo`, `encodeProvide`, `encodeAccept`,
  `encodeUnimplemented`, `encodeAbort`, `decodeMessage`,
  `encodeCapContent`, and `readCapContent`.
- The schema-runtime building blocks `parseCapnpSchema`, `layoutSchema`,
  `layoutStruct`, `encodeRootStruct`, `decodeRootStruct`,
  `encodeStructInto`, `decodeStructFrom`.

These are not internal — they exist so that users who need to interoperate
with non-`@endo/capn-proto` peers (e.g. authoring a custom `VatNetwork`,
producing test fixtures, or integrating with a hand-written Cap'n Proto
encoder elsewhere in their stack) can do so without forking the package.
Public typedefs (`CapDescriptor`, `VatNetwork`, `MethodCodec`,
`InterfaceDescriptor`, `CapHome`, `CapHomeRegistry`) live in
`src/types.js` and are importable via
`import('@endo/capn-proto/src/types.js').T`.

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

### A note on L3 wire-format compatibility

The Cap'n Proto reference implementation in C++ has shifted its L3
machinery substantially between releases:

- **`libcapnp` 1.0.x** (the Debian / Ubuntu / Homebrew version this
  package's CI tests against) defines the L3 messages on the wire
  (`Provide`, `Accept`, `Disembargo`, `ThirdPartyCapDescriptor`) but
  the `VatNetwork` C++ class declares only the L0 `connect` / `accept`
  methods — L3 hooks are explicitly marked
  `// Level 4 features ----- // TODO(someday)`. There is no way to
  build a working L3-capable `VatNetwork` against `libcapnp` 1.0.x
  even with custom subclassing.
- **`libcapnp` 2.0-dev** (built from upstream HEAD) adds the L3
  `VatNetwork` API (`canIntroduceTo`, `introduceTo`,
  `connectToIntroduced`, `awaitThirdParty`, `completeThirdParty`,
  `forwardThirdPartyToContact`) AND breaks the on-the-wire `Accept`
  and `Disembargo` shapes:
  - `Accept.embargo` is widened from `Bool` to
    `:ThirdPartyEmbargoId` (a `Data` byte string, second pointer
    slot).
  - `Disembargo.context.accept` is widened from `Void` to
    `:ThirdPartyEmbargoId` (`Data`); the `provide` arm is removed
    entirely, with B forwarding the same `accept`-arm Disembargo to
    C with `target = promisedAnswer{provideQid}`.
  - The AnyPointer slot logical types are renamed
    `RecipientId → ThirdPartyToAwait`,
    `ProvisionId → ThirdPartyCompletion`,
    `ThirdPartyCapId → ThirdPartyToContact`.

This package targets the 1.0.x wire shape so the byte-level interop
tests (which use the apt-installable `capnp` CLI to validate every
message variant) work in CI without building from source. The L3
implementation here exercises Provide / Accept / Disembargo with the
1.0.x discriminator layout — this is byte-compatible with anything a
1.0.x peer would emit, but a real interop with a 2.0-dev peer would
need a wire-format port. A separate live-L3 test fixture against a
custom C++ `VatNetwork` would also need the 2.0-dev port plus a
build-from-source CI step. Those are tracked but deferred.

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

## Comparison with `@endo/ocapn`

`@endo/ocapn` is the monorepo's other capability-passing protocol
implementation. The two packages solve the same high-level problem —
shipping `Presence`/`HandledPromise` references between vats — but
they implement different protocols with different design priorities.
A side-by-side, biased toward the things that determine which one fits
a given deployment.

### Origin and lineage

| | `@endo/capn-proto` | `@endo/ocapn` |
|---|---|---|
| Spec | [Cap'n Proto RPC spec][capnp-spec] (Kenton Varda / Sandstorm, 2014→) | [OCapN spec][ocapn-spec] (community working group, in active drafting) |
| Reference impl | C++ Cap'n Proto, schemes in many languages | Goblins (Spritely, Guile/Racket); JS impls converging here |
| Spec maturity | stable, in production use for >10 years (Sandstorm, Cloudflare Workers) | draft; semantics are settled, wire-format details still evolving |

[capnp-spec]: https://capnproto.org/rpc.html
[ocapn-spec]: https://github.com/ocapn/ocapn

### Wire format

| | `@endo/capn-proto` | `@endo/ocapn` |
|---|---|---|
| Encoding | Cap'n Proto binary: word-aligned segments, struct/list pointers, far pointers, optional packed encoding | [Syrup][syrup]: a tagged binary serialization with records, lists, sets, dictionaries, and primitive tags |
| Schema requirement | every interface declares its methods + Params/Results structs in a `.capnp` file; layouts are computed once at load time | schema-free at the wire level; records carry their type tag inline |
| Self-describing | no — readers need the schema to interpret structs | yes — records carry an explicit type discriminator |
| Alignment | byte-perfect compatibility with C++ Cap'n Proto and other capnp implementations | byte-perfect compatibility with Goblins and other Syrup-based OCapN implementations |
| Zero-copy | yes (the design goal) — readers can mmap a segment and read structs in place | no — Syrup decoders allocate normal JS values |

[syrup]: https://github.com/ocapn/syrup

### Protocol layering

| | `@endo/capn-proto` | `@endo/ocapn` |
|---|---|---|
| Levels in the spec | L1 (basic RPC), L2 (saved refs), L3 (three-party), L4 (Join) | pre-session, session, operations, passable |
| Implemented here | L1 + L3 | pre-session through passable, including sturdy refs and signed handoffs |
| Not implemented | L2 (sturdy refs), L4 (Join) — neither is in scope for this release | none of the spec's currently-defined layers are missing |

### Capability descriptors

The two protocols name the same concepts differently. Direct mapping:

| Concept | capn-proto `CapDescriptor.kind` | ocapn descriptor |
|---|---|---|
| "I host this cap; it's at my export id N" | `senderHosted` | `desc:remote-object` (sender side) |
| "I host this promise; expect a Resolve later" | `senderPromise` | `desc:remote-promise` (sender side) |
| Pass-back ("you host this; here's your id bouncing back") | `receiverHosted` | implicit via slot direction (`+`/`-` polarity) |
| Pipelined target ("via question Q, transform T") | `receiverAnswer` | `desc:answer` |
| Three-party handoff | `thirdPartyHosted` (unauthenticated) | `desc:handoff-give` + `desc:handoff-receive` (signed: `PublicKey` + `Signature`) |
| Persistent location | **absent** (would be L2) | `desc:sturdyref` (location + swissnum) |
| Tagged extension | **absent** (schema is structural) | `desc:tagged` (open-set; the protocol-emergence hook) |

### Identity, brand equality, persistence

Both packages preserve reference identity within a connection via
`WeakMap` discipline (same JS object → same export id; same import
id → same `Presence`). They diverge on identity *across* sessions:

- **capn-proto.** Connection-local only. When a connection drops,
  every Presence it backs becomes dead. Crossing connections in the
  same vat is mediated by `CapHomeRegistry` (so the encoder doesn't
  mis-route), but there's no cross-connection equality.
- **ocapn.** Sturdy refs (`desc:sturdyref`) carry a location + swissnum
  and survive reconnect / restart. Signed handoffs (`PublicKey` +
  `Signature` envelopes on `handoff-give`/`handoff-receive`) let a
  receiver verify the introducer's custody chain cryptographically.
  Anything beyond connection lifetime requires cooperation with the
  netlayer.

### Promise pipelining

| | `@endo/capn-proto` | `@endo/ocapn` |
|---|---|---|
| Mechanism | `PromisedAnswer { questionId, transform }` with explicit `getPointerField` ops by ordinal | `desc:answer { position, slot }` |
| Tribble routing | enforced explicitly with `Disembargo { senderLoopback / receiverLoopback }` round-trips when a promise resolves to a shorter path | enforced via in-order delivery of operations on a single connection |

### Three-party handoff

Mechanically very similar — both let A introduce B's cap to C without
B becoming a permanent forwarder — but with different security
properties:

| | `@endo/capn-proto` | `@endo/ocapn` |
|---|---|---|
| Setup | `Provide { recipient, target }` from B → C; `Accept { provision }` from A → C | `OpDeliver { handoff-give }` from A → B; A reaches C via netlayer |
| Authentication | none — the introducer's identity is implicit in connection topology | signed envelope: receiver verifies `PublicKey` + `Signature` |
| Vine fallback | yes — if C is unreachable, A holds a vine import on B that forwards calls | n/a (different topology) |
| Embargo | both A-side and B-side embargo with `Disembargo { context.accept / context.provide }` | sequence-number-based ordering on the operations stream |

### Error model

| | `@endo/capn-proto` | `@endo/ocapn` |
|---|---|---|
| Errors as values | not at the protocol level — Errors don't fit a Cap'n Proto field type. A schema convention (e.g. an `ErrorRecord` struct) is needed | first-class as `desc:error` (passable like any other value) |
| Errors as control-flow | `Return.exception` carrying `Exception { type, reason }`; `Resolve.exception` for promise rejection | `OpDeliver` with rejection slot; sessions can also abort via `OpAbort` |

### Garbage collection

Both packages use refcount + `FinalizationRegistry` to drive cleanup:

| | `@endo/capn-proto` | `@endo/ocapn` |
|---|---|---|
| Release messages | `Release { id, referenceCount }` per import | `OpGcExports`, `OpGcAnswers` (batched lists) |
| Driven by | Presence GC fires Release; Finish settles answers | FinalizingMap GC hook batches into the next op message |
| Promise lifetime | per-question, single questioner | settler-multiplexed (multiple peers can settle the same slot) |

### Transport

| | `@endo/capn-proto` | `@endo/ocapn` |
|---|---|---|
| Framing | segment-table + length-prefixed; optional 4-byte-RLE packed mode | Syrup-record framing; transport-specific |
| Netlayer | deferred to a `VatNetwork` interface; the package ships `makeTwoPartyVatNetwork` (just-the-pair) and `makeLoopback` (in-process) | first-class netlayer abstraction with concrete implementations (TCP, onion, etc.) |

### When to pick which

- **Pick `@endo/capn-proto` if** you need byte-level interoperability
  with C++/Cloudflare Workers Cap'n Proto peers, or you have a
  schema-driven workflow already and want a cap-aware RPC layer that
  matches `capnpc`'s wire output.
- **Pick `@endo/ocapn` if** you need persistent identity (sturdy refs),
  signed introductions, or rich passable values (Errors, custom tagged
  types, Symbols) without a per-method schema.
- The two protocols are **not wire-compatible.** A single peer can't
  speak both at once on the same connection, but a vat can host both
  simultaneously across different connections by using each package's
  separate `makeCapnp` / `makeOcapn` factory.

For a concrete value-bijection table see
[`docs/serialization-model.md`](./docs/serialization-model.md).

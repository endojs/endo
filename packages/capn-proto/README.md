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
- **Per-interface ordinal maps** — explicitly registered, no name-to-ordinal
  heuristic. Use `registerInterface({ id, methods })` before sending or
  receiving calls on that interface.

## Status

Implementation in this package targets RPC Level 1 + Level 3. Level 2 (saved
references) and Level 4 (Join) are out of scope for this release.

## Quick start

```js
import { makeCapnp, E } from '@endo/capn-proto';
import { makeTwoPartyVatNetwork } from '@endo/capn-proto/two-party.js';
import { makeExo } from '@endo/exo';

const network = makeTwoPartyVatNetwork({ ourVatId, transport });
const greeter = makeExo('greeter', undefined, {
  hello(name) {
    return `hello, ${name}`;
  },
});
const { getBootstrap, abort, stats, registerInterface } = makeCapnp({
  network,
  bootstrap: greeter,
});

registerInterface({
  id: 0xa1b2c3d4e5f60718n,
  methods: { hello: 0 },
});

const remote = getBootstrap(remoteVatId);
console.log(await E(remote).hello('world'));
```

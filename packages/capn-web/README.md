# @endo/capn-web

A JavaScript implementation of [Cap'n Web](https://github.com/cloudflare/capnweb)
built on top of [`@endo/eventual-send`](../eventual-send).

The wire protocol matches Cloudflare's reference implementation: messages are
JSON arrays (`["push", …]`, `["resolve", id, …]`, `["release", id, n]`, …),
capability references are positive/negative integer ids, and atomic values that
don't fit JSON (`undefined`, `BigInt`, `Date`, `Uint8Array`, `Error`, non-finite
numbers) are tagged with the spec-defined forms (`["bigint", "1"]`,
`["date", 1700000000000]`, etc.). Plain JS arrays are escaped with `[[…]]`.

The endo flavour adds:

- **`E()` and `HandledPromise` ergonomics**. Remote calls are `await E(stub).method(args)`.
- **Brand identity**. The same remote object always round-trips to the same
  `presence` (`===` equality), and a presence sent back to its origin peer is
  recognised as the same export it came from.
- **Automatic GC**. When a presence is no longer reachable on this side, a
  `FinalizationRegistry` callback emits `["release", id, refcount]` to the
  peer. Explicit `[Symbol.dispose]()` and refcount tracking are also supported.
- **Pluggable transports**. Loopback (in-memory pair), WebSocket, HTTP-batch
  and MessagePort transports are bundled.
- **`.map()` record-replay**. Runs a mapper callback on the peer side via the
  `["remap", …]` expression form (endo extension; see Limitations below).

## Quick start

```js
import {
  makeCapnWebSession,
  makeLoopbackPair,
  Far,
  E,
} from '@endo/capn-web';

const { a, b } = makeLoopbackPair();

const server = Far('server', {
  hello: name => `Hello, ${name}!`,
});

makeCapnWebSession(b, { localMain: server });
const client = makeCapnWebSession(a);

const remote = client.getRemoteMain();
console.log(await E(remote).hello('World'));
// → "Hello, World!"
```

## API

### `makeCapnWebSession(transport, opts?)`

Creates a session over a transport. Returns
`{ getRemoteMain, callRemap, abort, getStats, isAborted }`.

Options:
- `localMain`: a value (typically `Far(...)` or an `RpcTarget` subclass) that
  the peer reaches as its bootstrap (id 0). Defaults to an empty hardened object.
- `gcImports` *(default `true`)*: use weak refs + `FinalizationRegistry` to
  auto-release imported presences when no longer reachable.
- `onAbort`: callback invoked when the session aborts.

### Transports

```js
import {
  makeLoopbackPair,
  makeWebSocketTransport,
  makeMessagePortTransport,
  makeHttpBatchTransport,
} from '@endo/capn-web';
```

All transports satisfy the simple `RpcTransport` interface:

```ts
{
  send(message: string): void | Promise<void>;
  receive(): Promise<string | null>;   // null = end of stream
  abort?(reason?: unknown): void;
}
```

so plugging in a custom transport is straightforward.

### `RpcTarget`

A marker class. Subclasses are passed by reference (like an `Far` remotable).
Plain JS classes that don't extend `RpcTarget` and aren't marked with `Far` are
not serialisable — the devaluator throws.

## Limitations (v1)

- `.map()` (`["remap", …]`) uses an endo-specific extension that includes the
  `answerRef` so mappers can return any recorded value. Strict
  cloudflare/capnweb-compatibility for `["remap"]` is out of scope here.
- `["stream"]`, `["pipe"]`, `["readable"]`, `["writable"]` and the
  `Headers` / `Request` / `Response` codecs are not yet implemented.
- The recorder for `.map()` records *operations* (property access, method
  call, function call). Arbitrary JS in the mapper (arithmetic, conditionals)
  isn't recorded.

## Tests

```sh
yarn test
```

The GC test suite uses a `detectEngineGC` helper that enables `--expose-gc` at
runtime when needed; no special node invocation is required.

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

## Wire-format compatibility

The wire format matches `cloudflare/capnweb` 0.6 for the implemented surface:

- All top-level message types (`push`, `pull`, `resolve`, `reject`, `release`,
  `stream`, `abort`).
- All special-value tags (`undefined`, `nan`, `inf`, `-inf`, `bigint`, `date`,
  `bytes`, `error`, `headers`, `request`, `response`).
- Reference-introducing expressions (`import`, `pipeline`, `export`, `promise`,
  `writable`, `readable`).
- Array escape (`[[…]]`).

The `test/interop-capnweb.test.js` suite proves end-to-end interop by running
an `@endo/capn-web` session against a real `cloudflare/capnweb` `RpcSession`
in the same process: simple calls, special values, capability passing, and
bidirectional method invocation all work both directions.

## Limitations (v1)

- `.map()` (`["remap", …]`) uses an endo-specific extension that includes the
  `answerRef` so mappers can return any recorded value. Strict
  `cloudflare/capnweb`-compatibility for `["remap", …]` would need additional
  protocol-spec alignment and is out of scope here.
- `["pipe"]` (open a new pipe) is not yet implemented. JS `WritableStream` /
  `ReadableStream` values are encoded as `["writable", -id]` /
  `["readable", -id]`, but the receiver gets a plain presence stub rather
  than a synthesised host-side `WritableStream` wrapper.
- `Request`/`Response` headers don't round-trip under the strict SES-lockdown
  ses-ava config (Node's undici-backed `Headers` can't be iterated against
  frozen internal slots). Standalone `Headers` round-trip everywhere; URL
  and method on `Request`/`Response` round-trip everywhere; the limitation
  is purely on iterating headers attached to a `Request`/`Response`.
- The recorder for `.map()` records *operations* (property access, method
  call, function call). Arbitrary JS in the mapper (arithmetic, conditionals)
  isn't recorded.

## Tests

```sh
yarn test
```

The GC test suite uses a `detectEngineGC` helper that enables `--expose-gc` at
runtime when needed; no special node invocation is required.

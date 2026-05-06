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
- `localMain`: a remotable value (typically `Far(...)` or an `@endo/exo`
  exo) that the peer reaches as its bootstrap (id 0). Defaults to an
  empty hardened object.
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
  // server-side HTTP batch
  processHttpBatchBody,
  handleHttpBatchRequest,
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

### Server-side HTTP batch

Two helpers are provided for hosting an HTTP-batch endpoint:

```js
// Fetch-API style (Cloudflare Workers, Bun, Deno, modern Node):
addEventListener('fetch', event => {
  event.respondWith(
    handleHttpBatchRequest(event.request, { localMain }),
  );
});

// Or the protocol-only kernel, taking and returning a string body:
const responseBody = await processHttpBatchBody(reqBody, { localMain });
```

Each call processes one HTTP-batch round trip: parses the request body
(`\n`-joined RPC messages), runs a per-request session against `localMain`,
waits for `session.drain()`, and returns the captured outgoing messages.

Bidirectional capability passing within a single batch is not supported
(the server can't make callbacks while holding the response open). For
that, use the WebSocket or MessagePort transports.

### Streams

JavaScript `WritableStream` / `ReadableStream` instances are sent over the
wire as `["writable", id]` / `["readable", id]`. The receiver side
synthesises a real `WritableStream` / `ReadableStream` whose underlying
sink/source forwards `write` / `read` / `close` / `cancel` / `abort` calls
to the remote writer/reader. Pass them as method arguments or return values
just like any other capability.

### Pass-by-reference: remotables

`@endo/capn-web` uses `@endo/pass-style`'s notion of a remotable: any object
created with `Far(iface, methods)` (or `makeExo` from `@endo/exo`) is passed
by reference. Plain JS classes — including subclasses of capnweb's
`RpcTarget` — are *not* automatically serialisable; mark them with `Far`
(or wrap them in an exo) to pass them across the wire. The devaluator
rejects values that aren't a recognised remotable, copyable, or
special-value type.

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

- `.map()` is wire-compatible with `cloudflare/capnweb` 0.6's
  `["remap", subjectId, propertyPath, captures, instructions]` form:
  each instruction is `["pipeline", subject, path, args?]` and the last
  instruction's value is the answer. The interop suite covers both
  directions. Capturing a *foreign stub* as the receiver of a method
  call inside the mapper body isn't yet supported — capture stubs as
  arguments instead.
- `["pipe"]` (open a new pipe) is not yet implemented. JS
  `WritableStream` / `ReadableStream` values are encoded as
  `["writable", -id]` / `["readable", -id]`, and the receiver gets a real
  `WritableStream` / `ReadableStream` whose I/O round-trips through one
  remote method call per chunk. Chunked streaming over a single
  HTTP-batch request isn't feasible (the response is not held open);
  WebSocket and MessagePort transports work fine.
- Sender-side `["stream", …]` (cloudflare/capnweb's fire-and-forget
  variant) is intentionally not emitted: send-only calls use a normal
  `["push", expr]` *without* a paired `["pull", id]`, which is strictly
  spec-compliant and works against any conforming peer. The trade-off
  is one wasted exports-table slot per send-only call until the peer
  sees a release. Receiving `["stream", expr]` from a peer is supported.
- `Request`/`Response` headers don't round-trip under the strict SES-lockdown
  ses-ava config (Node's undici-backed `Headers` can't be iterated against
  frozen internal slots). Standalone `Headers` round-trip everywhere; URL
  and method on `Request`/`Response` round-trip everywhere; the limitation
  is purely on iterating headers attached to a `Request`/`Response`.
- The recorder for `.map()` records *operations* (property access, method
  call, function call). Arbitrary JS in the mapper (arithmetic, conditionals)
  isn't recorded.

## Compared to `@endo/ocapn`

Both packages give you object-capability RPC built on `@endo/eventual-send`, with
brand identity preserved across the wire — but they target different points in
the design space.

| Axis | `@endo/ocapn` | `@endo/capn-web` |
| --- | --- | --- |
| **Lineage** | CapTP / E / Goblins (federated object-capability mesh) | Cloudflare Cap'n Web 2024 (web-shaped RPC) |
| **Wire format** | Syrup (binary) | JSON arrays |
| **Handshake** | `op:start-session` with Ed25519-signed location, version, public-key id | None — id `0` is the bootstrap; transport handles trust |
| **Session identity** | Intrinsic and cryptographic (session id derived from both peers' key ids) | None at the protocol layer; anchored in TLS / `MessagePort` etc. |
| **Three-party handoff** | Formal, signed (`deposit-gift` / `withdraw-gift` with Ed25519 envelopes) — Carol can verify Bob really got the cap from Alice | Implicit: stubs are remotables (`passStyleOf === 'remotable'`), so Bob's session re-exports them like any other capability. Works between cooperating peers; **no cryptographic guarantee** |
| **Cross-session reach** | Sturdy refs `(location, swissNum)`, location-signed | None — disconnect/reconnect = fresh ids; layer your own naming on top |
| **Pipelining** | One op per message (`op:deliver`, `op:get`, `op:index`, `op:untag`, `op:listen`); deep chains span multiple messages | Path-batched: `["pipeline", id, [path], [args]]` walks the path on the receiver in one round-trip |
| **Promises on the wire** | First-class slot type (`p+N` / `p-N`); peers `op:listen` to subscribe | Implicit: every push allocates an answer-id; the requester explicitly `["pull"]`s |
| **GC** | `op:gc-exports` (positions + bigint deltas, atomically batched per message) and `op:gc-answers` | `["release", id, count]`; microtask-coalesced |
| **Streams** | Not defined — application-level | WHATWG `WritableStream` / `ReadableStream` round-trip as `["writable" \| "readable", id]`; receiver gets a real stream |
| **`.map()` / batched record-replay** | Not defined | `["remap", subjectId, propertyPath, captures, instructions]` — record once, replay per element |
| **Trust anchor** | The protocol (signatures, swiss-nums) | The transport (TLS) |

### Wire-type bijection

What each protocol can carry as a leaf, beyond the obvious primitives:

|  | `@endo/ocapn` | `@endo/capn-web` |
| --- | --- | --- |
| `undefined` | via `copyTagged` escape | `["undefined"]` |
| `NaN`, ±`Infinity` | no first-class encoding (number is float64; non-finite needs an escape) | `["nan"]`, `["inf"]`, `["-inf"]` |
| `bigint` | yes (Syrup int) | `["bigint", str]` |
| `Date` | no leaf form — encode as a tagged value | `["date", ms]` |
| `Uint8Array` / bytes | yes | `["bytes", base64]` |
| `Error` | message + selector type | `["error", typeName, message, stack?]` |
| Symbols | yes (selectors) | rejected (devaluator throws) |
| `copyTagged` (generic) | yes — full `@endo/pass-style` `tagged` | no — atom set is closed |
| `Map` / `Set` | not yet implemented (planned) | not implemented |
| `Headers` / `Request` / `Response` | not specified | yes (`["headers", pairs]`, `["request", url, init]`, `["response", body, init]`) |

### When to pick which

- Pick **`@endo/capn-web`** if you want browser-native HTTP/WebSocket transports
  with a JSON-readable tape, batched pipelining, batched `.map()`, WHATWG
  streams, and you're willing to anchor trust in TLS.
- Pick **`@endo/ocapn`** if you want federated identity, sturdy-refs that
  survive across sessions, signed three-party handoffs, and the full
  `@endo/pass-style` bijection (symbols, `copyTagged`, …).

Pithy: **Cap'n Web is wire-cheap, model-thin, web-shaped; OCapN is wire-rich,
model-deep, mesh-shaped.** The two are complementary, not redundant.

## Tests

```sh
yarn test
```

The GC test suite uses a `detectEngineGC` helper that enables `--expose-gc` at
runtime when needed; no special node invocation is required.

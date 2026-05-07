# OCapN Codec Usage

This package ships two wire codecs (**Syrup** and **CBOR**) behind a common
`OcapnCodec` interface. An application picks one at construction time and
passes it to `makeOcapn`. The codec determines the wire format for every
byte that crosses the session, including the canonical bytes covered by
location and handoff signatures.

> **No negotiation.** The OCapN standards group has not yet settled on a single
> wire encoding. Both codecs ship so applications can experiment, but codec
> choice is a static per-network decision; peers using different codecs cannot
> interoperate and will not bridge. Do not expect a negotiation step. There
> is none.

## The `OcapnCodec` interface

An `OcapnCodec` bundles the reader factory, writer factory, and a diagnostic
renderer used for error logging:

```ts
// '@endo/ocapn/codec-interface' (types only)
interface OcapnCodec {
  makeReader(bytes: Uint8Array, options?: { name?: string }): OcapnReader;
  makeWriter(options?: { name?: string; length?: number }): OcapnWriter;
  diagnose(bytes: Uint8Array): string;
}
```

Both `OcapnReader` and `OcapnWriter` share a codec-agnostic shape (enter/exit
records, lists, dictionaries, sets; read/write booleans, integers, floats,
strings, bytestrings, selectors). Code written against these interfaces runs
against either codec without modification.

## Tree-shakeable imports

Import only the codec you intend to use. The other implementation will not
enter your bundle graph.

```js
// Syrup only
import { syrupCodec } from '@endo/ocapn/syrup';

// or CBOR only
import { cborCodec } from '@endo/ocapn/cbor';
```

Each module also exports its lower-level primitives (`makeSyrupReader` /
`makeSyrupWriter`, `makeCborReader` / `makeCborWriter`, the diagnostic
helpers) for callers that need to drive the reader/writer directly: for
example, test harnesses or tools that inspect raw bytes.

## Using `makeOcapn`

Pass the codec to `makeOcapn`:

```js
import { makeOcapn } from '@endo/ocapn';
import { syrupCodec } from '@endo/ocapn/syrup';

const ocapn = makeOcapn({ codec: syrupCodec });
```

The `codec` option is required (the constructor intentionally has no
default), so the codec you are not using never enters your bundle graph.
For CBOR networks:

```js
import { makeOcapn } from '@endo/ocapn';
import { cborCodec } from '@endo/ocapn/cbor';

const ocapn = makeOcapn({ codec: cborCodec });
```

Everything downstream (handshake frames, session messages, and the canonical
bytes that feed `ed25519` signatures) is produced and consumed through the
codec you supplied. Two `ocapn` instances constructed with different codecs
will reject each other's handshakes.

## Using the codec outside of `makeOcapn`

The same codec bundle is enough to drive the serialize/deserialize helpers
directly, and to obtain codec-bound cryptographic helpers:

```js
import { writeOcapnHandshakeMessage } from '@endo/ocapn/codecs/operations.js';
import { makeCryptography } from '@endo/ocapn/cryptography.js';
import { syrupCodec } from '@endo/ocapn/syrup';

const crypto = makeCryptography(syrupCodec);
const keyPair = crypto.makeOcapnKeyPair();

const bytes = writeOcapnHandshakeMessage(
  {
    type: 'op:start-session',
    captpVersion: '1.0',
    sessionPublicKey: keyPair.publicKey.descriptor,
    location: myLocation,
    locationSignature: crypto.signLocation(myLocation, keyPair),
  },
  syrupCodec,
);
```

`makeCryptography(codec)` returns an object with signing, verification, and
key-pair helpers bound to the given codec. The helpers depend on the codec
because they compute signatures over bytes produced by the codec's writer.

## Writing codec-agnostic code

Code that wants to work with whichever codec its caller chose should accept
an `OcapnCodec` (or the narrower `MakeReader` / `MakeWriter`) and call
through it:

```js
/**
 * @param {import('@endo/ocapn/codec-interface').OcapnCodec} codec
 */
function encodeGreeting(codec, name) {
  const writer = codec.makeWriter({ name: 'greeting' });
  writer.enterRecord();
  writer.writeSelectorFromString('greet');
  writer.writeString(name);
  writer.exitRecord();
  return writer.getBytes();
}
```

## Writer / reader primitives

When you need to drive a reader or writer directly (for tests, tools, or the
occasional custom codec consumer), each codec module re-exports its factories:

```js
import { makeSyrupWriter, makeSyrupReader } from '@endo/ocapn/syrup';
import { makeCborWriter, makeCborReader } from '@endo/ocapn/cbor';
```

### Writing

```js
const writer = codec.makeWriter({ name: 'example message' });
writer.enterRecord();
writer.writeSelectorFromString('deliver');
writer.writeInteger(42n);
writer.writeString('hello');
writer.exitRecord();
const bytes = writer.getBytes();
```

### Reading

```js
const reader = codec.makeReader(bytes, { name: 'example message' });
reader.enterRecord();
const { value: label } = reader.readRecordLabel();
const num = reader.readInteger();
const str = reader.readString();
reader.exitRecord();
```

Use `reader.peekTypeHint()` when the next value's shape is unknown.
Available hints: `'number-prefix'`, `'float64'`, `'boolean'`, `'list'`,
`'set'`, `'dictionary'`, `'record'`.

## The `name` option

Readers and writers accept an optional `name` used solely in error messages
and logs; it does not affect encoding. Name the outer message or operation so
failures are easy to locate:

```js
const writer = codec.makeWriter({ name: 'outbound op:deliver' });
```


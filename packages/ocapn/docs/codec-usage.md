# OCapN Codec Usage

This document describes the expected usage patterns for OCapN codecs.

## Design Principle: Dependency Injection

Applications should import only the codec implementations they actually use.
This ensures that unused implementations are not retained in the bundle,
enabling tree-shaking and minimizing application size.

**Do not** use a central factory that knows about all codecs. Instead, import
the specific codec components you need and inject them where required.

## Available Codecs

### Syrup (Codec 0)

Syrup is a canonical, text-delimited binary serialization format. It is the
original OCapN wire format.

```js
// Import only the writer
import { makeSyrupWriter } from '@endo/ocapn/syrup/encode.js';

// Import only the reader
import { makeSyrupReader } from '@endo/ocapn/syrup/decode.js';

// Or import both from the index
import { makeSyrupWriter, makeSyrupReader } from '@endo/ocapn/syrup/index.js';
```

#### Writing with Syrup

```js
import { makeSyrupWriter } from '@endo/ocapn/syrup/encode.js';

const writer = makeSyrupWriter({ name: 'my-message' });
writer.enterRecord();
writer.writeSelectorFromString('op:deliver');
writer.writeInteger(42n);
writer.writeString('hello');
writer.exitRecord();

const bytes = writer.getBytes();
```

#### Reading with Syrup

```js
import { makeSyrupReader } from '@endo/ocapn/syrup/decode.js';

const reader = makeSyrupReader(bytes, { name: 'my-message' });
reader.enterRecord();
const label = reader.readSelectorAsString(); // 'op:deliver'
const num = reader.readInteger(); // 42n
const str = reader.readString(); // 'hello'
reader.exitRecord();
```

### CBOR (Codec 1)

CBOR (Concise Binary Object Representation) is an RFC 8949 compliant binary
format. OCapN CBOR uses canonical encoding for deterministic serialization.

```js
// Import only the writer
import { makeCborWriter } from '@endo/ocapn/cbor/encode.js';

// Import only the reader
import { makeCborReader } from '@endo/ocapn/cbor/decode.js';

// Or import both from the index
import { makeCborWriter, makeCborReader } from '@endo/ocapn/cbor/index.js';
```

#### Writing with CBOR

```js
import { makeCborWriter } from '@endo/ocapn/cbor/encode.js';

const writer = makeCborWriter({ name: 'my-message' });
writer.enterRecord();
writer.writeSelectorFromString('op:deliver');
writer.writeInteger(42n);
writer.writeString('hello');
writer.exitRecord();

const bytes = writer.getBytes();
```

#### Reading with CBOR

```js
import { makeCborReader } from '@endo/ocapn/cbor/decode.js';

const reader = makeCborReader(bytes, { name: 'my-message' });
reader.enterRecord();
const label = reader.readSelectorAsString(); // 'op:deliver'
const num = reader.readInteger(); // 42n
const str = reader.readString(); // 'hello'
reader.exitRecord();
```

### CBOR Diagnostic Notation

CBOR diagnostic notation is a text-based representation useful for testing
and debugging. It is a codec in its own right:

```js
// Encode: CBOR bytes → diagnostic string
import { encode } from '@endo/ocapn/cbor/diagnostic/encode.js';

// Decode: diagnostic string → JavaScript values
import { decode } from '@endo/ocapn/cbor/diagnostic/decode.js';

// Or import from the index
import { encode, decode } from '@endo/ocapn/cbor/diagnostic/index.js';
```

## Injection Pattern for OCapN Client

When constructing an OCapN client or netlayer, inject the codec factories:

```js
import { makeCborWriter } from '@endo/ocapn/cbor/encode.js';
import { makeCborReader } from '@endo/ocapn/cbor/decode.js';

const netlayer = makeNetlayer({
  makeWriter: makeCborWriter,
  makeReader: makeCborReader,
  // ... other options
});
```

Or for Syrup:

```js
import { makeSyrupWriter } from '@endo/ocapn/syrup/encode.js';
import { makeSyrupReader } from '@endo/ocapn/syrup/decode.js';

const netlayer = makeNetlayer({
  makeWriter: makeSyrupWriter,
  makeReader: makeSyrupReader,
  // ... other options
});
```

## Interface Compatibility

Both Syrup and CBOR codecs implement the same `OcapnReader` and `OcapnWriter`
interfaces (defined in `src/codec-interface.js`), ensuring they can be used
interchangeably wherever these interfaces are expected.

```js
/**
 * @param {import('./codec-interface.js').MakeWriter} makeWriter
 * @param {import('./codec-interface.js').MakeReader} makeReader
 */
function createMessageHandler(makeWriter, makeReader) {
  return {
    encode(value) {
      const writer = makeWriter({ name: 'encode' });
      // ... write value
      return writer.getBytes();
    },
    decode(bytes) {
      const reader = makeReader(bytes, { name: 'decode' });
      // ... read value
      return result;
    },
  };
}
```

## Codec Identification

For protocol negotiation purposes:
- **Syrup**: Codec ID `0`
- **CBOR**: Codec ID `1`

These identifiers may be used during handshake to negotiate which codec
to use for a session. See the netlayer documentation for details on
codec negotiation.


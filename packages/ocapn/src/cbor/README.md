# OCapN CBOR Codec (Codec 1)

This directory contains a CBOR (Concise Binary Object Representation) encoder
and decoder for OCapN messages, as an alternative to the Syrup codec.

**Codec ID**: `1` (for protocol negotiation)

## Directory Structure

```
cbor/
├── encode.js       # CborWriter - CBOR binary encoder
├── decode.js       # CborReader - CBOR binary decoder
├── index.js        # Main exports
├── diagnostic/     # Diagnostic notation codec
│   ├── encode.js   # CBOR bytes → diagnostic string
│   ├── decode.js   # Diagnostic string → JavaScript values
│   ├── util.js     # Hex conversion and comparison helpers
│   └── index.js    # Diagnostic codec exports
└── README.md       # This file
```

## Features

- **RFC 8949 Compliant**: Output can be parsed by any standard CBOR decoder
- **Canonical Encoding**: Deterministic output suitable for signature verification
- **Diagnostic Notation**: Human-readable text codec for testing and debugging
- **Full Type Support**: All OCapN types including integers (bignum), floats, strings, symbols, records, and tagged values

## Usage

```javascript
import { makeCborWriter, makeCborReader, cborToDiagnostic } from './index.js';

// Encoding
const writer = makeCborWriter();
writer.writeArrayHeader(3);
writer.writeSelectorFromString('op:deliver');
writer.writeInteger(42n);
writer.writeString('hello');
const bytes = writer.getBytes();

// View as diagnostic notation
console.log(cborToDiagnostic(bytes));
// Output: [280("op:deliver"), 2(h'2a'), "hello"]

// Decoding
const reader = makeCborReader(bytes);
reader.enterList();
const selector = reader.readSelectorAsString(); // "op:deliver"
const integer = reader.readInteger(); // 42n
const string = reader.readString(); // "hello"
reader.exitList();
```

## Key Differences from Syrup

| Aspect | Syrup | CBOR |
|--------|-------|------|
| Format | Text-based delimiters | Binary length prefixes |
| Integers | ASCII digits with sign | Tag 2/3 bignums |
| Symbols | `len'content` | Tag 280 + text |
| Records | `<selector body>` | Tag 27 + array |
| Parsers | Custom only | Standard CBOR libraries |

## Diagnostic Notation Codec

The `diagnostic/` subdirectory provides a text-based codec for CBOR data
using RFC 8949 Appendix G diagnostic notation. It stands on equal footing
with the binary CBOR codec:

- **Encode**: CBOR bytes → diagnostic string
- **Decode**: Diagnostic string → JavaScript values

This is useful for:

- Writing test cases in readable form
- Debugging encoding issues  
- Validating interoperability with other implementations

```javascript
import { encode, decode, hexToBytes } from './diagnostic/index.js';

// Encode: CBOR bytes → diagnostic string
const bytes = hexToBytes('d90118666d6574686f64');
console.log(encode(bytes)); // 280("method")

// Decode: diagnostic string → JavaScript values
const value = decode('280("method")');
// { _tag: 280n, _content: "method" }
```

Or use the convenience re-exports from the main index:

```javascript
import { diagnosticEncode, diagnosticDecode, cborToDiagnostic } from './index.js';
```

## Testing

The tests validate:

1. **Round-trip**: encode → decode returns original value
2. **Interoperability**: output parses correctly with the `cbor` npm package
3. **Canonical encoding**: NaN, integers, and other values use canonical form
4. **Diagnostic notation**: human-readable output matches expected format

Run tests with:

```bash
yarn test test/cbor/
```

## Specification

See `docs/cbor-encoding.md` for the complete encoding specification.



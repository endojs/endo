# OCapN CBOR Encoding Specification

This document specifies a CBOR (Concise Binary Object Representation) encoding
for OCapN messages, as an alternative to Syrup encoding.

## Design Goals

1. **Interoperability**: Messages can be parsed by any RFC 8949 compliant CBOR
   decoder.
2. **Canonical Form**: A single canonical encoding exists for every value,
   enabling signature verification without re-encoding.
3. **Compatibility**: The encoding maps naturally to the OCapN data model
   defined in the [OCapN Model specification][Model].
4. **Efficiency**: Compact representation suitable for network transmission with
   a practical 65535-byte message size limit (for Noise Protocol compatibility).
5. **Forwarding**: Message bodies can be forwarded through intermediaries
   (kernels, comms vats) without re-serialization by separating slot references
   from the passable data body. See [ocapn/ocapn#172][Slots].

## Quick Reference

| OCapN Type | CBOR Encoding | Diagnostic Example |
|------------|---------------|-------------------|
| Undefined | Simple value 23 | `undefined` |
| Null | Simple value 22 | `null` |
| Boolean | Simple values 20/21 | `false`, `true` |
| Integer | Tag 2/3 + byte string | `2(h'01')` = 1 |
| Float64 | Float64 (major 7) | `1.5` |
| String | Text string (major 3) | `"hello"` |
| ByteArray | Byte string (major 2) | `h'deadbeef'` |
| Symbol | Tag 280 + text string | `280("method")` |
| List | Array (major 4) | `[1, 2, 3]` |
| Struct | Map (major 5) | `{"a": 1, "b": 2}` |
| Record | Tag 27 + array | `27(["op:deliver", ...])` |
| Tagged | Tag 55799 + array | `55799(["decimal", "3.14"])` |
| Error | Record with label "desc:error" | `27(["desc:error", "message"])` |
| Target (in-band) | Record marker | `27([280("target")])` |
| Promise (in-band) | Record marker | `27([280("promise")])` |
| Error (in-band) | Record with message | `27([280("error"), "TypeError"])` |
| Embedded CBOR | Tag 24 + byte string | `24(h'...')` |

## CBOR Major Types Used

| Major Type | Value | Usage in OCapN |
|------------|-------|----------------|
| 0 | Unsigned int | Length prefixes only (not for OCapN integers) |
| 1 | Negative int | Length prefixes only (not for OCapN integers) |
| 2 | Byte string | ByteArray values |
| 3 | Text string | String values |
| 4 | Array | List values |
| 5 | Map | Struct values |
| 6 | Tag | Symbols (280), Records (27), Bignums (2/3), Tagged (55799) |
| 7 | Float/Simple | Float64, Boolean, Null, Undefined |

## Detailed Encoding

### Undefined

CBOR Simple Value 23 (Undefined).

```
0xF7
```

- Byte 0: `0b111_10111` = Major type 7, additional info 23

**Diagnostic notation**: `undefined`

### Null

CBOR Simple Value 22 (Null).

```
0xF6
```

- Byte 0: `0b111_10110` = Major type 7, additional info 22

**Diagnostic notation**: `null`

### Boolean

CBOR Simple Values 20 (False) and 21 (True).

**False**:
```
0xF4
```
- Byte 0: `0b111_10100` = Major type 7, additional info 20

**True**:
```
0xF5
```
- Byte 0: `0b111_10101` = Major type 7, additional info 21

**Diagnostic notation**: `false`, `true`

### Integer

OCapN integers are arbitrary-precision signed integers. They are always encoded
as CBOR bignums (Tags 2 and 3), never as CBOR native integers.

> **Rationale**: Using bignums exclusively simplifies canonicalization and
> ensures consistent encoding regardless of magnitude. CBOR's compact integer
> encoding could be added as an optimization in a future version.

**Positive integers** (n >= 0): Tag 2 + byte string of big-endian magnitude

```
0xC2 <bytestring of n>
```

**Negative integers** (n < 0): Tag 3 + byte string of big-endian (-1 - n)

```
0xC3 <bytestring of (-1 - n)>
```

The byte string uses minimal encoding: no leading zero bytes unless the value
is zero (encoded as empty byte string or single `0x00` byte).

**Examples**:

| Value | Encoding | Diagnostic |
|-------|----------|------------|
| 0 | `C2 40` | `2(h'')` |
| 1 | `C2 41 01` | `2(h'01')` |
| 255 | `C2 41 FF` | `2(h'ff')` |
| 256 | `C2 42 01 00` | `2(h'0100')` |
| -1 | `C3 40` | `3(h'')` |
| -2 | `C3 41 01` | `3(h'01')` |
| -256 | `C3 41 FF` | `3(h'ff')` |

### Float64

IEEE 754 binary64 (double precision) floating point.

```
0xFB <8 bytes big-endian IEEE 754>
```

- Byte 0: `0b111_11011` = Major type 7, additional info 27 (8-byte float follows)
- Bytes 1-8: IEEE 754 binary64, big-endian

**Canonical NaN**: The only valid NaN representation is `0x7FF8000000000000`.
Any other NaN bit pattern MUST be rejected.

**Canonical Zero**: Both +0 and -0 are preserved. +0 is `0x0000000000000000`,
-0 is `0x8000000000000000`.

**Examples**:

| Value | Encoding | Diagnostic |
|-------|----------|------------|
| 0.0 | `FB 00 00 00 00 00 00 00 00` | `0.0` |
| -0.0 | `FB 80 00 00 00 00 00 00 00` | `-0.0` |
| 1.0 | `FB 3F F0 00 00 00 00 00 00` | `1.0` |
| -1.0 | `FB BF F0 00 00 00 00 00 00` | `-1.0` |
| Infinity | `FB 7F F0 00 00 00 00 00 00` | `Infinity` |
| -Infinity | `FB FF F0 00 00 00 00 00 00` | `-Infinity` |
| NaN | `FB 7F F8 00 00 00 00 00 00` | `NaN` |

### String

UTF-8 encoded text string, excluding surrogate code points (U+D800–U+DFFF).

```
0x60-0x7B <length info> <UTF-8 bytes>
```

- Major type 3 (text string)
- Length encoded per CBOR rules:
  - 0-23: Single byte `0x60 | length`
  - 24-255: `0x78` + 1 byte length
  - 256-65535: `0x79` + 2 byte big-endian length

**Examples**:

| Value | Encoding | Diagnostic |
|-------|----------|------------|
| "" | `60` | `""` |
| "a" | `61 61` | `"a"` |
| "hello" | `65 68 65 6C 6C 6F` | `"hello"` |

### ByteArray

Raw byte sequence.

```
0x40-0x5B <length info> <bytes>
```

- Major type 2 (byte string)
- Length encoded per CBOR rules (same as String)

**Examples**:

| Value | Encoding | Diagnostic |
|-------|----------|------------|
| (empty) | `40` | `h''` |
| 0xDEADBEEF | `44 DE AD BE EF` | `h'deadbeef'` |

### Symbol

Tag 280 wrapping a text string. Symbols are distinguished from strings by type.

```
0xD9 0x01 0x18 <text string>
```

- Bytes 0-2: Tag 280 (`0xD9` = tag with 2-byte number, `0x0118` = 280)
- Remaining: Text string encoding (same as String)

> **Tag number 280**: This is in the "First Come First Served" range
> (256-32767). The specific number 280 = 0x118 was chosen to be memorable
> (think "1-18" or "one eighteen").

**Examples**:

| Value | Encoding | Diagnostic |
|-------|----------|------------|
| 'method | `D9 01 18 66 6D 65 74 68 6F 64` | `280("method")` |
| 'x | `D9 01 18 61 78` | `280("x")` |

### List

CBOR array with definite length.

```
0x80-0x9B <length info> <elements...>
```

- Major type 4 (array)
- Length encoded per CBOR rules
- Elements encoded in order

**Examples**:

| Value | Encoding | Diagnostic |
|-------|----------|------------|
| [] | `80` | `[]` |
| [1, 2] | `82 C2 41 01 C2 41 02` | `[2(h'01'), 2(h'02')]` |

### Struct

CBOR map with string keys only, in canonical (bytewise sorted) key order.

```
0xA0-0xBB <pairs count> <key-value pairs...>
```

- Major type 5 (map)
- Pair count encoded per CBOR rules
- Keys MUST be text strings
- Keys MUST be in bytewise lexicographic order (by UTF-8 encoding)
- No duplicate keys allowed

**Canonical key ordering**: Keys are sorted by comparing their UTF-8 byte
sequences lexicographically. Shorter keys sort before longer keys with the
same prefix.

**Examples**:

| Value | Encoding | Diagnostic |
|-------|----------|------------|
| {} | `A0` | `{}` |
| {"a": 1} | `A1 61 61 C2 41 01` | `{"a": 2(h'01')}` |
| {"a": 1, "b": 2} | `A2 61 61 C2 41 01 61 62 C2 41 02` | `{"a": 2(h'01'), "b": 2(h'02')}` |

### Record

Tag 27 wrapping an array. The first element is the record label (a string or
symbol), followed by the record fields.

```
0xD8 0x1B <array>
```

- Bytes 0-1: Tag 27 (`0xD8` = tag with 1-byte number, `0x1B` = 27)
- Remaining: Array with label as first element

> **Tag number 27**: This is the "Self-Described CBOR Sequence" tag, commonly
> used for record-like structures in CBOR-based protocols.

**OCapN records use symbol labels** (Tag 280 strings) for type identification:

| Record Type | Label | Example |
|-------------|-------|---------|
| op:deliver | `280("op:deliver")` | `27([280("op:deliver"), ...])` |
| desc:import-object | `280("desc:import-object")` | `27([280("desc:import-object"), position])` |
| desc:error | `280("desc:error")` | `27([280("desc:error"), "message"])` |

**Example - desc:import-object with position 5**:

```
D8 1B                       # Tag 27
   82                       # Array of 2 elements
      D9 01 18              # Tag 280
         72                 # Text string, 18 bytes
            64 65 73 63 3A 69 6D 70 6F 72 74 2D 6F 62 6A 65 63 74
                            # "desc:import-object"
      C2 41 05              # Tag 2, byte string h'05' = integer 5
```

**Diagnostic**: `27([280("desc:import-object"), 2(h'05')])`

### Tagged (OCapN Tagged Values)

Tag 55799 wrapping an array of [tag-name, payload].

> **Tag number 55799**: This is the CBOR ["Self-Described CBOR"][SelfDescribe]
> magic number defined in RFC 8949 §3.4.6. Using it here provides a clear marker
> for OCapN tagged values while remaining valid CBOR.

```
0xD9 0xD9 0xF7 <array of [tag-name, payload]>
```

**Example - Tagged decimal "3.14"**:

```
D9 D9 F7                    # Tag 55799
   82                       # Array of 2 elements
      67                    # Text string, 7 bytes
         64 65 63 69 6D 61 6C  # "decimal"
      64                    # Text string, 4 bytes
         33 2E 31 34        # "3.14"
```

**Diagnostic**: `55799(["decimal", "3.14"])`

### Error

An error is a Record with label "desc:error" containing a message string.

```
D8 1B                       # Tag 27 (Record)
   82                       # Array of 2 elements
      D9 01 18              # Tag 280 (Symbol)
         6A                 # Text string, 10 bytes
            64 65 73 63 3A 65 72 72 6F 72  # "desc:error"
      <message string>
```

**Diagnostic**: `27([280("desc:error"), "Error message here"])`

## Passable Data and Slots

OCapN messages contain "passable" data that may include references to remote
objects (targets), promises, and errors. To enable efficient message forwarding
through intermediaries without re-serialization, references are encoded using
**in-band markers** within an **embedded CBOR body**, with **parallel arrays**
mapping each marker to its CapTP table position.

### Design Rationale

When a kernel or comms vat forwards messages between vats or sessions, it needs
to remap slot numbers (C-list positions) but doesn't need to inspect or modify
the passable data itself. By encoding the body as an opaque byte string with
references encoded as indexed markers, intermediaries can:

1. Fast-forward past the body without parsing nested structures
2. Remap slot positions in the parallel arrays
3. Forward the body bytes unchanged

### Embedded CBOR (Tag 24)

The body of passable data is encoded as **Tag 24** (Encoded CBOR data item)
wrapping a byte string. This standard CBOR tag indicates that the byte string
contains valid CBOR data.

```
0xD8 0x18 <byte string containing CBOR>
```

- Bytes 0-1: Tag 24 (`0xD8` = tag with 1-byte number, `0x18` = 24)
- Remaining: Byte string (major type 2) containing the encoded passable value

**Diagnostic notation**: `24(h'...')` shows the raw bytes. For readability in
this document, we use `24(<...>)` to show the decoded embedded content.

> **Tag 24** is defined in RFC 8949 §3.4.5.1 as "Encoded CBOR data item".
> Generic CBOR decoders recognize this tag and may automatically decode the
> nested content.

### In-Band Reference Markers

Within the embedded CBOR body, references to targets, promises, and errors are
encoded as simple records containing a sequential index (0-based). These markers
are placeholders that reference entries in parallel arrays outside the body.

#### Target Marker

A reference to a remote object (target) in the CapTP tables.

```
27([280("target")])
```

The index into the `targets` parallel array is implicit: targets are numbered
in depth-first, left-to-right order of appearance in the body.

**Diagnostic**: `27([280("target")])`

#### Promise Marker

A reference to a promise in the CapTP tables.

```
27([280("promise")])
```

The index into the `promises` parallel array is implicit: promises are numbered
in depth-first, left-to-right order of appearance in the body.

**Diagnostic**: `27([280("promise")])`

#### Error Marker

An error value with a message string. Errors may optionally have an identifier
for correlation purposes.

```
27([280("error"), message])
```

Where `message` is a text string describing the error. The parallel `errors`
array may contain additional metadata (error identifier as ByteArray, or empty
byte string for anonymous errors).

**Diagnostic**: `27([280("error"), "TypeError: undefined is not a function"])`

### Parallel Arrays Structure

Delivery operations include parallel arrays that map in-band markers to their
CapTP table positions:

| Array | Content | Purpose |
|-------|---------|---------|
| `targets` | List of integers | CapTP positions for each `target` marker |
| `promises` | List of integers | CapTP positions for each `promise` marker |
| `errors` | List of ByteArrays | Error identifiers (or `h''` for anonymous) |

The arrays are indexed by order of appearance. The first `target` marker in the
body corresponds to `targets[0]`, the second to `targets[1]`, and so on.
Similarly for `promises` and `errors`.

### Example: Passable Value with References

Consider a passable array containing two targets, a promise, and an error:

**Logical structure**:
```
[target@-10, target@2, promise@3, error("TypeError")]
```

**Encoded body** (inside Tag 24 byte string):
```cbor
[                                    ; Array of 4 elements
  27([280("target")]),               ; First target  → targets[0]
  27([280("target")]),               ; Second target → targets[1]
  27([280("promise")]),              ; First promise → promises[0]
  27([280("error"), "TypeError"])    ; First error   → errors[0]
]
```

**Parallel arrays**:
```
targets:  [-10, 2]      ; CapTP positions for targets
promises: [3]           ; CapTP positions for promises
errors:   [h'']         ; Error identifiers (unidentified in this case)
```

**Diagnostic notation**:

Standard CBOR diagnostic notation shows Tag 24 as a hex byte string:
```
24(h'84d81b82d9011866746172676574d81b82d9011866746172676574...')
```

Some tools may expand Tag 24 contents for readability. For documentation
purposes, we can annotate embedded CBOR with `24(<...>)` to show structure:
```
24(<[27([280("target")]), 27([280("target")]), 27([280("promise")]), 27([280("error"), "TypeError"])]>)
```

The angle brackets `<...>` are not standard diagnostic notation but serve to
indicate "this is the decoded content of the byte string."

**Forwarding benefit**: The intermediary can remap `-10` → `5` and `2` → `7` in
the `targets` array without touching the body bytes.

### Body Content Format

The body (inside the Tag 24 byte string) contains the arguments to deliver,
encoded as a CBOR array of passable values:

```
[arg0, arg1, ..., argN]
```

Each argument may be any passable value, including values that contain `target`,
`promise`, or `error` markers.

**Convention for method invocation**: When the target is expected to handle
the delivery as a method call, the first argument is conventionally a selector
(symbol) naming the method:

```
[selector, methodArg0, methodArg1, ...]
```

However, targets may freely implement either **object-like** behavior (where
the first argument is a method selector) or **function-like** behavior (where
all arguments are passed directly). The wire format does not distinguish these
cases—it is up to the target's implementation.

> **Endo implementation note**: The Endo OCapN implementation with Exo provides
> an affordance for implementing targets in the JavaScript idiom, where each
> method name is a string corresponding to the selector on the wire. Such
> implementations dispatch on the selector. Exos can also be converted to
> "function Exos" that receive the selector as the first argument, allowing
> a single target to handle both invocation styles.

**Example body for `obj.transfer(recipient, amount)`** (object-like):

```cbor
[
  280("transfer"),                    ; Method selector
  27([280("target")]),                ; recipient → targets[0]
  2(h'64')                            ; amount: 100
]
```

**Example body for function application `fn(x, y)`** (function-like):

```cbor
[
  27([280("target")]),                ; x → targets[0]
  2(h'64')                            ; y: 100
]
```

### Marker Index Assignment

Markers are assigned indices in **depth-first, left-to-right** order as they
appear in the body. This ensures consistent indexing regardless of nesting.

**Example**: A nested structure with multiple references:

```cbor
[280("call"),
  {"recipient": 27([280("target")]),       ; → targets[0]
   "amounts": [27([280("target")]),        ; → targets[1]
               27([280("target")])]},      ; → targets[2]
  27([280("promise")])]                    ; → promises[0]
```

The `targets` array would have 3 entries and `promises` would have 1 entry.

## CapTP Operations

All CapTP operations are encoded as Records (Tag 27) with symbol labels.

### op:start-session

```
27([280("op:start-session"),
    captp-version,           # String: "1.0"
    session-pubkey,          # Public key record
    acceptable-location,     # OCapN peer record  
    acceptable-location-sig  # Signature record
])
```

### op:deliver-only

Delivers a message without expecting a return value.

```
27([280("op:deliver-only"),
    to-desc,                 # desc:export record (target descriptor)
    body,                    # Tag 24 byte string (embedded CBOR passables)
    targets,                 # List of integers (CapTP positions)
    promises,                # List of integers (CapTP positions)
    errors                   # List of ByteArrays (error identifiers)
])
```

**Fields**:
- `to-desc`: The target object to deliver to (a `desc:export` record)
- `body`: Embedded CBOR (Tag 24) containing the method selector and arguments
  with in-band `target`, `promise`, and `error` markers
- `targets`: Parallel array mapping each `target` marker's index to its CapTP
  table position (may be positive for imports, negative for exports)
- `promises`: Parallel array mapping each `promise` marker's index to its CapTP
  table position
- `errors`: Parallel array with error identifiers (ByteArray) for each `error`
  marker in order of appearance; use empty byte string `h''` for anonymous errors

**Example** - calling `foo.bar(target1, promise1)`:

```cbor
27([280("op:deliver-only"),
    27([280("desc:export"), 2(h'00')]),     ; to-desc: export position 0
    24(h'...'),                              ; body: [280("bar"), target, promise]
    [2(h'05')],                              ; targets: [5] (position 5)
    [2(h'03')],                              ; promises: [3] (position 3)
    []                                       ; errors: none
])
```

### op:deliver

Delivers a message and expects a return value (promise pipelining).

```
27([280("op:deliver"),
    to-desc,                 # desc:export or desc:answer
    body,                    # Tag 24 byte string (embedded CBOR passables)
    targets,                 # List of integers (CapTP positions)
    promises,                # List of integers (CapTP positions)
    errors,                  # List of ByteArrays (error identifiers)
    answer-pos,              # Non-negative integer or false
    resolve-me-desc          # desc:import-object or desc:import-promise
])
```

**Fields**:
- `to-desc`: The target to deliver to (`desc:export` or `desc:answer`)
- `body`: Embedded CBOR (Tag 24) containing method selector and arguments
- `targets`: Parallel array for target markers → CapTP positions
- `promises`: Parallel array for promise markers → CapTP positions
- `errors`: Parallel array for error identifiers
- `answer-pos`: Position in answers table for the return promise, or `false`
- `resolve-me-desc`: Descriptor for where to send the resolution

**Example** - calling `foo.baz(target1)` expecting answer at position 7:

```cbor
27([280("op:deliver"),
    27([280("desc:export"), 2(h'00')]),      ; to-desc: export 0
    24(h'...'),                               ; body: [280("baz"), target]
    [2(h'02')],                               ; targets: [2]
    [],                                       ; promises: none
    [],                                       ; errors: none
    2(h'07'),                                 ; answer-pos: 7
    27([280("desc:import-promise"), 2(h'07')]) ; resolve-me-desc
])
```

### op:listen

Registers interest in a promise's resolution.

```
27([280("op:listen"),
    to-desc,                 # desc:export or desc:answer (promise to listen to)
    listen-desc,             # desc:import-object (where to send resolution)
    wants-partial            # Boolean (receive partial results?)
])
```

**Note**: `op:listen` does not carry passable data, so it has no parallel arrays.

### op:gc-export

```
27([280("op:gc-export"),
    export-position,         # Non-negative integer
    wire-delta               # Positive integer
])
```

### op:gc-answer

```
27([280("op:gc-answer"),
    answer-position          # Non-negative integer
])
```

### op:abort

```
27([280("op:abort"),
    reason                   # String
])
```

## CapTP Descriptors

### desc:import-object

```
27([280("desc:import-object"), position])
```

Where `position` is a non-negative integer.

### desc:import-promise

```
27([280("desc:import-promise"), position])
```

### desc:export

```
27([280("desc:export"), position])
```

### desc:answer

```
27([280("desc:answer"), answer-pos])
```

### desc:sig-envelope

```
27([280("desc:sig-envelope"),
    24(<signed-object>),     # Embedded CBOR: the object that was signed
    signature                # Signature record
])
```

The `signed-object` is wrapped in Tag 24 (encoded CBOR data item) as a byte string.
This preserves the exact bytes over which the signature was computed, allowing
verification without reserialization. This design makes the protocol resilient
to any defects in canonicalization—the verifier extracts and verifies against
the original bytes rather than re-encoding the parsed object.

### desc:handoff-give

```
27([280("desc:handoff-give"),
    receiver-key,            # Public key record
    exporter-location,       # OCapN peer record
    session,                 # ByteArray (Session ID, 32 bytes)
    gifter-side,             # ByteArray (Public ID, 32 bytes)
    gift-id                  # Non-negative integer
])
```

### desc:handoff-receive

```
27([280("desc:handoff-receive"),
    receiving-session,       # ByteArray (Session ID, 32 bytes)
    receiving-side,          # ByteArray (Public ID, 32 bytes)
    handoff-count,           # Non-negative integer
    signed-give              # desc:sig-envelope containing desc:handoff-give
])
```

## Cryptographic Components

### Public Key

```
[280("public-key"),
 [280("ecc"),
  [280("curve"), 280("Ed25519")],
  [280("flags"), 280("eddsa")],
  [280("q"), q-value]]]      # q-value: ByteArray, 32 bytes
```

### Signature

```
[280("sig-val"),
 [280("eddsa"),
  [280("r"), r-value],       # r-value: ByteArray, 32 bytes
  [280("s"), s-value]]]      # s-value: ByteArray, 32 bytes
```

### OCapN Peer (Locator)

```
27([280("ocapn-peer"),
    transport,               # Symbol (e.g., 280("tcp"))
    designator,              # String
    hints                    # Struct or false
])
```

### Sturdyref

```
27([280("ocapn-sturdyref"),
    peer,                    # OCapN peer record
    swissnum                 # ByteArray
])
```

## Canonicalization Rules

For signature verification and comparison, CBOR encoding MUST be canonical:

1. **Integers**: Always use Tag 2/3 bignums with minimal byte representation
2. **Lengths**: Use shortest encoding for lengths (0-23 inline, 24-255 one byte,
   etc.)
3. **Maps**: Keys in bytewise lexicographic order
4. **Floats**: Always use 8-byte encoding (major type 7, additional info 27)
5. **NaN**: Only canonical NaN (`0x7FF8000000000000`)
6. **No indefinite lengths**: All arrays, maps, strings, and byte strings use
   definite length encoding

## Comparison with Syrup

| Aspect | Syrup | CBOR |
|--------|-------|------|
| Format | Text-based delimiters | Binary length prefixes |
| Integers | ASCII digits + `+`/`-` | Tag 2/3 bignums |
| Strings | `len"content` | Major type 3 |
| Records | `<selector body>` | Tag 27 + array |
| Symbols | `len'content` | Tag 280 + text |
| Parsers | Custom only | Standard CBOR libraries |

## Validation

Messages encoded per this specification can be validated by:

1. **Any RFC 8949 CBOR decoder** can parse the binary format
2. **CBOR diagnostic notation** (e.g., from [cbor.me](https://cbor.me)) provides
   human-readable representation for inspection
3. **Schema validation** can verify OCapN-specific structure (tag usage, field
   types)

## References

- [RFC 8949: CBOR](https://www.rfc-editor.org/rfc/rfc8949.html)
- [OCapN Model Specification][Model]
- [CapTP Specification](https://github.com/ocapn/ocapn/blob/main/draft-specifications/CapTP%20Specification.md)
- [CBOR Tags Registry](https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml)

[Model]: https://github.com/ocapn/ocapn/blob/main/draft-specifications/Model.md
[Slots]: https://github.com/ocapn/ocapn/issues/172
[SelfDescribe]: https://datatracker.ietf.org/doc/html/rfc8949#self-describe



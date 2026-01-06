# Syrup vs CBOR Codec Comparison

This document compares equivalent encodings between the Syrup and CBOR codecs
for OCapN data types, showing both human-readable notation and wire format.

## Notation Conventions

**Human-readable notation**:
- Syrup: Uses a presentation syntax where `N"` means N-byte string, `N'` means
  N-byte symbol, `N+` means positive integer N, `N-` means negative magnitude N
- CBOR: Uses [diagnostic notation][Diagnostic] per RFC 8949 §8

**Wire format**:
- Both shown as annotated hexadecimal with comments

## Primitive Types

### Boolean

**Presentation notation**:
| Value | Syrup | CBOR |
|-------|-------|------|
| true | `t` | `true` |
| false | `f` | `false` |

**Wire format**:

True:
```
Syrup: 74                          # 't'
CBOR:  F5                          # Simple value 21 (true)
```

False:
```
Syrup: 66                          # 'f'
CBOR:  F4                          # Simple value 20 (false)
```

### Integer

**Presentation notation**:
| Value | Syrup | CBOR |
|-------|-------|------|
| 0 | `0+` | `2(h'')` |
| 1 | `1+` | `2(h'01')` |
| 42 | `42+` | `2(h'2a')` |
| 256 | `256+` | `2(h'0100')` |
| -1 | `1-` | `3(h'')` |
| -42 | `42-` | `3(h'29')` |

**Wire format**:

Integer 42:
```
Syrup: 34 32 2B                    # "42+"
CBOR:  C2 41 2A                    # Tag 2, 1-byte bstr, 0x2A
```

Integer -1:
```
Syrup: 31 2D                       # "1-"
CBOR:  C3 40                       # Tag 3, 0-byte bstr
```

### Float64

**Presentation notation**:
| Value | Syrup | CBOR |
|-------|-------|------|
| 1.5 | `D` + IEEE bytes | `1.5` |
| NaN | `D` + canonical NaN | `NaN` |

**Wire format**:

Float 1.5:
```
Syrup: 44 3F F8 00 00 00 00 00 00  # 'D' + 8-byte IEEE 754 BE
CBOR:  FB 3F F8 00 00 00 00 00 00  # Major 7, info 27, 8-byte IEEE 754 BE
```

### String

**Presentation notation**:
| Value | Syrup | CBOR |
|-------|-------|------|
| "" | `0"` | `""` |
| "hello" | `5"hello` | `"hello"` |

**Wire format**:

String "hello":
```
Syrup: 35 22 68 65 6C 6C 6F        # "5" + '"' + "hello"
CBOR:  65 68 65 6C 6C 6F           # Major 3, len 5, "hello"
```

### ByteArray

**Presentation notation**:
| Value | Syrup | CBOR |
|-------|-------|------|
| empty | `0:` | `h''` |
| 0xCAFE | `2:` + bytes | `h'cafe'` |

**Wire format**:

ByteArray 0xCAFE:
```
Syrup: 32 3A CA FE                 # "2" + ':' + bytes
CBOR:  42 CA FE                    # Major 2, len 2, bytes
```

### Symbol

**Presentation notation**:
| Value | Syrup | CBOR |
|-------|-------|------|
| 'foo | `3'foo` | `280("foo")` |
| 'transfer | `8'transfer` | `280("transfer")` |

**Wire format**:

Symbol 'foo:
```
Syrup: 33 27 66 6F 6F              # "3" + "'" + "foo"
CBOR:  D9 01 18 63 66 6F 6F        # Tag 280, text len 3, "foo"
```

## Structured Types

### List

**Presentation notation**:

Empty list:
```
Syrup: []
CBOR:  []
```

List [1, 2]:
```
Syrup: [1+2+]
CBOR:  [2(h'01'), 2(h'02')]
```

**Wire format**:

List [1, 2]:
```
Syrup: 5B                          # '['
       31 2B                       # 1+
       32 2B                       # 2+
       5D                          # ']'

CBOR:  82                          # Array, 2 elements
       C2 41 01                    # Tag 2, bstr h'01'
       C2 41 02                    # Tag 2, bstr h'02'
```

### Struct (Dictionary)

**Presentation notation**:

Struct {"a": 1}:
```
Syrup: {1"a1+}
CBOR:  {"a": 2(h'01')}
```

**Wire format**:

Struct {"a": 1}:
```
Syrup: 7B                          # '{'
       31 22 61                    # 1"a
       31 2B                       # 1+
       7D                          # '}'

CBOR:  A1                          # Map, 1 pair
       61 61                       # Text "a"
       C2 41 01                    # Tag 2, bstr h'01'
```

### Set

**Presentation notation**:

Set {1, 2}:
```
Syrup: #1+2+$
CBOR:  [2(h'01'), 2(h'02')]
```

**Wire format**:

Set {1, 2}:
```
Syrup: 23                          # '#'
       31 2B                       # 1+
       32 2B                       # 2+
       24                          # '$'

CBOR:  82                          # Array, 2 elements
       C2 41 01                    # Tag 2, bstr h'01'
       C2 41 02                    # Tag 2, bstr h'02'
```

## Records

Records are the primary structural difference between Syrup and CBOR in OCapN.
Syrup uses **symbol labels**, while CBOR uses **plain string labels**.

### Simple Record

Record with label "export" and field value 5:

**Presentation notation**:
```
Syrup: <6'export5+>
CBOR:  27(["export", 2(h'05')])
```

**Wire format**:
```
Syrup: 3C                          # '<'
       36 27 65 78 70 6F 72 74     # 6'export
       35 2B                       # 5+
       3E                          # '>'

CBOR:  D8 1B                       # Tag 27
       82                          # Array, 2 elements
       66 65 78 70 6F 72 74        # Text "export"
       C2 41 05                    # Tag 2, bstr h'05'
```

### Nested Record

A deliver-only with export descriptor at position 0:

**Presentation notation**:
```
Syrup: <12'deliver-only<6'export0+>...>
CBOR:  27(["deliver-only", 27(["export", 2(h'00')]), ...])
```

**Wire format** (partial, showing nesting):
```
Syrup: 3C                          # '<'
       31 32 27                    # "12'"
       64 65 6C 69 76 65 72 2D 6F 6E 6C 79
                                   # "deliver-only"
       3C                          # '<' (nested record)
       36 27 65 78 70 6F 72 74     # 6'export
       30 2B                       # 0+
       3E                          # '>' (end nested)
       ...                         # remaining fields
       3E                          # '>' (end outer)

CBOR:  D8 1B                       # Tag 27
       86                          # Array, 6 elements
       6C                          # Text, 12 bytes
       64 65 6C 69 76 65 72 2D 6F 6E 6C 79
                                   # "deliver-only"
       D8 1B                       # Tag 27 (nested record)
       82                          # Array, 2 elements
       66 65 78 70 6F 72 74        # Text "export"
       C2 40                       # Tag 2, bstr h'' (0)
       ...                         # remaining fields
```

## OCapN Descriptors

### import-object (position 5)

**Presentation notation**:
```
Syrup: <13'import-object5+>
CBOR:  27(["import-object", 2(h'05')])
```

### export (position 0)

**Presentation notation**:
```
Syrup: <6'export0+>
CBOR:  27(["export", 2(h'00')])
```

### answer (position 7)

**Presentation notation**:
```
Syrup: <6'answer7+>
CBOR:  27(["answer", 2(h'07')])
```

## In-Band Reference Markers

### Target marker

**Presentation notation**:
```
Syrup: <6'target>
CBOR:  27(["target"])
```

**Wire format**:
```
Syrup: 3C                          # '<'
       36 27 74 61 72 67 65 74     # 6'target
       3E                          # '>'

CBOR:  D8 1B                       # Tag 27
       81                          # Array, 1 element
       66 74 61 72 67 65 74        # Text "target"
```

### Promise marker

**Presentation notation**:
```
Syrup: <7'promise>
CBOR:  27(["promise"])
```

### Error marker

**Presentation notation**:
```
Syrup: <5'error9"TypeError>
CBOR:  27(["error", "TypeError"])
```

**Wire format**:
```
Syrup: 3C                          # '<'
       35 27 65 72 72 6F 72        # 5'error
       39 22                       # 9"
       54 79 70 65 45 72 72 6F 72  # "TypeError"
       3E                          # '>'

CBOR:  D8 1B                       # Tag 27
       82                          # Array, 2 elements
       65 65 72 72 6F 72           # Text "error"
       69                          # Text, 9 bytes
       54 79 70 65 45 72 72 6F 72  # "TypeError"
```

## CapTP Operations

### abort

**Presentation notation**:
```
Syrup: <5'abort14"session closed>
CBOR:  27(["abort", "session closed"])
```

### listen

**Presentation notation**:
```
Syrup: <6'listen<6'export1+><13'import-object2+>f>
CBOR:  27(["listen", 27(["export", 2(h'01')]), 27(["import-object", 2(h'02')]), false])
```

## Tagged Values

OCapN tagged values use a record with label "tag":

**Presentation notation**:
```
Syrup: <3'tag7'decimal4"3.14>
CBOR:  27(["tag", "decimal", "3.14"])
```

**Wire format**:
```
Syrup: 3C                          # '<'
       33 27 74 61 67              # 3'tag
       37 27                       # 7'
       64 65 63 69 6D 61 6C        # "decimal"
       34 22                       # 4"
       33 2E 31 34                 # "3.14"
       3E                          # '>'

CBOR:  D8 1B                       # Tag 27
       83                          # Array, 3 elements
       63 74 61 67                 # Text "tag"
       67 64 65 63 69 6D 61 6C     # Text "decimal"
       64 33 2E 31 34              # Text "3.14"
```

## Embedded CBOR (Tag 24)

CBOR wraps passable data bodies in Tag 24 (encoded CBOR data item), allowing
the body to be forwarded as an opaque byte string. Syrup encodes bodies inline
without a wrapper.

**CBOR only**:
```
24(h'...')  # Byte string containing encoded CBOR passable data
```

## Summary of Differences

| Aspect | Syrup | CBOR |
|--------|-------|------|
| Encoding style | Delimiter-based (`<`, `>`, `[`, `]`) | Length-prefixed |
| Record labels | Symbols (`N'label`) | Strings (`"label"`) |
| Record delimiters | `<` ... `>` | Tag 27 + array |
| Integers | ASCII decimal + `+`/`-` | Tag 2/3 bignums |
| Strings | `N"content` | Major type 3 |
| Symbols | `N'content` | Tag 280 + text |
| Body wrapper | None (inline) | Tag 24 byte string |
| Parser availability | Custom implementation | Standard CBOR libraries |

## Codec Layer Abstraction

The OCapN codec layer abstracts these differences. The `recordLabelType`
property on readers and writers determines whether record labels are encoded
as symbols (Syrup) or strings (CBOR):

```js
// Syrup writer: recordLabelType = 'selector'
// CBOR writer: recordLabelType = 'string'

// makeRecordCodec automatically uses the appropriate label type
const codec = makeRecordCodec('export', 'selector', writeBody, readBody);
codec.write(value, writer);  // Adapts to writer's recordLabelType
```

[Diagnostic]: https://www.rfc-editor.org/rfc/rfc8949.html#section-8

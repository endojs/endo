# `@endo/pass-style`

Defines what data can be passed between vats in an object-capability system.

## Overview

The **@endo/pass-style** package defines the `Passable` type and provides the
`passStyleOf()` function for classifying JavaScript values according to their
`PassStyle`.
This classification determines how values can safely be passed between isolated
compartments or across network boundaries.

Every passable value has exactly one pass style from a fixed set of
possibilities.
The key distinction is between **pass-by-copy** (the value itself is copied)
and **Pass-by-reference**.

## Pass Styles

| Pass Style | Category | Description | Examples |
|------------|----------|-------------|----------|
| `'null'` | Primitive | The null value | `null` |
| `'undefined'` | Primitive | The undefined value | `undefined` |
| `'boolean'` | Primitive | Boolean primitives | `true`, `false` |
| `'number'` | Primitive | IEEE 754 floats | `42`, `3.14`, `NaN`, `Infinity` |
| `'bigint'` | Primitive | Arbitrary-precision integers | `123n`, `-456n` |
| `'string'` | Primitive | Well-formed strings | `'hello'`, `''` |
| `'symbol'` | Primitive | Registered/well-known symbols | `Symbol.iterator` |
| `'copyArray'` | Pass-by-copy | Frozen arrays of passables | `harden([1, 2, 3])` |
| `'copyRecord'` | Pass-by-copy | Frozen plain objects | `harden({ x: 10 })` |
| `'remotable'` | Pass-by-presence | Far objects & remote presences | `Far('Counter', {...})` |
| `'tagged'` | Extension | Domain-specific types | `makeTagged('copySet', [...])` |
| `'error'` | Pass-by-presence | Error objects | `harden(Error('failed'))` |
| `'promise'` | Pass-by-presence | Promise objects | `Promise.resolve(42)` |

## Core Functions

### passStyleOf(value)

Classifies a value's pass style.
Throws if the value is not passable.

```javascript
import { passStyleOf } from '@endo/pass-style';

passStyleOf(42);                    // 'number'
passStyleOf(harden([1, 2]));        // 'copyArray'
passStyleOf(harden({ x: 1 }));      // 'copyRecord'
passStyleOf(Promise.resolve());     // 'promise'

// Throws for non-passable values
passStyleOf({ x: 1 });  // Error: not frozen
```

### isPassable(value)

Boolean test for passability.
Returns `true` if the value is passable, `false` otherwise.

```javascript
import { isPassable } from '@endo/pass-style';

isPassable(42);                // true
isPassable(harden([1, 2]));    // true
isPassable({ x: 1 });          // false - not frozen
isPassable(harden({ x: 1 }));  // true
```

Use `isPassable()` when you want a boolean result.
Use `passStyleOf()` when you need the specific pass style or want detailed
error messages.

### Far(iface, methods)

Creates a remotable object that can be passed by reference.

```javascript
import { Far } from '@endo/pass-style';

const counter = Far('Counter', {
  increment() { return count += 1; },
  getValue() { return count; }
});

passStyleOf(counter);  // 'remotable'
```

**Note:** Far objects are remotable but don't validate their inputs.
For defensive objects with automatic input validation, see
[@endo/exo](../exo/README.md).

### makeTagged(tag, payload)

Creates a CopyTagged object, the extension point for domain-specific data
types.

```javascript
import { makeTagged } from '@endo/pass-style';

const tagged = makeTagged('customType', { data: 42 });
passStyleOf(tagged);  // 'tagged'
```

Tagged objects are used internally by [@endo/patterns](../patterns/README.md)
to implement CopySet, CopyBag, and CopyMap.

## Passable Values

A value is passable if it meets these requirements:

1. **Primitives** are always passable (except unregistered symbols)
2. **Objects must be frozen** via `harden()` from `@endo/pass-style` or `ses`
3. **No cyclic references** in pass-by-copy structures (copyArray, copyRecord,
   tagged)
4. **Strings must be well-formed** (no unpaired surrogates)
5. **Symbols must tentatively be created using `passableSymbolForName()`** from
   `@endo/pass-style`.

```javascript
// Passable - frozen array of primitives
const data = harden([1, 2, 3]);

// NOT passable - not frozen
const mutable = [1, 2, 3];

// NOT passable - cyclic reference
const cyclic = harden([]);
cyclic.push(cyclic);
```

## Pass-by-Copy vs Pass-by-Presence

### Pass-by-Copy

The value itself is copied when passed.
Changes to the original don't affect copies.

**Use for:** Immutable data, configurations, messages, small structures

**Pass styles:** primitives, copyArray, copyRecord, tagged

```javascript
const config = harden({
  timeout: 5000,
  retries: 3
});

// When passed, config is copied
// The recipient gets a separate copy
```

### Pass-by-reference

A reference is passed.
The object remains in its original location.

**Use for:** Objects with behavior, mutable state, capabilities, large objects

**Pass styles:** remotable, promise, error

```javascript
const service = Far('Service', {
  getData() { return data; }
});

// When passed, only a reference is passed
// Method calls are forwarded to the original object
```

## Type Guards

The package provides type guards for common pass styles:

```javascript
import {
  isRecord, assertRecord,
  isCopyArray, assertCopyArray,
  isRemotable, assertRemotable,
  isAtom, assertAtom
} from '@endo/pass-style';

// Boolean checks
if (isRecord(value)) {
  // value is a CopyRecord
}

// Assertions (throw if false)
assertRemotable(obj);
// obj is guaranteed to be a remotable
```

## Integration with Endo Packages

- **Validation**: [@endo/patterns](../patterns/README.md) - Pattern matching to
  validate passables
- **Defensive Objects**: [@endo/exo](../exo/README.md) - Exos combine Far with
  pattern validation
- **Communication**: [@endo/eventual-send](../eventual-send/README.md) - Send
  messages using E() proxy
- **Serialization**: [@endo/marshal](../marshal/README.md) - Encode passables
  for transmission

**Complete Tutorial**: See [Message Passing](../../docs/message-passing.md) for
a comprehensive guide showing how pass-style works with patterns, exo, and
eventual-send.

## Deep Dives

For implementation details:
- [CopyRecord guarantees](./doc/copyRecord-guarantees.md) - Detailed validation
  guarantees for CopyRecord
- [CopyArray guarantees](./doc/copyArray-guarantees.md) - Detailed validation
  guarantees for CopyArray
- [Enumerating properties](./doc/enumerating-properties.md) - Property
  enumeration semantics
- [Type definitions](./src/types.js) - Complete TypeScript type definitions

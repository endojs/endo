# `@endo/patterns`

Pattern matching and validation for passable data, with copy-collections and
interface guards.

## Overview

The **@endo/patterns** package provides the `M` namespace for creating pattern
matchers that validate passable data and describe behavioral contracts.
This is the validation layer above [@endo/pass-style](../pass-style/README.md),
enabling you to check that data matches expected shapes before using it.

Patterns enable:
- **Data validation**: Check that values match expected types and structures
- **Interface contracts**: Describe method signatures with InterfaceGuards
- **Copy collections**: CopySet, CopyBag, CopyMap for passable data structures
- **Key comparison**: Distributed equality for comparing values across vats

## Quick Start

```javascript
import { M, mustMatch } from '@endo/patterns';

const specimen = harden({ foo: 3, bar: 4 });

const pattern = M.splitRecord(
  { foo: M.number() },                        // required properties
  { bar: M.string(), baz: M.number() }       // optional properties
);

mustMatch(specimen, pattern);
// throws: 'bar?: number 4 - Must be a string'
```

_For best rendering, use the
[Endo reference docs](https://endojs.github.io/endo) site._

## The M Namespace

The `M` object provides methods for creating pattern matchers organized into
several categories:

### Primitive Matchers

Match specific JavaScript types:

```javascript
M.any()           // Matches any passable
M.undefined()     // Matches undefined
M.null()          // Matches null
M.boolean()       // Matches true or false
M.number()        // Matches any number (including NaN, Infinity)
M.bigint()        // Matches any bigint
M.string()        // Matches any string
M.symbol()        // Matches registered/well-known symbols

// Constrained primitives
M.nat()           // Non-negative bigint
M.gte(5)          // Number >= 5
M.lte(100)        // Number <= 100
```

### Container Matchers

Match copyArray, copyRecord, and other structures:

```javascript
M.array()         // Any CopyArray
M.record()        // Any CopyRecord
M.set()           // Any CopySet
M.bag()           // Any CopyBag
M.map()           // Any CopyMap

// With constraints
M.array({ maxSize: 10 })          // Array with at most 10 elements
M.string({ maxSize: 100 })        // String with at most 100 characters

// Structured content
M.arrayOf(M.number())             // Array of numbers only
M.recordOf(M.string(), M.number()) // Record with string keys, number values
M.setOf(M.string())               // Set of strings only
```

### Structured Matchers

Match specific shapes:

```javascript
// Split patterns: required, optional, rest
M.splitArray(
  [M.string(), M.number()],      // required elements
  [M.boolean()],                  // optional elements
  M.any()                         // rest elements
)

M.splitRecord(
  { name: M.string() },           // required properties
  { age: M.number() },            // optional properties
  M.any()                         // rest properties
)

// Partial matches
M.partial({ name: M.string() })  // Has at least 'name' property

// Split auto-detects array vs record
M.split({ x: M.number() }, M.any())
```

### Logical Operators

Combine matchers:

```javascript
M.and(M.number(), M.gte(0), M.lte(100))   // 0 <= n <= 100
M.or(M.string(), M.number())               // String or number
M.not(M.undefined())                       // Anything except undefined
M.opt(M.string())                          // undefined or string (optional)
```

### Comparison Matchers

Match values relative to a key:

```javascript
M.eq('hello')     // Equal to 'hello'
M.neq(0)          // Not equal to 0
M.lt(10)          // Less than 10
M.lte(100)        // Less than or equal to 100
M.gte(0)          // Greater than or equal to 0
M.gt(-1)          // Greater than -1
```

### Special Matchers

```javascript
M.remotable()           // Any remotable object
M.remotable('Counter')  // Remotable with specific label
M.error()               // Any error
M.promise()             // Any promise
M.eref(M.number())      // Number or promise for number (eventual reference)
M.kind('copyArray')     // Specific pass style
M.pattern()             // Any valid pattern
M.key()                 // Any valid Key
M.scalar()              // Any primitive or remotable
```

## Pattern Matching

### matches(specimen, pattern)

Returns `true` if the specimen matches the pattern, `false` otherwise:

```javascript
import { M, matches } from '@endo/patterns';

matches(42, M.number());                    // true
matches('hello', M.number());               // false
matches([1, 2, 3], M.arrayOf(M.number())); // true
```

### mustMatch(specimen, pattern, label?)

Throws with a descriptive error if the specimen doesn't match:

```javascript
import { mustMatch } from '@endo/patterns';

mustMatch(42, M.string());
// throws: "number 42 - Must be a string"

mustMatch(-5, M.and(M.number(), M.gte(0)), 'count');
// throws: "count: number -5 - Must be >= 0"
```

The error messages are designed to help you understand exactly what was wrong
with the data.

## Copy Collections

Patterns introduces three passable collection types built on `makeTagged()`:

### CopySet

A set of unique Keys (primitives or remotables):

```javascript
import { makeCopySet } from '@endo/patterns';

const colors = makeCopySet(['red', 'blue', 'green']);

// Elements are sorted in rank order
// Duplicates are removed
// Can be passed between vats

// Pattern for sets
const ColorSet = M.setOf(M.string());
mustMatch(colors, ColorSet);  // passes
```

**Why not use JavaScript Set?**
JavaScript Sets aren't passable.
CopySet is frozen, comparable via `keyEQ`, and can be efficiently serialized.

### CopyBag

A multiset (elements with counts):

```javascript
import { makeCopyBag } from '@endo/patterns';

const inventory = makeCopyBag([
  ['apples', 5n],
  ['oranges', 3n],
  ['apples', 2n]   // counts are combined
]);

// Result: [['apples', 7n], ['oranges', 3n]]

const InventoryPattern = M.bagOf(M.string(), M.bigint());
mustMatch(inventory, InventoryPattern);
```

### CopyMap

A map from Keys to Passable values:

```javascript
import { makeCopyMap } from '@endo/patterns';

const balances = makeCopyMap([
  ['alice', 100],
  ['bob', 50]
]);

// Keys are sorted in rank order
// Can use any Key as a key (not just strings!)

const remotableKey = Far('Key', {});
const map = makeCopyMap([[remotableKey, 'value']]);

const BalancesPattern = M.mapOf(M.string(), M.number());
mustMatch(balances, BalancesPattern);
```

**Why not use plain objects?**
CopyMap supports:
- Any Key as a key (objects, remotables, not just strings)
- Efficient key comparison using `compareKeys()`
- Subset relationships for partial ordering

## Interface Guards

InterfaceGuards describe behavioral contracts for objects, particularly useful
with [@endo/exo](../exo/README.md):

### Creating Interface Guards

```javascript
import { M } from '@endo/patterns';

const CounterI = M.interface('Counter', {
  // Synchronous method
  increment: M.call(M.number()).returns(M.number()),

  // Method with optional arguments
  reset: M.call().optional(M.number()).returns(),

  // Method with rest arguments
  add: M.call(M.number()).rest(M.number()).returns(M.number()),

  // Async method (awaits arguments)
  asyncOp: M.callWhen(M.string()).returns(M.string())
});
```

### Method Guard Structure

```javascript
// Basic call: call(required args...)
M.call(M.string(), M.number())

// With optional args
M.call(M.string()).optional(M.number())

// With rest args
M.call(M.string()).rest(M.any())

// Specify return type
M.call(M.string()).returns(M.number())

// Async method (awaits promise args)
M.callWhen(M.remotable()).returns(M.string())
```

### Integration with Exo

InterfaceGuards are enforced automatically by exos:

```javascript
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

const CounterI = M.interface('Counter', {
  increment: M.call(M.number()).returns(M.number())
});

const counter = makeExo('Counter', CounterI, {
  increment(n) {
    // n is guaranteed to be a number by the guard
    return count += n;
  }
});

counter.increment(5);      // OK
counter.increment('5');    // throws: Must be a number
```

This is the foundation of defensive programming in Endo: guards validate inputs
automatically, so your methods can focus on business logic.

## Key Comparison

Keys can be compared for equality and ordering:

### keyEQ(key1, key2)

Tests if two Keys are equal using distributed equality semantics:

```javascript
import { keyEQ } from '@endo/patterns';

keyEQ('hello', 'hello');        // true
keyEQ(42, 42);                  // true
keyEQ([1, 2], [1, 2]);          // true (compares content)

const r1 = Far('Obj', {});
const r2 = Far('Obj', {});
keyEQ(r1, r1);                  // true (same remotable)
keyEQ(r1, r2);                  // false (different remotables)
```

### compareKeys(key1, key2)

Returns a comparison result implementing a **partial order**:
- `0`: Keys are equal
- `-1`: key1 < key2
- `1`: key1 > key2
- `NaN`: Keys are incomparable

```javascript
import { compareKeys, keyLT, keyGT } from '@endo/patterns';

compareKeys('a', 'b');          // -1
compareKeys(5, 5);              // 0
compareKeys(10, 3);             // 1

// Convenience functions
keyLT('a', 'b');                // true
keyGT(10, 3);                   // true

// Incomparable keys
const r1 = Far('A', {});
const r2 = Far('B', {});
compareKeys(r1, r2);            // NaN (different remotables)
```

**Why partial order?**
Not all Keys can be compared.
For example, different remotables have no defined ordering, and CopySets use
subset relationships.

## Key, Pattern, and Passable Hierarchy

Understanding the type hierarchy:

```
Passable (everything that can pass)
├── Error
├── Promise
├── Key (stable, comparable)
│   ├── Primitives (null, undefined, boolean, number, bigint, string, symbol)
│   ├── Remotable
│   ├── CopyArray<Key>
│   ├── CopyRecord<Key>
│   ├── CopySet<Key>
│   ├── CopyBag<Key>
│   └── CopyMap<Key, Passable>
└── Pattern (describes a set of Passables)
    ├── Key (matches itself)
    └── Key-like with Matcher leaves
```

- **Passable**: Can cross vat boundaries (from @endo/pass-style)
- **Key**: Stable and comparable subset of Passable
- **Pattern**: Describes a subset of Passables for matching

## Integration with Endo Packages

- **Foundation**: [@endo/pass-style](../pass-style/README.md) - What can be
  passed (Passables)
- **Enforcement**: [@endo/exo](../exo/README.md) - Use InterfaceGuards for
  automatic validation
- **Communication**: [@endo/eventual-send](../eventual-send/README.md) - Send
  messages to validated objects

**Complete Tutorial**: See [Message Passing](../../docs/message-passing.md) for
a comprehensive guide showing how patterns work with pass-style, exo, and
eventual-send.

## Deep Dives

For implementation details:
- [marshal vs patterns abstraction levels](./docs/marshal-vs-patterns-level.md)
  \- kindOf vs passStyleOf vs typeof
- [Type definitions](./src/types.ts) - Complete TypeScript type definitions

## License

[Apache-2.0](./LICENSE)

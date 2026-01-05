# `@endo/exo`

Create defensive remotable objects by combining Far objects with
InterfaceGuards.

## Overview

An **Exo** is a remotable object (created with `Far` from
[@endo/pass-style](../pass-style/README.md)) protected by an
**InterfaceGuard** (from [@endo/patterns](../patterns/README.md)).
The guard automatically validates all method arguments and return values,
providing the first layer of defense against malformed input.

This package provides three patterns for creating exos:
- **makeExo** - Single instance with minimal state management
- **defineExoClass** - Multiple instances with per-instance state
- **defineExoClassKit** - Multiple facets (related objects) sharing state

## Why Exo?

Far objects are remotable but don't validate inputs.
Exos add automatic validation:

```javascript
import { Far } from '@endo/pass-style';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

// Far object - no validation
let count = 0;
const counter1 = Far('Counter', {
  increment(n) {
    count += n;  // What if n is not a number? undefined? a string?
    return count;
  }
});

// Exo - automatic validation
const CounterI = M.interface('Counter', {
  increment: M.call(M.number()).returns(M.number())
});

const counter2 = makeExo('Counter', CounterI, {
  increment(n) {
    count += n;  // n is guaranteed to be a number by the guard
    return count;
  }
});

counter2.increment(5);      // OK
counter2.increment('5');    // throws: Must be a number
```

The InterfaceGuard validates arguments **before** the method executes,
catching errors at the boundary rather than deep in your logic.

## Three Patterns

### makeExo: Single Instance

Use when you need one exo instance with no complex state management:

```javascript
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

const GreeterI = M.interface('Greeter', {
  greet: M.call(M.string()).returns(M.string())
});

const greeter = makeExo('Greeter', GreeterI, {
  greet(name) {
    return `Hello, ${name}!`;
  }
});

greeter.greet('World');  // 'Hello, World!'
```

**When to use:**
- Single, stateless service objects
- Utility objects with no instance-specific state
- Simple cases where you don't need class-like behavior

### defineExoClass: Multiple Instances with State

Use when you need multiple exo instances, each with their own state:

```javascript
import { defineExoClass } from '@endo/exo';
import { M } from '@endo/patterns';

const CounterI = M.interface('Counter', {
  increment: M.call().optional(M.number()).returns(M.number()),
  getValue: M.call().returns(M.number())
});

const makeCounter = defineExoClass(
  'Counter',
  CounterI,

  // init function: creates initial state for each instance
  (initialValue = 0) => ({ count: initialValue }),

  // methods: have access to this.state and this.self
  {
    increment(delta = 1) {
      this.state.count += delta;
      return this.state.count;
    },
    getValue() {
      return this.state.count;
    }
  }
);

const counter1 = makeCounter(0);
const counter2 = makeCounter(100);

counter1.increment();  // 1
counter2.increment();  // 101 (separate state)
```

**When to use:**
- Need multiple independent instances
- Each instance has its own state

**State access:**
- `this.state` - The instance's state object
- `this.self` - Reference to the exo itself (for return values or callbacks)

### defineExoClassKit: Multiple Facets with Shared State

Use when you need multiple related objects (facets) that share the same state.
This is the key pattern for **least authority**: give each client only the
facet they need.

```javascript
import { defineExoClassKit } from '@endo/exo';
import { M } from '@endo/patterns';

const CounterKitI = {
  up: M.interface('UpCounter', {
    increment: M.call(M.number()).returns(M.number())
  }),
  down: M.interface('DownCounter', {
    decrement: M.call(M.number()).returns(M.number())
  }),
  reader: M.interface('CounterReader', {
    getValue: M.call().returns(M.number())
  })
};

const makeCounterKit = defineExoClassKit(
  'Counter',
  CounterKitI,

  // init: shared state across all facets
  (initialValue = 0) => ({ count: initialValue }),

  // methods: one object per facet
  {
    up: {
      increment(delta) {
        this.state.count += delta;
        return this.state.count;
      }
    },
    down: {
      decrement(delta) {
        this.state.count -= delta;
        return this.state.count;
      }
    },
    reader: {
      getValue() {
        return this.state.count;
      }
    }
  }
);

const { up, down, reader } = makeCounterKit(50);

// Give different facets to different clients
// incrementer only gets `up`, decrementer only gets `down`
// Everyone can have `reader`, it's read-only
up.increment(10);    // 60
down.decrement(5);   // 55
reader.getValue();   // 55
```

**When to use:**
- Need to separate capabilities (least authority)
- Multiple related objects that share state
- Example: public/private interfaces, admin/user facets, mint/purse/payment
  patterns

**Context access:**
- `this.state` - Shared state across all facets
- `this.facets` - Object containing all facets (for inter-facet communication)

## Async Methods with M.callWhen()

For methods that await promises, use `M.callWhen()` instead of `M.call()`:

```javascript
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';

const FetcherI = M.interface('Fetcher', {
  // Async method: validates and awaits arguments before calling method
  fetch: M.callWhen(M.string()).returns(M.string())
});

const fetcher = makeExo('Fetcher', FetcherI, {
  async fetch(url) {
    // url is validated, then awaited if it's a promise
    const response = await E(httpClient).get(url);
    return response.text();
  }
});
```

The `M.callWhen()` guard:
1. Validates the argument pattern
2. Awaits the argument if it's a promise
3. Validates the resolved value against the pattern
4. Then calls the method with the validated, resolved value

This enables safe eventual-send semantics: remote calls can pass promises, and
your method receives validated resolved values.

## State Management

Each exo pattern handles state differently:

### makeExo

No built-in state management.
Use closure variables:

```javascript
let count = 0;

const counter = makeExo('Counter', CounterI, {
  increment() {
    count += 1;
    return count;
  }
});
```

### defineExoClass

`this.state` is per-instance:

```javascript
const makeCounter = defineExoClass(
  'Counter',
  CounterI,
  (initial) => ({ count: initial }),  // state for this instance
  {
    increment() {
      this.state.count += 1;  // each instance has separate state
      return this.state.count;
    }
  }
);
```

### defineExoClassKit

`this.state` is shared across all facets:

```javascript
const makeKit = defineExoClassKit(
  'Kit',
  { facet1: I1, facet2: I2 },
  () => ({ sharedData: [] }),  // shared by both facets
  {
    facet1: {
      add(item) {
        this.state.sharedData.push(item);  // modifies shared state
      }
    },
    facet2: {
      getAll() {
        return this.state.sharedData;  // reads shared state
      }
    }
  }
);
```

## Introspection with `GET_INTERFACE_GUARD`

Every exo with an InterfaceGuard has a meta-method to retrieve its interface at
runtime:

```javascript
import { GET_INTERFACE_GUARD } from '@endo/exo';
import { getInterfaceMethodKeys } from '@endo/patterns';

const counter = makeCounter();

// Get the interface guard (works with E() too)
const interfaceGuard = await E(counter)[GET_INTERFACE_GUARD]();

// Inspect available methods
const methodNames = getInterfaceMethodKeys(interfaceGuard);
console.log(methodNames);  // ['increment', 'getValue']

// Build dynamic clients, generate documentation, etc.
```

This enables:
- Runtime interface discovery
- Dynamic client generation
- Documentation generation
- Protocol negotiation

**Note:** The interface can change across vat upgrades, so clients caching it
may become stale.

## Virtual and Durable Exos

This package provides **heap-based exos** that don't survive vat termination.
For production systems with high cardinality or upgrade requirements, see:

- **[@agoric/vat-data](https://github.com/Agoric/agoric-sdk/tree/master/packages/vat-data)** -
  Provides:
  - `defineVirtualExoClass` - Backed by virtual object storage (pageable)
  - `defineDurableExoClass` - Survives vat upgrades
  - `prepareExoClass` - Unified API for both
  - `prepareExoClassKit` - Durable/virtual kits

- **[Exo Taxonomy](./docs/exo-taxonomy.md)** - Complete reference of all exo
  creation patterns including virtual and durable variants

The heap exos in this package are ideal for:
- Development and testing
- Low cardinality objects (< thousands)
- Temporary session state
- Non-critical services

## Integration with Endo Packages

- **Foundation**: [@endo/pass-style](../pass-style/README.md) - Remotables
  created with `Far()`
- **Validation**: [@endo/patterns](../patterns/README.md) - InterfaceGuards and
  M namespace
- **Communication**: [@endo/eventual-send](../eventual-send/README.md) - Call
  exos with `E()`

**Complete Tutorial**: See [Message Passing](../../docs/message-passing.md) for
a comprehensive guide showing how exos work with pass-style, patterns, and
eventual-send to enable safe distributed computing.

## See Also

- [Exo Taxonomy](./docs/exo-taxonomy.md) - Complete API reference and
  make/define/prepare patterns

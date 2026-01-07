---
title: message-passing
group: Documents
category: Guides
---

# Message Passing

## Introduction

Building distributed object-capability systems requires solving a fundamental
challenge: how do objects in different isolated compartments or machines
communicate safely and asynchronously?
The Endo stack provides a layered solution through four interconnected
packages:

- **@endo/pass-style** - Defines what data can cross boundaries
- **@endo/patterns** - Describes and validates expected data shapes
- **@endo/exo** - Creates defensive objects that validate inputs
- **@endo/eventual-send** - Enables asynchronous message passing

Together, these packages implement safe message passing: the ability to send
messages to objects that will receive and process them, with strong safety
guarantees at every step.

This guide presents a natural progression: from data (what can be passed?)
through validation (is it well-formed?) to objects (how do we receive safely?)
and finally communication (how do we pass messages?).
Each concept builds on the previous one, culminating in a complete example
showing all four packages working together.

### Prerequisites

This guide assumes familiarity with:
- [Hardened JavaScript](./guide.md) and the `lockdown()` function
- Object capabilities and the principle of least authority
- Promises and asynchronous JavaScript

## Foundation: What Can Be Passed?

Before we can send messages between isolated compartments, we need to
understand what data can safely cross boundaries.
The **@endo/pass-style** package defines the `Passable` type and classifies
values according to their `PassStyle`.

**What is a vat?**
Throughout this guide, we use the term **vat** to refer to an isolated unit of
computation—an idealization of a worker, in the same sense as a Turing Machine
as an idealization of computation.
A vat has its own heap, stack, and event queue.
It communicates with other vats exclusively through asynchronous message
passing, with no shared memory concurrency.
Events run serially to completion: each event begins with an empty stack and a
guarantee that no other code that shares mutable state will be interleaved
during its execution.
This model achieves parallelism through multiple vats and achieves performance
by transferring ownership of memory (such as ArrayBuffers) between vats when
necessary.
Otherwise, this model abandons some opportunities to improve performance and,
in exchange, obviates any possiblity of deadlock, even in composition of many,
independently designed compoennts, utterly unaware of each other's
synchronization models.
This is the linchpin of fearless cooperation among components in a
loosely-coordinated, distributed, multi-agent system, which is to say, any
system at sufficient scale.

### The Pass Styles Taxonomy

Every passable value falls into one of eight categories:

| Pass Style | Description | Examples |
|------------|-------------|----------|
| `'null'` | The null value | `null` |
| `'undefined'` | The undefined value | `undefined` |
| `'boolean'` | Boolean primitives | `true`, `false` |
| `'number'` | IEEE 754 floats | `42`, `3.14`, `NaN`, `Infinity` |
| `'bigint'` | Arbitrary integers | `123n`, `-456n` |
| `'string'` | Well-formed strings | `'hello'`, `''` |
| `'symbol'` | Registered/well-known symbols | `Symbol.iterator` |
| `'copyArray'` | Frozen arrays of passables | `harden([1, 2, 3])` |
| `'copyRecord'` | Frozen plain objects | `harden({ x: 10 })` |
| `'remotable'` | Far objects & presences | `Far('Counter', {...})` |
| `'tagged'` | Extension point for domain types | `makeTagged('copySet', [...])` |
| `'error'` | Error objects | `harden(Error('failed'))` |
| `'promise'` | Promise objects | `Promise.resolve(42)` |

The key distinction is between **pass-by-copy** (the value itself is copied)
and **pass-by-reference**:

- **Pass-by-copy**: Primitives, copyArray, copyRecord, tagged.
- **Pass-by-reference**: Remotables, promises

### Core Functions

The `@endo/pass-style` package provides core functions for inspecting
the pass-style of a value.

```javascript
import { passStyleOf, isPassable, Far, makeTagged, passableSymbolForName } from '@endo/pass-style';

// Classify a value's pass style
passStyleOf(42);  // 'number'
passStyleOf(harden([1, 2]));  // 'copyArray'
passStyleOf(Promise.resolve());  // 'promise'

// Check if a value is passable
isPassable({ x: 1 });  // false (not frozen)
isPassable(harden({ x: 1 }));  // true

// Create passable symbols
const mySymbol = passableSymbolForName('mySymbol');
passStyleOf(mySymbol);  // 'symbol'
```

It also provides a `Far` utility function for making "remotables", values that
can receive messages, which we use in this example to demonstrate
`passStyleOf`, but note that it provides no protection against invalid argument
patterns, which we will remedy with `makeExo` and type guards farther along.

```javascript
// Create a remotable object
const counter = Far('Counter', {
  increment(n) { return n + 1; },
  getValue() { return 42; }
});
passStyleOf(counter);  // 'remotable'
```

### What Makes Something Passable?

A value is passable if it meets these requirements:

1. **Primitives** are always passable
2. **Objects must be transitively frozen** via `harden()`
3. **No cyclic references** in pass-by-copy structures
4. **Strings and symbol names must be well-formed Unicode text** (no unpaired
   surrogates)
5. **Symbols must tentatively be created using `passableSymbolForName()`** from
   `@endo/pass-style`.

```javascript
// This is passable - frozen array of primitives
const data = harden([1, 2, 3]);

// This is NOT passable - not frozen
const mutable = [1, 2, 3];
passStyleOf(mutable);  // throws Error

// This is NOT passable - cyclic reference
const cyclic = harden([]);
cyclic.push(cyclic);
passStyleOf(cyclic);  // throws Error
```

### Creating Remotable Objects

The `Far()` function creates remotable objects that can be passed by reference:

```javascript
import { Far } from '@endo/pass-style';

const makeCounter = (initialValue = 0) => {
  let count = initialValue;

  return Far('Counter', {
    increment() {
      count += 1;
      return count;
    },
    getValue() {
      return count;
    }
  });
};

const counter = makeCounter(5);
// This counter is a remotable - it can be passed as a reference
// but its internal state (count) remains private
```

**Key Insight**: Far objects provide encapsulation and can be passed across
boundaries, but they don't validate their inputs.
If `increment()` expects a number but receives a string, it won't detect the
error until the method executes.
This is where patterns come in.

## Validation: Describing What You Accept

Now we can pass objects between vats, but how do we ensure received data is
well-formed?
The **@endo/patterns** package provides pattern matching to validate passable
data and describe behavioral contracts.

### The M Namespace

The `M` namespace offers matchers for all pass styles:

```javascript
import { M, matches, mustMatch } from '@endo/patterns';

// Primitive matchers
M.any();         // Matches any passable
M.number();      // Matches any number
M.string();      // Matches any string
M.boolean();     // Matches any boolean

// Constrained matchers
M.gte(0);        // Matches numbers >= 0
M.string({ maxSize: 100 });  // Matches strings up to 100 chars
M.nat();         // Matches non-negative bigints

// Container matchers
M.array();       // Matches any copyArray
M.record();      // Matches any copyRecord
M.arrayOf(M.number());  // Matches arrays of numbers only
M.recordOf(M.string(), M.number());  // Matches {string: number} records

// Logical operators
M.and(M.number(), M.gte(0));  // Matches non-negative numbers
M.or(M.string(), M.number());  // Matches strings or numbers
M.opt(M.string());  // Matches undefined or string (optional)
```

### Pattern Matching in Practice

The `matches()` function tests if a value matches a pattern:

```javascript
import { M, matches, mustMatch } from '@endo/patterns';

const pattern = M.and(M.number(), M.gte(0), M.lte(100));

matches(50, pattern);    // true
matches(-10, pattern);   // false
matches('50', pattern);  // false

// mustMatch() throws with a descriptive error
mustMatch(42, M.string());
// throws: "number 42 - Must be a string"
```

### Structured Pattern Matching

For more complex validation, `M.splitRecord()` allows you to specify required
properties, optional properties, and a pattern for any remaining properties:

```javascript
import { M, mustMatch } from '@endo/patterns';

// Define a pattern with required and optional properties
const UserPattern = M.splitRecord(
  { name: M.string() },                     // required properties
  { age: M.number(), email: M.string() },   // optional properties
  M.string()                                 // rest properties must be strings
);

// Valid: has required 'name'
const user1 = harden({ name: 'Alice' });
mustMatch(user1, UserPattern);  // passes

// Valid: has required and optional properties
const user2 = harden({ name: 'Bob', age: 30 });
mustMatch(user2, UserPattern);  // passes

// Valid: has required, optional, and extra properties
const user3 = harden({ name: 'Carol', age: 25, bio: 'Engineer' });
mustMatch(user3, UserPattern);  // passes (bio matches rest pattern)

// Invalid: missing required 'name'
const user4 = harden({ age: 30 });
mustMatch(user4, UserPattern);  // throws: missing required property 'name'

// Invalid: rest property is not a string
const user5 = harden({ name: 'Dave', score: 100 });
mustMatch(user5, UserPattern);  // throws: rest property 'score' must be string
```

This pattern is particularly useful for validating configuration objects,
method arguments, and data structures where you want to enforce required fields
while allowing optional extensions.

### Copy Collections

Patterns introduces three passable collection types built on `makeTagged()`:

#### CopySet

A set of unique Keys (primitives or remotables):

```javascript
import { makeCopySet } from '@endo/patterns';

const colors = makeCopySet(['red', 'blue', 'green']);
// Elements are sorted and deduplicated
// Can contain strings, numbers, remotables, etc.

// Pattern for sets
const ColorSet = M.setOf(M.string());
mustMatch(colors, ColorSet);  // passes
```

#### CopyBag

A multiset (elements with counts):

```javascript
import { makeCopyBag } from '@endo/patterns';

const inventory = makeCopyBag([
  ['apples', 5n],
  ['oranges', 3n]
]);

const InventoryPattern = M.bagOf(M.string(), M.bigint());
mustMatch(inventory, InventoryPattern);
```

#### CopyMap

A map from Keys to passable values:

```javascript
import { makeCopyMap } from '@endo/patterns';

// Map user IDs to balances
const balances = makeCopyMap([
  ['alice', 100],
  ['bob', 50]
]);

const BalancesPattern = M.mapOf(M.string(), M.number());
mustMatch(balances, BalancesPattern);
```

**Why not use plain objects or arrays?**
CopyMap/CopySet/CopyBag support efficient key comparison using `compareKeys()`,
enable partial ordering for subset relationships, and are explicitly designed
as passable data structures.

### Interface Guards: The Bridge to Exo

Patterns can also describe behavioral contracts through `InterfaceGuards`:

```javascript
import { M } from '@endo/patterns';

const CounterI = M.interface('Counter', {
  // Method signature: call with number, returns number
  increment: M.call(M.number()).returns(M.number()),

  // Method with no arguments
  getValue: M.call().returns(M.number()),

  // Method with optional arguments
  reset: M.call().optional(M.number()).returns()
});
```

This describes a contract: the Counter interface has three methods with
specific argument and return types.
But how do we enforce this contract automatically?

**Key Insight**: Patterns describe what we expect, but don't enforce it by
themselves.
We need a way to wrap objects so they validate inputs against patterns before
executing methods.
Enter **exo**.

## Defensive Receive: Protected Objects

**Exos** introduce interface guards for remotable objects.
At this point, you should forget about the `Far` stepping-stone and always
immediately reach or exos.
The **@endo/exo** package turns defensive programming from a manual discipline
into an automatic guarantee.

### The Exo Concept

An exo is a remotable object protected by an InterfaceGuard.
When a method is called, the guard validates arguments against their patterns
before the method executes:

```javascript
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

const CounterI = M.interface('Counter', {
  increment: M.call(M.number()).returns(M.number())
});

let count = 0;

const counter = makeExo('Counter', CounterI, {
  increment(n) {
    // By the time we reach here, n is guaranteed to be a number
    count += n;
    return count;
  }
});

// Valid call
counter.increment(5);  // returns 5

// Invalid call - caught by guard
counter.increment('5');
// throws: "(Counter).increment(string \"5\") - Must be a number"
```

The guard provides the first layer of defense against malformed and malicious
input.
Your method implementation can focus on business logic, not type-checking.

### Three Patterns for Creating Exos

Exo provides three patterns depending on your needs:

#### Pattern 1: makeExo (Single Instance)

Use when you need one instance with no state management:

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
```

#### Pattern 2: defineExoClass (Multiple Instances with State)

Use when you need multiple instances, each with their own state:

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

  // init function: creates initial state
  (initialValue = 0) => ({ count: initialValue }),

  // methods: have access to this.state and this.self
  {
    increment(delta = 1) {
      const { state } = this;
      state.count += delta;
      return state.count;
    },
    getValue() {
      return this.state.count;
    }
  }
);

const counter1 = makeCounter(0);
const counter2 = makeCounter(100);

counter1.increment();  // 1
counter2.increment();  // 101
```

#### Pattern 3: defineExoClassKit (Multiple Facets with Shared State)

Use when you need multiple related objects (facets) sharing the same state.
This is the cornerstone of the principle of least authority: give each client
only the facet they need.

```javascript
import { defineExoClassKit } from '@endo/exo';
import { M } from '@endo/patterns';

const CounterI = {
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
  CounterI,

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

// Give clients only the facets they need
// incrementer only gets `up`, decrementer only gets `down`
// but both affect the same shared state
up.increment(10);    // 60
down.decrement(5);   // 55
reader.getValue();   // 55
```

### Async Methods with M.callWhen()

For methods that await promises, use `M.callWhen()` to mark them as
asynchronous:

```javascript
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';

const FetcherI = M.interface('Fetcher', {
  // Async method: awaits the url argument, returns promise
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
3. Then calls the method with the resolved value

### State Management

Each exo pattern handles state differently:

- **makeExo**: No state management (uses closure variables)
- **defineExoClass**: `this.state` is per-instance, `this.self` is the exo
  itself
- **defineExoClassKit**: `this.state` shared across facets, `this.facets`
  contains all facets

```javascript
const makeWallet = defineExoClass(
  'Wallet',
  WalletI,
  (initialBalance) => ({ balance: initialBalance }),
  {
    deposit(amount) {
      // Access state
      this.state.balance += amount;

      // Return self for chaining
      return this.self;
    },
    withdraw(amount) {
      if (amount > this.state.balance) {
        throw Error('Insufficient funds');
      }
      this.state.balance -= amount;
      return amount;
    }
  }
);
```

### Introspection with GET_INTERFACE_GUARD

Every exo has a special meta-method to retrieve its interface:

```javascript
import { GET_INTERFACE_GUARD } from '@endo/exo';
import { getInterfaceMethodKeys } from '@endo/patterns';

const counter = makeCounter();

// Get the interface guard
const guard = counter[GET_INTERFACE_GUARD]();

// Inspect available methods
const methods = getInterfaceMethodKeys(guard);
console.log(methods);  // ['increment', 'getValue']
```

This enables runtime introspection and dynamic client generation.

**Key Insight**: Exos provide safe "receive" semantics - when messages arrive
at an exo, the InterfaceGuard validates inputs before execution.
But we still need a uniform way to send messages, whether the exo is local or
remote.
That's where eventual-send comes in.

## Eventual Send: Async Messaging

The **@endo/eventual-send** package provides the `E()` proxy for asynchronous
message passing.
Whether an object is in the same vat, a different vat, or across a network,
`E()` provides a uniform API that always returns promises.

### The E Proxy

The `E()` function creates a proxy that intercepts method calls and property
access:

```javascript
import { E } from '@endo/eventual-send';

// Local exo object
const counter = makeCounter(0);

// Eventual send: invoke method, get promise
const resultP = E(counter).increment(5);

// resultP is a promise, even though counter is local
const result = await resultP;  // 5
```

Even for local objects, `E()` introduces asynchrony by deferring the method
call to the next turn of the event loop.
This provides:
- **Consistent async behavior** whether local or remote
- **Message ordering** per target object
- **Turn-based execution** for better reasoning about concurrency

### The Four Operations

#### E(target).method(...args)

Eventual send: invoke a method, returning a promise for the result.

```javascript
const counter = makeCounter(10);

// Send message, get promise
const result = await E(counter).increment(5);
console.log(result);  // 15

// Works even if counter is a promise
const counterP = Promise.resolve(counter);
const result2 = await E(counterP).increment(3);  // 18
```

#### E.get(target).property

Eventual get: retrieve a property, returning a promise for its value.

```javascript
const config = harden({
  timeout: 5000,
  retries: 3
});

const timeoutP = E.get(config).timeout;
const timeout = await timeoutP;  // 5000
```

#### E.sendOnly(target).method(...args)

Fire-and-forget: send message without waiting for result.
Returns `undefined` immediately, providing an optimization when you don't need
the result.

```javascript
const logger = makeLogger();

// Send log message, don't wait for result
E.sendOnly(logger).log('Event occurred');
// Returns immediately, logging happens eventually
```

#### E.when(promiseOrValue, onFulfilled, onRejected)

Shorthand for promise handling with turn tracking:

```javascript
E.when(
  E(counter).getValue(),
  value => console.log('Value:', value),
  error => console.error('Error:', error)
);
```

### Promise Pipelining

One of the most powerful features of eventual-send is **promise pipelining**:
the ability to send messages to promises before they resolve.

```javascript
import { E } from '@endo/eventual-send';

// mintP is a promise for a mint
const mintP = E(bootstrap).getMint();

// We can send messages to mintP immediately
// Don't need to await it first!
const purseP = E(mintP).makePurse();

// Chain more messages
const balanceP = E(purseP).getBalance();

// All messages are sent immediately
// They execute in order when each promise resolves
const balance = await balanceP;
```

Without pipelining, you'd need to await each step:

```javascript
// Without pipelining: 3 round trips
const mint = await bootstrap.getMint();     // wait
const purse = await mint.makePurse();       // wait
const balance = await purse.getBalance();   // wait

// With pipelining: messages sent immediately
const balance = await E(E(E(bootstrap).getMint()).makePurse()).getBalance();
// Only wait at the end
```

This can dramatically reduce latency in distributed systems.

### Why Eventual Send?

Eventual send provides four key benefits:

1. **Uniform API**: Same code works whether target is local or remote
2. **Message Ordering**: Messages to the same target execute in send order
3. **Pipeline Optimization**: Reduce round trips in distributed systems
4. **Future-Proof**: Local code works when migrated to distributed setup

```javascript
// This code works unchanged whether counter is:
// - A local exo object
// - A local promise for an exo
// - A remote presence in another vat
// - A remote presence on another machine
const result = await E(counter).increment(5);
```

### E() with Exos: A Perfect Match

Exos are the ideal targets for eventual send:

```javascript
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';

const CounterI = M.interface('Counter', {
  increment: M.call(M.number()).returns(M.number())
});

const counter = makeExo('Counter', CounterI, {
  increment(n) {
    return count += n;
  }
});

// E() provides async wrapper
const resultP = E(counter).increment(5);

// The InterfaceGuard validates n is a number
// Even if counter is remote, validation happens on receive
```

Even for local exos, using `E()` provides benefits:
- **Consistent async behavior** in your codebase
- **Turn-based execution** prevents reentrancy bugs
- **Error isolation** via promise rejection
- **Future-proof** code that works when distributed

**Key Insight**: We now have all the pieces: passable data (pass-style),
validation (patterns), defensive objects (exo), and async communication
(eventual-send).
Let's put them all together in a complete example.

## Putting It All Together: Digital Purse Example

Let's build a complete capability-based payment system that demonstrates all
four packages working together.
We'll create a mint that can create purses, which can create payments.
This pattern is fundamental to digital assets in capability systems.

### The Design

Our system will have three facets:
- **Mint facet**: Can create new purses (privileged operation)
- **Purse facet**: Holds a balance, can deposit and withdraw
- **Payment facet**: Single-use payment that can be deposited once

All three facets share the same underlying state, but expose different
authority levels.

### Complete Implementation

```javascript
import { M } from '@endo/patterns';
import { defineExoClassKit, defineExoClass } from '@endo/exo';
import { E } from '@endo/eventual-send';

// Step 1: Define interfaces (patterns)

const MintI = M.interface('Mint', {
  makePurse: M.call().returns(M.remotable('Purse'))
});

const PurseI = M.interface('Purse', {
  getBalance: M.call().returns(M.number()),
  deposit: M.callWhen(
    M.and(M.number(), M.gte(0)),
    M.remotable('Payment')
  ).returns(),
  withdraw: M.call(M.and(M.number(), M.gte(0))).returns(M.remotable('Payment'))
});

const PaymentI = M.interface('Payment', {
  getBalance: M.call().returns(M.number())
});

// Step 2: Define the Mint/Purse Kit

const makeMintKit = defineExoClassKit(
  'Mint',
  { mint: MintI, purse: PurseI },

  // init: each purse starts with 0 balance
  () => ({ balance: 0 }),

  {
    mint: {
      makePurse() {
        // Return the purse facet, not the mint facet
        // This ensures the holder of a purse can't mint
        return this.facets.purse;
      }
    },

    purse: {
      getBalance() {
        return this.state.balance;
      },

      async deposit(amount, payment) {
        // amount is validated as non-negative number by guard
        // payment is validated as remotable by guard

        // Get payment's balance (eventual send)
        const paymentBalance = await E(payment).getBalance();

        // Verify amount matches
        if (paymentBalance !== amount) {
          throw Error('Payment balance mismatch');
        }

        // Add to our balance
        this.state.balance += amount;
      },

      withdraw(amount) {
        // amount is validated as non-negative by guard

        if (amount > this.state.balance) {
          throw Error('Insufficient balance');
        }

        // Deduct from balance
        this.state.balance -= amount;

        // Create a new payment
        return makePayment(amount);
      }
    }
  }
);

// Step 3: Define single-use Payment

const makePayment = defineExoClass(
  'Payment',
  PaymentI,

  // init: payment created with specific amount
  (amount) => ({ balance: amount, spent: false }),

  {
    getBalance() {
      // Once spent, balance becomes 0
      if (this.state.spent) {
        return 0;
      }

      // Mark as spent (single-use)
      this.state.spent = true;
      return this.state.balance;
    }
  }
);

// Step 4: Usage across vat boundaries

// Create a mint (privileged)
const { mint, purse: ourPurse } = makeMintKit();

// Give someone else a purse (they can't mint!)
const alicePurse = E(mint).makePurse();
const bobPurse = E(mint).makePurse();

// Manually increase our purse (in real system, this would be privileged)
ourPurse.state.balance = 1000;

// Create a payment and send to Alice
const payment100 = E(ourPurse).withdraw(100);
await E(alicePurse).deposit(100, payment100);

// Alice can now send to Bob
const payment50 = E(alicePurse).withdraw(50);
await E(bobPurse).deposit(50, payment50);

// Check balances (all eventual sends)
const ourBalance = await E(ourPurse).getBalance();     // 900
const aliceBalance = await E(alicePurse).getBalance(); // 50
const bobBalance = await E(bobPurse).getBalance();     // 50

// Try to reuse a payment (fails - single use)
const payment = E(alicePurse).withdraw(10);
await E(bobPurse).deposit(10, payment);  // succeeds
await E(ourPurse).deposit(10, payment);  // fails - balance is 0
```

### What's Happening Here

Let's trace the flow when Alice sends money to Bob:

1. **Pass-style**: The amount (`50`) is passable as a number.
   The payment is passable as a remotable.

2. **Patterns**: When `withdraw(50)` is called:
   - The guard validates `50` matches `M.and(M.number(), M.gte(0))`
   - Negative amounts and non-numbers are rejected

3. **Exo**: The purse exo:
   - Automatically validates all inputs via InterfaceGuard
   - Encapsulates state (`balance`) that can't be directly accessed
   - Provides different facets (mint vs purse) for least authority

4. **Eventual-send**: All method calls use `E()`:
   - Works the same whether purses are local or remote
   - Provides promise pipelining to reduce round trips
   - Maintains message ordering per target

### Key Patterns Demonstrated

**Least Authority via Facets**: The mint holder has full power to create
purses, but purse holders can only deposit/withdraw, not mint new purses.

**Single-use Payments**: The payment's `getBalance()` method uses the `spent`
flag to ensure it can only be deposited once.
This prevents double-spending.

**Async Validation**: The `deposit()` method uses `M.callWhen()` because it
needs to await `E(payment).getBalance()`.
The guard validates the types, then the method validates business logic.

**Defense in Depth**: Multiple layers of protection:
- InterfaceGuards reject malformed calls
- State encapsulation prevents direct manipulation
- Business logic validates invariants (sufficient balance, etc.)

**Uniform Communication**: The same code works whether Alice and Bob are:
- In the same vat
- In different vats on the same machine
- On different machines across a network

## Design Patterns and Best Practices

Now that we've seen the full stack in action, let's discuss patterns for
structuring your distributed objects.

### When to Use Each Exo Pattern

**Use `makeExo` when:**
- You need a single instance
- State is managed in closure variables
- Simple use cases without complex lifecycle

```javascript
// Good use case: stateless utility
const validator = makeExo('Validator', ValidatorI, {
  validate(data) {
    return checkRules(data);
  }
});
```

**Use `defineExoClass` when:**
- You need multiple independent instances
- Each instance has its own state

```javascript
// Good use case: user sessions
const makeSession = defineExoClass(
  'Session',
  SessionI,
  (userId) => ({ userId, startTime: Date.now() }),
  { /* methods */ }
);
```

**Use `defineExoClassKit` when:**
- You need multiple facets with shared state
- Implementing least authority (different clients get different facets)
- State needs to be synchronized across related objects

```javascript
// Good use case: admin vs user interfaces
const makeService = defineExoClassKit(
  'Service',
  { admin: AdminI, user: UserI },
  () => ({ data: [] }),
  {
    admin: { reset() { this.state.data = []; } },
    user: { getData() { return this.state.data; } }
  }
);
```

### Copyable Data vs Remotable Objects

**Choose copyable (pass-by-copy) for:**
- Immutable data (configurations, messages, values)
- Small data structures (arrays, records)
- Data that will be stored or compared

```javascript
// Copyable: configuration object
const config = harden({
  timeout: 5000,
  retries: 3,
  endpoints: ['api.example.com']
});

// Copyable: message/event
const event = harden({
  type: 'transfer',
  from: 'alice',
  to: 'bob',
  amount: 100,
  timestamp: Date.now()
});
```

**Choose remotable (pass-by-presence) for:**
- Objects with behavior (methods)
- Objects with mutable state
- Objects representing capabilities/authority
- Large objects (passing reference is cheaper)

```javascript
// Remotable: service with methods
const database = Far('Database', {
  query: (sql) => { /* ... */ },
  insert: (record) => { /* ... */ }
});

// Remotable: capability
const fileHandle = Far('FileHandle', {
  read: () => { /* ... */ },
  write: (data) => { /* ... */ }
});
```

### Error Handling Across Vat Boundaries

Errors thrown in exo methods are automatically converted to passable form
before crossing vat boundaries:

```javascript
const service = makeExo('Service', ServiceI, {
  doOperation(input) {
    if (!isValid(input)) {
      // This error will be made passable automatically
      throw Error('Invalid input');
    }
    return result;
  }
});

// Caller in different vat
try {
  await E(service).doOperation(badInput);
} catch (err) {
  // err is a passable error
  console.error(err.message);  // 'Invalid input'
}
```

**Best practices:**
- Throw `Error` objects (they're automatically made passable)
- Don't throw non-passable values
- Use error messages, and properties, but avoid entraining capabilities: errors
  with capabilites are not passable.

### Testing Strategies

Use `E()` even in unit tests for consistency:

```javascript
import test from 'ava';
import { E } from '@endo/eventual-send';

test('counter increments correctly', async t => {
  const counter = makeCounter(0);

  // Use E() even though counter is local
  const result = await E(counter).increment(5);

  t.is(result, 5);
});
```

This ensures:
- Tests mirror production code
- Async behavior is tested
- Easy to mock remote objects

For testing remote scenarios, create mock presences:

```javascript
const mockRemoteService = Far('MockService', {
  async getData() {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return testData;
  }
});
```

## Common Pitfalls

### Forgetting M.callWhen() for Async Methods

**Problem:**
```javascript
const FetcherI = M.interface('Fetcher', {
  // Wrong: M.call() for async method
  fetch: M.call(M.string()).returns(M.string())
});

const fetcher = makeExo('Fetcher', FetcherI, {
  async fetch(url) {
    return await E(httpClient).get(url);  // Returns promise
  }
});
```

The return guard expects a string, but gets a promise!

**Solution:**
```javascript
const FetcherI = M.interface('Fetcher', {
  // Correct: M.callWhen() for async method
  fetch: M.callWhen(M.string()).returns(M.string())
});
```

Or if the method is truly synchronous, don't use `async`:

```javascript
const FetcherI = M.interface('Fetcher', {
  fetch: M.call(M.string()).returns(M.promise())  // Returns promise explicitly
});

const fetcher = makeExo('Fetcher', FetcherI, {
  fetch(url) {
    return E(httpClient).get(url);  // Return promise, don't await
  }
});
```

### Not All Remotables Are Exos

**Problem:**
```javascript
const obj = Far('MyObject', {
  doSomething(x) { /* ... */ }
});

// This works, but has no input validation
obj.doSomething('invalid');  // No guard to catch this
```

Far objects are remotable but don't validate inputs.

**Solution:**

Use `makeExo` when you need defensive behavior:
```javascript
const obj = makeExo('MyObject', MyObjectI, {
  doSomething(x) { /* ... */ }
});

// Now inputs are validated
obj.doSomething('invalid');  // throws if pattern doesn't match
```

### Promise Pipelining Limitations

**Problem:**

You can't pipeline to computed property names or conditional logic:

```javascript
// This doesn't pipeline correctly
const methodName = await E(obj).getMethodName();
const result = E(obj)[methodName]();  // Second call waits for first
```

**Solution:**

Design interfaces so common operations don't require computed dispatch:

```javascript
// Better: explicit methods
const result = await E(obj).doCommonOperation();
```

Or use a dispatch method:

```javascript
const result = await E(obj).dispatch(methodName, ...args);
```

### Mutating State in Copyable Data

**Problem:**
```javascript
const config = harden({ timeout: 5000 });
config.timeout = 10000;  // throws - object is frozen
```

Copyable data is frozen and can't be mutated.

**Solution:**

Create new data instead of mutating:

```javascript
const oldConfig = harden({ timeout: 5000 });
const newConfig = harden({ ...oldConfig, timeout: 10000 });
```

## Next Steps

You now understand the complete eventual send and receive stack.
Here are resources for going deeper:

### Package Documentation

For detailed API reference:
- [@endo/pass-style](../packages/pass-style/README.md) - Pass styles, Far,
  makeTagged
- [@endo/patterns](../packages/patterns/README.md) - M namespace, copy
  collections, guards
- [@endo/exo](../packages/exo/README.md) - makeExo, defineExoClass,
  defineExoClassKit
- [@endo/eventual-send](../packages/eventual-send/README.md) - E proxy,
  HandledPromise

### Advanced Topics

**CapTP**: For real network communication between machines, see
[@endo/captp](../packages/captp/README.md).
CapTP implements the Cap'n Proto protocol for capability-based RPC.

**Virtual and Durable Exos**: The exos in this guide are heap-based and don't
survive vat restarts.
For high cardinality or upgrade-survivable exos, see
[@agoric/vat-data](https://github.com/Agoric/agoric-sdk/tree/master/packages/vat-data)
which provides:
- `defineVirtualExoClass` - backed by virtual object storage
- `defineDurableExoClass` - survives vat upgrades
- `prepareExoClass` - unified API for both

**Marshal**: For details on how passables are serialized for transmission, see
[@endo/marshal](../packages/marshal/README.md).

**Stores**: For persistent collections of passables and remotables, see
[@agoric/store](https://github.com/Agoric/agoric-sdk/tree/master/packages/store).

### Design Resources

- [Object Capabilities](https://en.wikipedia.org/wiki/Object-capability_model)
- [Concurrency Among Strangers](http://www.erights.org/talks/thesis/) - Mark
  S. Miller's thesis
- [Cap'n Proto RPC Protocol](https://capnproto.org/rpc.html)
- [Agoric Documentation](https://docs.agoric.com/)

### Example Code

The [Agoric SDK](https://github.com/Agoric/agoric-sdk) contains numerous
examples of message passing patterns in production smart contracts.

---

This completes the tour of message passing in Endo.
These four packages form the foundation of safe distributed computing, enabling
you to build capability-based systems that work seamlessly from local function
calls to global network communications.

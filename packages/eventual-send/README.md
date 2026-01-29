# `@endo/eventual-send`

Eventual send: a uniform async messaging API for local and remote objects.

## Overview

The **@endo/eventual-send** package provides the `E()` proxy for asynchronous
message passing.
Whether an object is in the same vat, a different vat, or across a network,
`E()` provides a consistent API that always returns promises.

This enables:
- **Uniform communication**: Same code for local and remote objects
- **Promise pipelining**: Chain operations without waiting for resolution
- **Message ordering**: Preserve message order per target
- **Future-proof code**: Local code works when migrated to distributed systems

## Shim

Eventual send relies on an Endo environment.
Programs running in an existing Endo platform like an Agoric smart contract or
an Endo plugin do not need to do anything special to set up HardenedJS,
HandledPromise and related shims.
To construct an environment suitable for Eventual Send requires the
`HandledPromise` shim:

```js
import '@agoric/eventual-send/shim.js';
```

The shim ensures that every instance of Eventual Send can recognize every other
instance's handled promises.
This is how we mitigate, what we call, "eval twins".

## Importing

```javascript
import { E } from '@endo/eventual-send';
```

## Core API

### E(target).method(...args)

Eventual send: invoke a method, returning a promise for the result.

```javascript
import { E } from '@endo/eventual-send';

const counter = makeCounter(10);

// Send message, get promise
const resultP = E(counter).increment(5);
const result = await resultP;  // 15

// Works even if counter is a promise
const counterP = Promise.resolve(counter);
const result2 = await E(counterP).increment(3);  // 18
```

**Key property:** Works uniformly whether the target is:
- A local object
- A local promise for an object
- A remote presence in another vat
- A promise for a remote presence

All calls return promises, even for local objects, ensuring consistent async
behavior throughout your codebase.

### E.get(target).property

Eventual get: retrieve a property, returning a promise for its value.

```javascript
const config = harden({
  timeout: 5000,
  retries: 3
});

const timeoutP = E.get(config).timeout;
const timeout = await timeoutP;  // 5000
```

Useful for accessing properties on remote objects or promises.

### E.sendOnly(target).method(...args)

Fire-and-forget: send a message without waiting for or receiving the result.
Returns `undefined` immediately.

```javascript
const logger = makeLogger();

// Send log message, don't wait for result
E.sendOnly(logger).log('Event occurred');
// Continues immediately, logging happens eventually
```

**When to use:**
- Don't need the return value
- Want to optimize latency (no promise creation)
- Logging, notifications, fire-and-forget operations

**Note:** You won't get errors if the method fails.
Use regular `E()` if you need error handling.

### E.when(promiseOrValue, onFulfilled?, onRejected?)

Shorthand for promise handling with turn tracking:

```javascript
E.when(
  E(counter).getValue(),
  value => console.log('Value:', value),
  error => console.error('Error:', error)
);

// Equivalent to:
E(counter).getValue().then(
  value => console.log('Value:', value),
  error => console.error('Error:', error)
);
```

Primarily useful in contexts that need explicit turn tracking for debugging.

### E.resolve(value)

Convert a value to a handled promise:

```javascript
const promise = E.resolve(value);
// promise is a HandledPromise wrapping value
```

Usually not needed directly; `E()` handles this automatically.

## Promise Pipelining

One of the most powerful features is **promise pipelining**: the ability to
send messages to promises before they resolve.

```javascript
import { E } from '@endo/eventual-send';

// All of these send immediately - no waiting!
const mintP = E(bootstrap).getMint();
const purseP = E(mintP).makePurse();
const paymentP = E(purseP).withdraw(100);
await E(receiverPurse).deposit(100, paymentP);

// Only wait at the end for the final result
```

Without pipelining, you'd need to await each step:

```javascript
// Without pipelining: 4 round trips
const mint = await bootstrap.getMint();        // wait
const purse = await mint.makePurse();          // wait
const payment = await purse.withdraw(100);     // wait
await receiverPurse.deposit(100, payment);     // wait

// With pipelining: messages sent immediately, only wait at end
```

This can **dramatically reduce latency** in distributed systems by eliminating
round trips.

**How it works:**
- Messages to unresolved promises are queued
- When the promise resolves, queued messages are delivered in order
- Each message returns a new promise that resolves when the operation completes

## Why Eventual Send?

Eventual send provides four key benefits:

### 1. Uniform API

The same code works whether the target is local or remote:

```javascript
// This code works identically whether counter is:
// - A local object
// - In a different vat on the same machine
// - On a different machine across the network
const result = await E(counter).increment(5);
```

Write local code, deploy distributed, no changes needed.

### 2. Message Ordering

Messages to the same target are delivered and processed in send order:

```javascript
E(counter).increment(1);  // executed first
E(counter).increment(2);  // executed second
E(counter).increment(3);  // executed third
// Order is guaranteed
```

This simplifies reasoning about concurrency.

### 3. Pipeline Optimization

As shown above, eliminates round trips in distributed systems.

### 4. Future-Proof Code

Code written with `E()` works locally today and distributed tomorrow:

```javascript
// Works in development (local)
const result = await E(service).getData();

// Same code works in production (distributed)
// No changes needed when service moves to another vat/machine
```

## Integration with Exo

Exos (from [@endo/exo](../exo/README.md)) are the ideal targets for eventual
send:

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
- **Consistent async behavior** throughout your codebase
- **Turn-based execution** prevents reentrancy bugs
- **Error isolation** via promise rejection
- **Future-proof** code that works when distributed

## HandledPromise

Under the hood, `E()` uses `HandledPromise`, a Promise subclass that supports
handler-based dispatch:

```javascript
import { HandledPromise } from '@endo/eventual-send';

// HandledPromise extends native Promise
const hp = new HandledPromise((resolve, reject, resolveWithPresence) => {
  // Three ways to settle the promise
  resolve(value);           // Normal resolution
  reject(reason);           // Rejection
  resolveWithPresence(h);   // Resolve with a remote presence
}, handler);

// Handler intercepts operations
const handler = {
  get(target, prop) { /* ... */ },
  applyMethod(target, verb, args) { /* ... */ }
};
```

**Most users don't need to use HandledPromise directly.**
The `E()` proxy provides the ergonomic interface.

## Use in Tests

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

Benefits:
- Tests mirror production code
- Async behavior is tested
- Easy to mock remote objects
- Same code works for both local and remote targets

## Integration with Endo Packages

- **Foundation**: [@endo/pass-style](../pass-style/README.md) - What can be
  sent as arguments
- **Validation**: [@endo/patterns](../patterns/README.md) - Describe method
  signatures with InterfaceGuards
- **Defensive Objects**: [@endo/exo](../exo/README.md) - Exos are ideal targets
  for `E()`
- **Network Transport**: [@endo/captp](../captp/README.md) - Real network
  communication using CapTP

**Complete Tutorial**: See [Message Passing](../../docs/message-passing.md) for
a comprehensive guide showing how eventual-send works with pass-style, patterns,
and exo to enable safe distributed computing.

## Background

This package implements the
[ECMAScript eventual-send proposal](https://github.com/tc39/proposal-eventual-send),
which provides native language support for eventual send operations.

## See Also

- [ECMAScript eventual-send proposal](https://github.com/tc39/proposal-eventual-send)
- [Concurrency Among Strangers](http://www.erights.org/talks/thesis/) - Mark S.
  Miller's thesis on eventual send
- [@endo/captp](../captp/README.md) - Cap'n Proto RPC implementation for network
  transport

## License

[Apache-2.0](./LICENSE)

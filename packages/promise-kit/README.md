# promise-kit

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm](https://img.shields.io/npm/v/@endo/promise-kit.svg)](https://www.npmjs.com/package/@endo/promise-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/endojs/endo/actions)
[![Code Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen.svg)](./coverage)

The `@endo/promise-kit` package provides utilities for creating and managing promises with release semantics.

## Overview

This package serves as a "ponyfill" for `Promise.withResolvers` while ensuring that the resulting promises can pipeline messages through `@endo/eventual-send`.

## Features

- **`makePromiseKit()`** - Creates a Promise together with separate faculties of resolving and rejecting it.
- **`racePromises()`** - A non-leaky version of `Promise.race()` that prevents memory leaks.
- **`isPromise()`** - A type guard for checking if a value is a Promise instance.
- **Type Definitions** - Comprehensive TypeScript support for `PromiseKit`, `ERef`, and more.

## Installation

```bash
npm install @endo/promise-kit
```

or

```bash
yarn add @endo/promise-kit
```

## Usage

### Basic Promise Creation

```javascript
import { makePromiseKit } from '@endo/promise-kit';

const { promise, resolve, reject } = makePromiseKit();

setTimeout(() => {
  resolve('Success!');
}, 100);

console.log(await promise); // Output: Success!

// Or reject with an error
const { promise: errPromise, reject: errReject } = makePromiseKit();

setTimeout(() => {
  errReject(new Error('Something went wrong'));
}, 100);

try {
  await errPromise;
} catch (err) {
  console.error(err.message); // Output: Something went wrong
}
```

### Non-Leaky Race Promises

The `racePromises()` function provides a memory-safe version of `Promise.race()` that properly cleans up references once any promise settles.

```javascript
import { racePromises } from '@endo/promise-kit';

// Fast promise completes first
const fast = Promise.resolve('won');
const slow = new Promise(r => setTimeout(r, 2000, 'lost'));

// 'won' wins, and 'slow' is cleaned up
const result = await racePromises([fast, slow]);

console.log(result); // Output: won
```

This prevents memory leaks when racing with long-running or indefinite promises:

```javascript
import { racePromises } from '@endo/promise-kit';

// Indefinite promise that will never resolve
const indefinite = new Promise(() => {});

// Even though 'faster' wins, 'indefinite' is cleaned up
const faster = Promise.resolve('done');
const result = await racePromises([faster, indefinite]);

console.log(result); // Output: done

// 'indefinite' reference is cleaned up (leak-free)
```

### Type Guard

Check if a value is a Promise:

```javascript
import { isPromise } from '@endo/promise-kit';

console.log(isPromise(Promise.resolve())); // true
console.log(isPromise('string'));         // false
console.log(isPromise(null));             // false
```

### Event Driven Pattern

Create promises that resolve based on events:

```javascript
import { makePromiseKit } from '@endo/promise-kit';

function waitForEvent(eventName, initialValue = null) {
  const { promise, resolve } = makePromiseKit();

  const handler = (data) => {
    resolve(data);
    removeListener();
  };

  const removeListener = addEventListener(eventName, handler);

  return promise;
}

// Usage: wait for 'data' event
const data = await waitForEvent('data');
console.log(data);
```

## API Reference

### makePromiseKit()

Creates a Promise object together with separate faculties for resolving and rejecting it.

**Signature:**
```typescript
function makePromiseKit(): PromiseKit
```

**Returns:**
An object containing:
- `promise: Promise<any>` - The promise instance itself
- `resolve: (value: any) => void` - Function to resolve the promise
- `reject: (reason?: any) => void` - Function to reject the promise

**Example:**
```javascript
const { promise, resolve, reject } = makePromiseKit();
```

### racePromises()

A non-leaky version of `Promise.race()` that cleans up references on settlements.

**Signature:**
```typescript
function racePromises<T = unknown>(values: Iterable<PromiseLike<T>>): Promise<T>
```

**Returns:**
A promise that resolves or rejects when the first promise in the iterable settles.

**Example:**
```javascript
const result = await racePromises([fast, slow]);
```

### isPromise()

Type guard to check if a value is a Promise.

**Signature:**
```typescript
function isPromise(value: unknown): value is Promise<unknown>
```

### Types

#### PromiseKit<T>

A promise together with separate resolve/reject functions:

```typescript
interface PromiseKit<T = unknown> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}
```

#### ERef<T>

A reference to a value that can be a plain value or a Promise-like value:

```typescript
type ERef<T> = T | PromiseLike<T>;
```

## Migration from Other Packages

### Promise.withResolvers()

If you're using `Promise.withResolvers()` from ES2023+, you can continue using `makePromiseKit()`:

```javascript
// ES2023+
const { promise, resolve, reject } = Promise.withResolvers();

// @endo/promise-kit
const { promise, resolve, reject } = makePromiseKit();
```

### Old Package Names

If you're migrating from older versions:

| Old Package | New Package |
|------------|------------|
| `@agoric/promise-kit` | `@endo/promise-kit` |
| `@agoric/make-promise` | `@endo/promise-kit` |
| `@agoric/produce-promise` | `@endo/promise-kit` |

## Examples

### Promise Chaining

```javascript
import { makePromiseKit } from '@endo/promise-kit';

const { promise: upstream } = makePromiseKit();

setTimeout(() => {
  upstream.resolve(1);
}, 10);

upstream.then(value => {
  console.log(value); // 1
  return { double: value * 2 };
})
.then(({ double }) => {
  console.log(double); // 2
});
```

### Error Handling

```javascript
import { makePromiseKit } from '@endo/promise-kit';

function getTimeoutPromise(timeoutMs, errorMessage) {
  const { promise, reject } = makePromiseKit();

  setTimeout(() => {
    reject(new Error(errorMessage));
  }, timeoutMs);

  return promise;
}

try {
  await getTimeoutPromise(100, 'Operation timed out');
} catch (err) {
  console.error(err.message); // "Operation timed out"
}
```

### Promisification

```javascript
import { makePromiseKit } from '@endo/promise-kit';

function promisify(callback) {
  return new Promise((resolve, reject) => {
    callback(error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

// Usage
promisify(err => {
  if (err) {
    err('Something went wrong');
  } else {
    console.log('Success!');
  }
});
```

## Browser Support

`@endo/promise-kit` requires a modern browser that supports:
- ES6 modules (`import/export`)
- Promises
- WeakMap
- FinalizationRegistry (for `racePromises()`)

Compatible with:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

For older browsers, use a bundler with polyfills.

## Testing

Run the tests:

```bash
npm test
```

Run with coverage:

```bash
npm run coverage
```

## License

Apache-2.0 - See LICENSE file for details.

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for details.

## Links

- [GitHub Repository](https://github.com/endojs/endo/tree/master/packages/promise-kit)
- [TypeScript Definitions](./types/)
- [Change Log](./CHANGELOG.md)
- [NPM Package](https://www.npmjs.com/package/@endo/promise-kit)
- [Endo Documentation](https://docs.endo.dev)
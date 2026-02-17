# `@endo/memoize`

Safe function memoization for Hardened JavaScript.

## Overview

This package provides a `memoize` function that creates a memoizing wrapper
around a one-argument function.
The wrapper caches results in a `WeakMap`, so arguments must be valid
WeakMap keys (objects, symbols, etc.).

The returned memoized function is hardened, making it safe to use in
Hardened JavaScript environments.

This package is a component of SES and is subject to the same security
scrutiny.
Any bug that compromises the safety properties of `memoize` should be reported
as a security issue to the [SES security policy](../ses/SECURITY.md).

## Usage

```js
import { memoize } from '@endo/memoize';

const expensiveComputation = obj => {
  // ... some costly operation
  return result;
};

const memoizedComputation = memoize(expensiveComputation);

const arg = harden({ data: 'example' });

// First call invokes expensiveComputation
const result1 = memoizedComputation(arg);

// Second call returns cached result without invoking the function
const result2 = memoizedComputation(arg);

result1 === result2; // true
```

## Behavior

- **Caching**: Results are cached per argument identity using a `WeakMap`.
  Subsequent calls with the same argument return the cached result.
- **Throws are not memoized**: If the wrapped function throws, the exception
  propagates and no result is cached.
  The next call with the same argument will invoke the function again.
- **Rejected promises are memoized**: If the wrapped function returns a
  rejected promise, that promise is cached like any other return value.
- **Invalid keys throw**: If an argument is not a valid `WeakMap` key
  (e.g., a primitive string or number), the memoized function throws before
  invoking the wrapped function.

## Memoization Safety

For detailed information about the safety properties of `memoize`, including
defensiveness, unobservable memoization, and isolation preservation, see
[docs/memoize.md](./docs/memoize.md).

## Install

```sh
npm install @endo/memoize
```

Or with yarn:

```sh
yarn add @endo/memoize
```

## License

[Apache-2.0](./LICENSE)

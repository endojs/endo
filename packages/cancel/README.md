# @endo/cancel

Cancellation tokens and utilities for cooperative cancellation in JavaScript.

This package provides a `Promise<never>`-based cancellation mechanism with
synchronous observation ability, designed for use with Endo and CapTP.

## Installation

```sh
npm install @endo/cancel
# or
yarn add @endo/cancel
```

## Overview

Promises are almost sufficient for modeling cancellation, especially useful for
remote cancellation since CapTP implicitly rejects any partitioned promise.
A `Promise<never>` will never resolve, but may be rejected when the consumer
loses interest.

However, promises don't provide synchronous state observation. This package
provides an `isCancelled` function alongside the `Promise<never>` token for
local synchronous observation, helping utilities avoid unnecessary work.

## API

### `makeCancelKit(parentCancelled?, parentIsCancelled?)`

Creates a cancellation kit containing a cancellation token, a cancel function,
and a synchronous observation function.

```js
import { makeCancelKit } from '@endo/cancel';

const { cancelled, cancel, isCancelled } = makeCancelKit();

// Check synchronously if cancelled
console.log(isCancelled()); // false

// Trigger cancellation
cancel(Error('Operation timed out'));

console.log(isCancelled()); // true

// The promise rejects when cancelled
cancelled.catch(error => console.log(error.message)); // "Operation timed out"
```

If a parent cancellation token is provided, cancellation automatically propagates
from the parent to the child:

```js
const { cancelled: parentCancelled, cancel: cancelParent, isCancelled: parentIsCancelled } = makeCancelKit();
const { cancelled: childCancelled, isCancelled: childIsCancelled } = makeCancelKit(parentCancelled, parentIsCancelled);

cancelParent(Error('Parent cancelled'));
// childCancelled is now also cancelled
```

#### Parameters

- `parentCancelled` - Optional parent cancellation token for hierarchical cancellation
- `parentIsCancelled` - Optional parent synchronous cancellation check; if provided and returns true, the child is synchronously cancelled at creation time

#### Returns

- `cancelled` - A `Promise<never>` cancellation token
- `cancel(reason?)` - Function to trigger cancellation with optional error reason
- `isCancelled()` - Function that synchronously returns `true` if cancellation has been requested, `false` otherwise

### `allMap(values, fn, parentCancelled)`

Maps over values performing a cancellable transformation on each. If any
individual operation rejects, all pending operations are cancelled.

```js
import { allMap } from '@endo/cancel/all-map';
import { toAbortSignal } from '@endo/cancel/to-abort';

const results = await allMap(urls, async (url, index, cancelled, isCancelled) => {
  const response = await fetch(url, {
    signal: toAbortSignal(cancelled, isCancelled),
  });
  return response.json();
}, parentCancelled);
```

#### Parameters

- `values` - Iterable of values to map over
- `fn(value, index, cancelled, isCancelled)` - Transformation function receiving the value,
  index, a cancellation token, and a synchronous cancellation check
- `parentCancelled` - Parent cancellation token to respect

#### Returns

A promise for an array of transformed values.

### `anyMap(values, fn, parentCancelled?)`

Starts a cancellable job for every value, racing them against each other.
When one job succeeds, all pending jobs are cancelled. Only rejects with
`AggregateError` if all jobs reject.

```js
import { anyMap } from '@endo/cancel/any-map';
import { toAbortSignal } from '@endo/cancel/to-abort';

const firstResult = await anyMap(mirrors, async (mirror, index, cancelled, isCancelled) => {
  const response = await fetch(`${mirror}/data.json`, {
    signal: toAbortSignal(cancelled, isCancelled),
  });
  return response.json();
}, parentCancelled);
```

#### Parameters

- `values` - Iterable of values to map over
- `fn(value, index, cancelled, isCancelled)` - Transformation function receiving the value,
  index, a cancellation token, and a synchronous cancellation check
- `parentCancelled` - Optional parent cancellation token to respect

#### Returns

A promise for the first successful result.

### `delay(ms, parentCancelled)`

Returns a promise that fulfills with `undefined` after the specified
milliseconds, or rejects if `parentCancelled` is triggered first.

```js
import { delay } from '@endo/cancel/delay';

// Wait 1 second, respecting cancellation
await delay(1000, parentCancelled);
```

If `parentCancelled` fulfills (instead of rejecting), delay treats this as
a programming error and rejects with an appropriate message.

#### Parameters

- `ms` - Milliseconds to delay
- `parentCancelled` - Parent cancellation token

#### Returns

A promise that fulfills with `undefined` after the delay, or rejects if cancelled.

### `makeDelay(setTimeout)`

Factory function that creates a `delay` function using a custom `setTimeout`
implementation. Useful in environments without ambient `setTimeout` or when
you need to inject a different timer implementation.

```js
import { makeDelay } from '@endo/cancel/delay-lite';

// Create delay with custom setTimeout
const delay = makeDelay(myCustomSetTimeout);

await delay(1000, parentCancelled);
```

#### Parameters

- `setTimeout` - A function with signature `(callback: () => void, ms: number) => unknown`

#### Returns

A `delay(ms, parentCancelled)` function.

## AbortController Integration

This package provides utilities for converting between Endo's `Cancelled` tokens
and the web's `AbortController`/`AbortSignal` API.

### `toAbortSignal(cancelled, isCancelled?)`

Converts a `Cancelled` token to an `AbortSignal` for use with web APIs like `fetch`.

```js
import { makeCancelKit } from '@endo/cancel';
import { toAbortSignal } from '@endo/cancel/to-abort';

const { cancelled, cancel, isCancelled } = makeCancelKit();

// Use with fetch
const response = await fetch(url, {
  signal: toAbortSignal(cancelled, isCancelled),
});

// Later, if needed:
cancel(Error('Request timed out'));
// The fetch will be aborted
```

#### Parameters

- `cancelled` - The cancellation token to convert
- `isCancelled` - Optional synchronous cancellation check; if provided, used to detect already-cancelled state

#### Returns

An `AbortSignal` that aborts when the `Cancelled` token is triggered.

### `fromAbortSignal(signal)`

Converts an `AbortSignal` to a cancellation kit for use with Endo cancellation.

```js
import { fromAbortSignal } from '@endo/cancel/from-abort';
import { allMap } from '@endo/cancel/all-map';

// Create an AbortController (e.g., from user interaction)
const controller = new AbortController();
document.getElementById('cancel-btn').onclick = () => controller.abort();

// Convert to cancellation kit for use with Endo APIs
const { cancelled, isCancelled } = fromAbortSignal(controller.signal);

const results = await allMap(items, async (item, index, innerCancelled) => {
  // Process item with cancellation support
  return processItem(item, innerCancelled);
}, cancelled);
```

#### Parameters

- `signal` - The `AbortSignal` to convert

#### Returns

An object with `cancelled` (the cancellation token) and `isCancelled` (synchronous check).

### Barrel Export

Both functions are available from a combined export:

```js
import { toAbortSignal, fromAbortSignal } from '@endo/cancel/abort';
```

## TypeScript Types

```ts
// The cancellation token type
type Cancelled = Promise<never>;

// The cancel function type
type Cancel = (reason?: Error) => void;

// Synchronous cancellation check
type IsCancelled = () => boolean;

// The result of makeCancelKit()
type CancelKit = {
  cancelled: Cancelled;
  cancel: Cancel;
  isCancelled: IsCancelled;
};

// Callback signature for allMap and anyMap
type CancellableCallback<T, R> = (
  value: T,
  index: number,
  cancelled: Cancelled,
  isCancelled: IsCancelled
) => R | Promise<R>;
```

## Integration with CapTP

The `cancelled` token is designed to work seamlessly with CapTP.
When a remote reference is partitioned, the underlying promise rejects,
naturally triggering cancellation. The `isCancelled` function is
intentionally non-passable—it stays local for performance-critical observation.

A `cancelled` promise that arrives over CapTP can recover a local synchronous
`isCancelled` cache by passing it as the parent of a new cancel kit:

```js
const { cancelled: localCancelled, isCancelled } = makeCancelKit(remoteCancelled);
```

## Design Rationale

This package anticipates a future `Promise.withCanceller` API that would return
`cancelled` and `cancel` (analogous to `Promise.withResolvers` returning
`promise`, `resolve`, and `reject`).

See [DESIGN.md](./DESIGN.md) for more details on the design decisions.

## License

Apache-2.0

# Design: @endo/cancel

## Motivation

The critical observation here is that promises are almost sufficient for
modeling cancellation, and especially useful for modeling cancellation from a
remote consumer, because CapTP implicitly rejects any partitioned promise.
A `Promise<never>` is a promise that will never settle, but may be rejected
in the event the consumer loses interest.

However, promises do not provide any mechanism for synchronously observing
their state locally. There are some conditions where synchronous observation
of cancellation can help a utility avoid unnecessary work.

To that end, we extend the `Promise<never>` to have a `cancelled` getter.

## Core API: `makeCancelKit`

The `Promise.withResolvers` API produces a `promise`, `resolve`, and `reject`.
We envision the eventual addition of `Promise.withCanceller` that returns
instead `cancelled` and `cancel`.

The `cancelled` is a promise with a `cancelled` own getter that returns:
- `undefined` - cancellation has not been requested
- `true` - cancellation has been requested

This package anticipates this eventual evolution of the language and exports
`makeCancelKit`.

```js
import { makeCancelKit } from '@endo/cancel';

const { cancelled, cancel } = makeCancelKit();

// Synchronous check
if (isKnownCancelled(cancelled)) {
  return; // Skip unnecessary work
}

// Asynchronous observation
cancelled.catch(reason => {
  cleanup();
});

// Trigger cancellation
cancel(Error('User requested abort'));
```

### Hierarchical Cancellation

`makeCancelKit` accepts an optional `parentCancelled` token, enabling
hierarchical cancellation patterns. When a parent token is cancelled,
all child tokens automatically cancel with the same reason:

```js
const { cancelled: parentCancelled, cancel: cancelParent } = makeCancelKit();
const { cancelled: childCancelled } = makeCancelKit(parentCancelled);

cancelParent(Error('Operation aborted'));
// childCancelled is now also cancelled
```

This pattern is used internally by operators like `allMap`, `anyMap`, and
`delay` to propagate cancellation from callers to their internal operations.
It enables composable cancellation where a single cancellation at the root
propagates through an entire tree of operations.

## TypeScript Interface

This package provides a TypeScript interface `Cancelled` that is a
`Promise<never>` but with the `undefined | true` `cancelled` own property.

```ts
type Cancelled = Promise<never> & { readonly cancelled: undefined | true };
```

## Operators

Additional modules provide operators for the use and propagation of
cancellation.

### `allMap`

Maps over values and performs some transformation over them, combining them
into a promise for an array of values. If any individual operation is rejected,
all of the operations are cancelled.

```js
import { allMap } from '@endo/cancel/all-map';

return allMap(values, (value, index, cancelled) => {
  // Transform value, checking cancelled as needed
}, externalCancelled);
```

### `anyMap`

Starts a cancellable job for every value, and cancels every pending job after
one wins the race, producing a rejection of `AggregateError` only if all the
jobs reject.

```js
import { anyMap } from '@endo/cancel/any-map';

return anyMap(values, (value, index, cancelled) => {
  // Race to produce a result
}, externalCancelled);
```

### `delay`

Returns a promise that races between a timer and cancellation. Fulfills with
`undefined` after the specified milliseconds, or rejects if `parentCancelled`
is triggered first.

```js
import { delay } from '@endo/cancel/delay';

await delay(1000, parentCancelled);
```

The `delay` module uses the ambient `globalThis.setTimeout`. For environments
without ambient `setTimeout` or when you need to inject a custom timer,
use `makeDelay` from `@endo/cancel/delay-lite`:

```js
import { makeDelay } from '@endo/cancel/delay-lite';

const delay = makeDelay(myCustomSetTimeout);
await delay(1000, parentCancelled);
```

#### Design Rationale for delay

The `parentCancelled` token is expected to be a `Cancelled` that either:
- Never settles (no cancellation requested)
- Rejects (cancellation requested)

If `parentCancelled` fulfills instead of rejecting, this indicates a
programming error—`Cancelled` tokens should never fulfill. The delay
function treats this case as an error and rejects with an assertion failure.

This strict behavior catches misuse early rather than silently succeeding,
which could mask bugs in cancellation logic.

## Integration with pass-style and CapTP

We adjust `pass-style` to gracefully allow promises to have the `cancelled`
property, and for CapTP implementations to simply leave this synchronous
observation capability behind: it is not passable in any case.

The synchronous getter is intentionally local-only. When a `Cancelled` token
crosses a CapTP boundary, only the promise behavior is preserved—the remote
side observes rejection when cancellation occurs, but cannot synchronously
poll the `cancelled` getter.

## Implementation Notes

### Preventing Unhandled Rejections

The `cancelled` promise internally attaches a no-op `.catch()` handler to
prevent unhandled rejection warnings when the promise is not explicitly awaited.
This is safe because:

1. Cancellation is an expected outcome, not an exceptional error
2. Consumers can still attach their own `.catch()` handlers
3. The synchronous `cancelled` getter provides the primary observation mechanism

### Idempotent Cancellation

The `cancel()` function is idempotent—calling it multiple times has no
additional effect after the first call.
This simplifies cleanup logic and prevents double-rejection errors.

### Parent Cancellation Propagation

The `makeCancelKit(parentCancelled)` API handles propagation of cancellation
from parent to child tokens. Operators like `allMap`, `anyMap`, and `delay`
use this internally by passing their `parentCancelled` argument directly to
`makeCancelKit`. This centralizes the propagation logic and ensures consistent
behavior across all cancellation-aware utilities.

## Integration with Web APIs

The web platform provides its own cancellation mechanism through
`AbortController` and `AbortSignal`. This package provides bidirectional
conversion utilities to integrate Endo's `Cancelled` tokens with web APIs.

### `toAbortSignal`

Converts a `Cancelled` token to an `AbortSignal` for use with web APIs
like `fetch`, `EventTarget.addEventListener`, and other abort-aware APIs.

```js
import { makeCancelKit } from '@endo/cancel';
import { toAbortSignal } from '@endo/cancel/to-abort';

const { cancelled, cancel } = makeCancelKit();

const response = await fetch(url, {
  signal: toAbortSignal(cancelled),
});
```

When the `Cancelled` token is triggered, the `AbortSignal` aborts with
the same reason. If the token is already cancelled at conversion time,
the signal is immediately aborted.

### `fromAbortSignal`

Converts an `AbortSignal` to a `Cancelled` token for use with Endo's
cancellation APIs.

```js
import { fromAbortSignal } from '@endo/cancel/from-abort';

const controller = new AbortController();
const cancelled = fromAbortSignal(controller.signal);

// Now use `cancelled` with Endo APIs
```

This enables integration with user-initiated cancellation (e.g., a cancel
button), timeout signals (`AbortSignal.timeout()`), or any other source
of `AbortSignal`.

### Design Rationale for Abort Integration

The web's `AbortSignal` and Endo's `Cancelled` serve similar purposes but
have different characteristics:

| Feature | AbortSignal | Cancelled |
|---------|-------------|-----------|
| Sync observation | `.aborted` | `.cancelled` |
| Async observation | `abort` event | Promise rejection |
| Reason access | `.reason` | Via rejection |
| Hardened | No | Yes |
| CapTP compatible | No | Yes |

The conversion utilities bridge these two worlds:

- `toAbortSignal` enables using Endo's cancellation with web APIs
- `fromAbortSignal` enables using web cancellation sources with Endo

Both conversions preserve the cancellation reason and handle the edge case
of already-cancelled/aborted state at conversion time.

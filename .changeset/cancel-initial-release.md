---
'@endo/cancel': major
---

Initial release of `@endo/cancel`, a cooperative cancellation primitive built around a `Cancelled` token (a `Promise<never>` that only ever rejects) and a `makeCancelKit` factory that pairs the token with a `cancel` function and a synchronous `isCancelled` observation function.

Includes cancellable operators (`allMap`, `anyMap`) that propagate cancellation to children on first failure or first success respectively, a `makeDelay`-backed `delay` that races a timer against parent cancellation, and bidirectional `AbortSignal` interop (`toAbortSignal`, `fromAbortSignal`).

The design anticipates a future `Promise.withCanceller` API; the kit shape is chosen so callers can migrate by swapping the factory rather than rewriting call sites.

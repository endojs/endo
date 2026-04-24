# @endo/quest

`Quest` is a `Promise` subclass that exposes **promise shortening** — the
moment one promise's `resolve()` is called with another thenable and adopts
its eventual state. Standard promises hide this; `Quest` reports it via
`onShorten(listener)`.

`saga(generatorFn)` runs a generator like an `async` function and reports
each `yield`ed thenable as a shortening event on the returned `Quest`.

## Quest

```js
import { Quest } from '@endo/quest';

const inner = somethingAsync();
const q = new Quest(resolve => resolve(inner));

q.onShorten(target => console.log('adopted:', target));
const value = await q;
```

- `Symbol.species` is `Promise`, so `q.then(...)` returns a plain `Promise`,
  not a `Quest`. Only the directly constructed instance is observable.
- Listeners fire asynchronously (via a microtask). A listener attached
  immediately after construction still sees synchronous shortenings inside
  the executor; later subscribers receive past events via history replay.
- Transitive shortening through other `Quest`s is reported. Plain native
  thenables are opaque, so the chain is observable up to that boundary
  and no further.
- `q.shortenHistory` is a snapshot of every thenable adopted so far.

## Saga

```js
import { saga } from '@endo/quest';

const q = saga(function* () {
  const user = yield fetchUser();
  const orders = yield fetchOrders(user.id);
  return summarize(user, orders);
});

q.onShorten(target => console.log('saga awaiting:', target));
const result = await q;
```

- Each `yield <thenable>` is reported as a shortening event on the
  returned `Quest`, in order. Yielding a non-thenable feeds the value
  back to the generator without firing an event.
- A rejected awaited value is re-entered into the generator via
  `gen.throw()`, so `try/catch` works as in `async/await`.
- The generator body runs synchronously up to its first `yield` —
  matching `async` function semantics.

## Why?

Surfacing the chain of awaited thenables is useful for distributed object
pipelining (e.g. CapTP/OCapN), promise tracing/devtools, and any system
that wants to reason about *what a promise is currently waiting on* rather
than just its final value.

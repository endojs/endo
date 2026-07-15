# Pass-Style Promise

| | |
|---|---|
| **Created** | 2026-05-10 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | [endojs/endo-but-for-bots#168](https://github.com/endojs/endo-but-for-bots/issues/168) |

## What is the Problem Being Solved?

Endo's marshal layer recognizes only one shape as a `'promise'` pass
style: a frozen native `Promise` that satisfies `isSafePromise`.
Every other passable cap is opaque to the surrounding code (a
`'remotable'` is a `makeExo`/`Far` object whose internals belong to its
host); only `'promise'` is special-cased to require a thenable that the
host platform's `await` machinery can directly synchronize on.

That conflation has two costs.

1. **`await` is implicit synchronization.**
   A pass-style value with a `then` method silently turns `await
   somePromise` and `return somePromise` into a synchronization across
   the cap-protocol boundary.
   Issue [endojs/endo#2869](https://github.com/endojs/endo/issues/2869)
   names this the "then-pinhole" footgun: every `EProxy` that returns a
   pass-style value risks an unintended "follow this promise to
   settlement on the local turn" moment, with no syntactic warning to
   the caller and no safe way for the receiving code to opt out.
   The intuition behind the existing pass-style remotable applies
   equally here: the cap-system layer should hand the application an
   opaque token, and synchronization should be an explicit operation.

2. **Marshal cannot round-trip a promise without a real `Promise`.**
   Issue [endojs/endo#1312](https://github.com/endojs/endo/issues/1312)
   describes the agoric-sdk kernel's need to transform marshaled
   messages while respecting their encoding, including any promise
   slots they carry.
   Today the only object that satisfies `passStyleOf(x) === 'promise'`
   is a real `Promise` instance, which forces the kernel to manage a
   `WeakMap<Promise, kref>` and to manufacture genuine native promises
   purely to act as opaque tokens.
   FUDCo's example in the issue thread is the motivating case.

A pass-style "promise stand-in" addresses both problems at once: a
non-thenable object that `passStyleOf` recognizes as a `'promise'`,
that `E` and an explicit settle/when operation interoperate with, and
that liveSlots can adopt as it adopts a remotable.

## Convergence in the upstream discussion

The 2022 thread on
[endojs/endo#1312](https://github.com/endojs/endo/issues/1312)
converged on three points across @gibson042, @erights, @mhofman, and
@FUDCo.

1. **Non-thenable.**
   The pass-style promise must not have a `then` method (in any form
   reachable through the regular `then` lookup).
   `await x` and `Promise.resolve(x)` must not synchronize on it.
2. **Binding requirement.**
   For any `x` such that `passStyleOf(x) === 'promise'`, the operations
   `E(x).foo()`, `E.when(x, ...)`, and liveSlots' inbound/outbound
   handling must work.
3. **No carried state.**
   The most restrictive shape (no own properties beyond `PASS_STYLE` and
   `Symbol.toStringTag`) is the right starting point.
   Settlement state is private to the producer (the analogue of a
   remotable's private fields).

The matching synchronization design appears in
[endojs/endo#1652](https://github.com/endojs/endo/issues/1652)
("Plan for an improved `eventual-send`").
That plan introduces `WrappedPromise<T>` (a `RemotableBrand` with no
`then`) and the static methods `Promise._wrap`, `Promise.shorten`, and
`Promise.settle` on a `HandledPromise`-like constructor.
`Promise.settle(wp)` is the explicit conversion from the wrapped
(non-thenable) promise back to a platform `Promise<Awaited<T>>` that
`await` can consume.

This design is the synthesis of those two threads, with the most
restrictive `passStyleOf` shape from #1312 and the `Promise.settle`
synchronization shape from #1652.

## Design

### The pass-style shape

A pass-style promise is a frozen object with exactly the following own
properties.

| Property | Value | Notes |
|---|---|---|
| `PASS_STYLE` | `'promise'` | Symbol-keyed; non-enumerable, non-writable, non-configurable. |
| `Symbol.toStringTag` | `'PassablePromise'` | Symbol-keyed; non-enumerable data property. Distinct from a native promise's `'Promise'` so the kind is visible in console output and stack traces. |

The prototype is `Object.prototype` (or `null`).
There is no `then` method.
There is no `catch`, `finally`, `constructor`, or any other own or
inherited property reachable through normal property access.
There is no settlement state observable from outside the producer.

`passStyleOf(x) === 'promise'` is true for two cases.

1. A frozen native `Promise` that passes `isSafePromise` (the existing
   case).
2. A frozen object whose `[PASS_STYLE]` is the string `'promise'` and
   that satisfies the shape table above (the new case).

This matches the most restrictive option proposed in PR
[endojs/endo#1313](https://github.com/endojs/endo/pull/1313) and
addresses the @erights review note that converged on "no carried
state, no `then`".

The new shape shares the `'promise'` pass-style tag with native
promises — `passStyleOf` returns `'promise'` for both, a single
pass-style kind rather than a distinct `'pseudoPromise'` tag.
Existing `case 'promise'` consumers see both shapes through one arm
and discriminate further (when they must) with an `isPromise(x)`
check; no new `passStyleOf` arm, CapTP slot prefix, or smallcaps
shape is introduced.
The non-thenable contract and the pass-through preservation of
native promises are independent of that choice.

### Constructor surface

The carrier shape AND the producer-side construction live in
`@endo/pass-style`.
The package exports a single constructor that hands back both a
non-thenable carrier and a private resolver paired with it.

```js
/**
 * Returns a kit containing a frozen non-thenable carrier `promise`
 * (for which `passStyleOf(promise) === 'promise'`) and a private
 * `resolver` that the producer holds in its own closure.
 *
 * The carrier itself carries no settlement state.
 * The resolver is the only handle that can drive the carrier's
 * resolution; passing the carrier to a third party does not pass
 * the ability to settle it.
 *
 * @param {object} [options]
 * @param {() => void} [options.onFirstListen]
 *   Invoked exactly once, on the next turn after the first
 *   listener attaches via `HandledPromise.listen(promise, …)`,
 *   `HandledPromise.settle(promise)`, or `E.when(promise, …)`.
 *   If the producer rejects or resolves before any listener
 *   arrives, `onFirstListen` still fires (on the next turn after
 *   the first listener arrives, even though settlement is already
 *   recorded).
 *   If `onFirstListen` is omitted, no first-listen
 *   notification is delivered.
 *   See "Producer-side first-listen notification" below.
 * @returns {{ promise: PassablePromise, resolver: Resolver }}
 */
export const makePromise = (options) => { /* ... */ };
```

`PassablePromise` is an opaque type alias; from the outside it is
simply a passable value with `passStyleOf` of `'promise'`.
`Resolver` exposes `resolve(target)` and `reject(reason)` operations
that the producer alone may invoke.

The package boundary is deliberate: the shape of a pass-style promise
is the purview of `@endo/pass-style`, so the construction primitive
lives there too.
`@endo/eventual-send` consumes carriers (via `listen` and `settle`,
and by registering them with `HandledPromise`); it does not construct
them.
This is the dependency-direction-correct factoring (`eventual-send`
already depends on `pass-style`, not the other way around).
Earlier drafts placed the producer-side kit in `eventual-send` and
forced the builder to re-derive the carrier shape locally; that
indirection is what motivated this revision.

### Producer-side first-listen notification

`makePromise(options)` accepts an `onFirstListen` callback in its
`options` bag.
The callback fires exactly once, on the next turn after the first
listener attaches to the carrier through any of the supported
listening paths (`HandledPromise.listen(promise, …)`,
`HandledPromise.settle(promise)`, or `E.when(promise, …)`).
If the producer omits `onFirstListen`, no notification is
delivered and the carrier behaves exactly as in the bare
`makePromise()` case.

The motivating use case is a producer that wants to defer computing
the resolution value until a consumer actually asks for it.
A pass-style promise can travel through the cap-system layer (carried
across several messages, retained in tables, encoded and decoded by
the marshal codecs) before any consumer listens.
A producer that did all the work to compute its resolution eagerly
would be doing work whose results may never be observed.
The first-listen hook lets the producer wait until at least one
consumer has expressed interest before doing the work.

Fire-once semantics: the callback is invoked at most once per
carrier, on the next turn after the first listener arrives.
Settlement state is independent of listening state.
If the producer rejects or resolves before any listener arrives,
the rejection or resolution is recorded on the producer's record
(per the rejection-retention principle below).
`onFirstListen` still fires when the first listener eventually
attaches, even though the settlement is already in hand; the
producer may use the hook for diagnostics or telemetry that is only
meaningful once a consumer has shown up.

Scope rationale.
The `onFirstListen` hook is **only available on
PassablePromise**.
There is no equivalent on a native `Promise` (the platform exposes
no producer-side hook for listener arrival; a native promise's
resolver is closed over at construction and is not reachable from
the outside).
There is no equivalent on a `HandledPromise` either: a
HandledPromise's handler protocol exists for the *consumer* side
(`applyMethod`, `get`, etc.), not the producer side, and its
handler is invoked on message dispatch rather than on listener
arrival.
A future generic `HandledPromise.onFirstListen(p, cb)` op
(Option B in the upstream discussion) was considered and
deferred; if added, it would error early on any non-PassablePromise
input, for the same reason.
The producer-side scope is a deliberate factoring (the producer
owns the resolver; the resolver is where the notification belongs),
not an arbitrary limitation.

Interaction with rejection retention.
The "do not surface rejections to unlistened promises" principle
in the next section says a rejection on a carrier with no
listeners is held until the first listener arrives, not
emitted eagerly to the host's unhandled-rejection path.
`onFirstListen` composes naturally with that principle: a
producer can use the hook to implement lazy diagnostics (record a
debug breadcrumb when the rejection happens, defer the log line
until a listener arrives and the rejection is about to be
delivered).
The hook does not change the rejection-retention contract; it
gives the producer a place to react when the held rejection is
about to start moving.

Worked example: a lazy-computation producer.

```js
const { promise, resolver } = makePromise({
  onFirstListen: () => {
    // Defer the expensive computation until a consumer asks.
    computeAnswer().then(
      answer => resolver.resolve(answer),
      err => resolver.reject(err),
    );
  },
});
// `promise` may travel through several message hops before any
// consumer listens; `computeAnswer` does not run until one
// does.
return promise;
```

A consumer that calls `await HandledPromise.settle(promise)` (or
`E.when(promise, …)`, or `HandledPromise.listen(promise, cb)`)
triggers `onFirstListen` on the next turn, which in turn starts
`computeAnswer()`.
A consumer that never listens leaves the producer's work
undone, which is the intended laziness.

### Listening: `HandledPromise.listen`

`listen` is the lower-level callback-based primitive on which the
promise-returning `HandledPromise.settle` (below) composes.
It is the single explicit way to observe a pass-style promise's
eventual resolution; because the carrier itself has no `then` method,
`await` cannot do this implicitly.

It differs from `E.when` in three ways that make it the primitive
rather than the convenience.
`E.when(x, …)` returns a native Promise and recursively walks the whole
chain to the ground Passable; `listen` returns nothing and fires its
callback with the *immediate* settlement target — a single hop that may
itself be another promise-shaped link the listener must chase (see
`ListenTarget` below).
`E.when` composes with `await`; `listen` never does, because the
carrier has no `then`.
And `E.when` is the application-level API, whereas `listen` is the
one primitive both it and `HandledPromise.settle` are built on.
The primitive is named `listen` rather than `subscribe`: `subscribe`
reads as pub/sub and reactive-stream observation, which sits awry with
the one-shot settlement this primitive delivers, and `listen` aligns
with OCapN's `op:listen`.

```js
/**
 * Registers `callback` to fire exactly once when `x` settles.
 * The callback receives the settlement target as its only argument.
 *
 * The settlement target is the value the producer resolved the
 * pass-style promise to. It is one of four shapes:
 *
 *   1. A final concrete Passable (a primitive, a record, an array, a
 *      remotable, or `undefined` for a void resolution).
 *   2. A native `Promise` that itself settles later. The listener
 *      is responsible for synchronizing on it (e.g. via
 *      `HandledPromise.settle` or by awaiting it directly, which is
 *      safe because a native Promise is thenable).
 *   3. A `HandledPromise` whose handler will dispatch on it.
 *   4. Another pass-style promise; the listener re-listens to
 *      that one to chase the chain to its eventual ground value.
 *
 * The four targets are distinguishable by `passStyleOf` and a
 * platform `isPromise` check:
 *   - `passStyleOf(target) !== 'promise'` → case 1 (final value).
 *   - `passStyleOf(target) === 'promise'` and the target is a frozen
 *     native Promise (`isSafePromise(target)`) → case 2 or 3
 *     (a HandledPromise satisfies `isSafePromise`).
 *   - `passStyleOf(target) === 'promise'` and the target is not a
 *     native Promise → case 4 (another pass-style promise).
 *
 * `listen` is fire-once: settlement is final on the underlying
 * carrier, and a second resolution by the producer is a contract
 * violation that the implementation MAY enforce. Listeners added
 * after a settlement has already occurred fire on the next turn with
 * the recorded target.
 *
 * Rejections are surfaced through a separate `onRejected` argument
 * (analogous to `Promise.prototype.then`'s second argument) so that
 * the listener callback's signature distinguishes "the producer
 * fulfilled with this target" from "the producer rejected with this
 * reason". An omitted `onRejected` rethrows on the next turn into the
 * unhandled-rejection path of the host.
 *
 * @template T
 * @param {T} x  A pass-style promise, native Promise, HandledPromise,
 *               or any other passable.
 * @param {(target: ListenTarget) => void} onFulfilled
 * @param {(reason: any) => void} [onRejected]
 * @returns {void}
 */
HandledPromise.listen = (x, onFulfilled, onRejected) => { /* ... */ };
```

`ListenTarget` is the union of "any Passable that is not a
pass-style promise" with "Promise | HandledPromise | PassablePromise".
The listener that wants the ground value, not just the next link in
the chain, walks the chain itself by re-listening on each
pass-style-promise hop and awaiting any thenable hop.

This callback shape is deliberate.
A listener that wants a Promise can build one with
`new Promise((resolve, reject) => HandledPromise.listen(x, resolve, reject))`,
which is exactly what `HandledPromise.settle` does (see below).
Going the other direction (deriving listen-shape from a
promise-returning primitive) is also possible but introduces an
unconditional microtask hop and forecloses the optimization where the
producer can synchronously deliver a target that is already known at
listening time.

`listen` is **not** triggered by `await`.
The pass-style promise has no `then` method, by design (per the
non-thenable contract above), so `await passStylePromise` resolves to
the carrier itself, never to its settlement target.
A consumer that wants to observe settlement must call `listen` (or
`HandledPromise.settle`) explicitly.

#### `for await` and `Promise.all` see the carrier, not its target

The non-thenable contract has a direct, deliberate consequence for the
platform's promise-consuming syntax.
`for await (const x of asyncIter)` calls `await` internally, so a
pass-style promise flowing through that path is turned into a value
immediately (the carrier token itself, with no settlement).
`Promise.all([passStylePromise])` behaves the same way: the resolved
array element is the carrier token, not its eventual fulfillment.
This is the correct behavior, not a gap — the carrier is not thenable,
so nothing implicitly synchronizes on it.
A consumer that needs the eventual target must call
`HandledPromise.settle` (or `listen`) explicitly first.
The Test Plan exercises this as a regression guard (`await
passStylePromise` does NOT settle).

#### Principle: do not surface rejections to unlistened promises

When a producer rejects a pass-style promise that has no listeners
yet, the rejection is retained on the producer's record.
It is delivered to the first listener that arrives, not eagerly
thrown to the host's unhandled-rejection path.

This principle generalizes beyond pass-style promises.
A promise (native or pass-style) sometimes travels before it is
listened.
Eagerly surfacing a rejection that no consumer has had the chance to
handle yet produces spurious noise; swallowing it produces silent
failures.
Both are bad answers to a false dichotomy.
The right answer for a chain like:

```js
const a = makePromise();
const b = makePromise();
a.resolver.resolve(b.promise);
b.resolver.reject(new Error('boom'));
```

is that `b`'s rejection rides through `a`'s eventual listener, not
that the host emits an unhandled-rejection event for `b` before any
listener has had a turn.

The forward-looking direction (out of scope for this design, captured
here for the next iteration): a debug-view ring buffer of recent
long-pending, forever-pending, and unlistened-rejection promises,
inspectable while debugging without producing noise in production.
Promises sometimes travel before they are listened; the debugger
should be able to see them in transit without forcing a production
log line on every hop.
This is a separate design and is not blocked by the present one.

### Synchronization: `Promise.settle`

`HandledPromise.settle` is the promise-returning convenience layered
on top of `listen`.
It returns a native Promise so that callers using `await` can
synchronize on the eventual resolution.

```js
/**
 * Returns a native Promise that fulfills with the eventual settlement
 * value (or rejects with the eventual rejection reason) of `x`,
 * recursively walking through any chain of pass-style promises,
 * native Promises, or HandledPromises until a non-promise Passable
 * is reached.
 *
 * For a pass-style promise that the local liveSlots-equivalent has
 * adopted, this is the moment of explicit synchronization across the
 * cap boundary.
 *
 * For a native Promise, `settle(p)` is the same as `Promise.resolve(p)`
 * (modulo the native-promise reentrancy hardening from #1181).
 *
 * For any other passable, `settle(v)` resolves immediately to `v`.
 *
 * The reference implementation is roughly:
 *
 *     HandledPromise.settle = x => new Promise((resolve, reject) => {
 *       const onFulfilled = target => {
 *         if (passStyleOf(target) === 'promise' || isPromise(target)) {
 *           HandledPromise.listen(target, onFulfilled, reject);
 *         } else {
 *           resolve(target);
 *         }
 *       };
 *       HandledPromise.listen(x, onFulfilled, reject);
 *     });
 *
 * @template T
 * @param {T} x
 * @returns {Promise<UnwrapAwaited<T>>}
 */
HandledPromise.settle = x => { /* ... */ };
```

`E.when(x, onFulfilled, onRejected)` is implemented in terms of
`HandledPromise.settle(x).then(onFulfilled, onRejected)`.
The existing `E.when` API remains the supported way for application
code to react to a settlement; `HandledPromise.settle` is the
intermediate-level primitive that composes with `await`; `listen`
is the lowest-level primitive that the other two compose on.

This is the point at issue
[endojs/endo#1652](https://github.com/endojs/endo/issues/1652) names
`Promise.settle`.
The name on the public API is open; `HandledPromise.settle` reads
naturally because it is the operation paired with `HandledPromise.resolve`.

### `E` integration

`E(x)` already accepts any value as its target; the proxy invokes
`HandledPromise.applyMethod` and the underlying handler dispatches.
For a pass-style promise, the dispatch path is the same as for a
remotable that the local side has not adopted: the pending handler
forwards the message to whoever ends up owning the resolution.

The integration is not, however, a pure test pass.
The implementation needed two specific changes that earlier framings
of this design underestimated.

1. **`HandledPromise.resolve(carrier)` recognizes pass-style carriers
   and routes through `HandledPromise.settle(carrier)`.**
   Without this, `HandledPromise.resolve(carrier)` falls through the
   "this is not a thenable, treat it as a fulfilled value" branch and
   produces a native promise fulfilled with the carrier itself.
   Subsequent `E(carrier).method(...)` then dispatches against the
   carrier (which has no methods) instead of routing to the eventual
   target.
   Routing `resolve` through `settle` for the carrier shape unwinds
   the chain to the actual target before any dispatch fires.

2. **The contestant-race in `handle()` skips the synchronous-target
   optimization for pass-style carriers.**
   `handle()` races two contestants when dispatching a method: the
   handler's eventual answer and a synchronous fallback that fires
   if the target is already a settled native value.
   For a pass-style carrier the synchronous fallback is wrong: the
   carrier is opaque, the second contestant wins immediately, and
   the dispatch lands against the carrier itself rather than against
   the eventual target.
   The fix is a `passStyleOf(target) === 'promise' &&
   !isPromise(target)` guard at the contestant-race site that defers
   to the asynchronous dispatch path for pass-style carriers.

These two integration points are minimal, but each prevents a
specific failure mode the implementation discovered: the first
prevents `E(carrier).method()` from dispatching against the carrier
instead of the target; the second prevents the same failure mode
showing up via the contestant-race even when `resolve` routes
correctly.

In a CapTP setting, the pass-style promise's slot id is what the local
side sends across the wire; the remote side resolves the slot through
the usual promise-resolution machinery.
`captp.js` already distinguishes `'p'`-prefixed slots for promises;
that distinction is unaffected.

### liveSlots integration

LiveSlots (in agoric-sdk) and any liveSlots-equivalent in Endo (the
captp slot tables, the OCapN encoder/decoder) currently identify a
promise by `isPromise`.
The new contract is "an inbound passable that `passStyleOf` reports as
`'promise'`".
This is exactly the substitution FUDCo's example in #1312 illustrates:

```js
// Before (today)
const promiseRefMap = new WeakMap();
export const kslot = (kref, iface) => {
  if (isPromiseRef(kref)) {
    const p = new Promise(() => undefined);  // never settles
    promiseRefMap.set(p, kref);
    return harden(p);
  }
  return Far(iface, { toString: () => `${kref}` });
};

// After (this design)
export const kslot = (kref, iface) => {
  if (isPromiseRef(kref)) {
    const { promise, resolver } = makePromise();
    // The producer keeps `resolver` in its own table keyed by kref;
    // only `promise` (the opaque carrier) escapes to callers.
    rememberResolver(kref, resolver);
    return promise;
  }
  return Far(iface, { toString: () => `${kref}` });
};
```

The `WeakMap<Promise, kref>` goes away; the kslot/krefOf pair becomes
symmetric in shape with the remotable case.
The producer-side resolver replaces the never-settling-Promise + WeakMap
plumbing with an explicit handle the producer holds privately.

### Marshal codec changes

`encodeToCapData` and `encodeToSmallcaps` already special-case
`passStyleOf(val) === 'promise'` to call the user's promise encoder,
which produces a slot.
Both codecs are `passStyleOf`-driven; once `passStyleOf` returns
`'promise'` for the new shape, the codecs need no further change.
The decoder side is similarly unaffected: it asks the user's
`convertSlotToVal` for a value, and the user is now free to return
either a native `Promise` (the legacy path) or a pass-style promise
token (the new path).

### Type narrowing

`packages/pass-style/src/types.d.ts` defines `PassStyleOf` with the
overload `(p: Promise<any>): 'promise'`.
The new case adds an overload `(p: PassablePromise): 'promise'`.
The existing `PassableCap` union of "remotable | promise" is unchanged;
the union member `Promise<Passable>` is widened (in TypeScript terms)
to `Promise<Passable> | PassablePromise`.

This interacts with the typing tightening proposed by
[endojs/endo#3068](https://github.com/endojs/endo/issues/3068)
(only `Promise<Passable>` is passable) and
[endojs/endo#2421](https://github.com/endojs/endo/issues/2421)
(promise-for-non-passable typing).
Both of those tighten the value parameter of `Promise<...>`; they do
not constrain the carrier shape, so they compose orthogonally with the
new `PassablePromise` member.

## Constraints

The following are non-negotiable contracts on the design.
They override any convenience or implementation-shortcut they conflict
with.

### Not a `Promise` subclass or instance

A pass-style promise carrier MUST NOT be a `Promise` subclass or a
`Promise` instance.
Specifically:

- `makePromise()` returns a kit `{ promise, resolver }` whose
  `promise` is a fresh object whose prototype chain does not include
  the JS `Promise.prototype`.
- `passStylePromise instanceof Promise === false` is part of the
  contract.
- The implementation MUST NOT use `class PassablePromise extends
  Promise`, MUST NOT monkey-patch a `Promise` instance, and MUST NOT
  install the carrier's hidden state on a backing `Promise` that the
  carrier delegates to.
  The implementation has to reimplement what it needs from
  `Promise`'s helpers (typically a single fire-once listener list);
  it cannot inherit them.

Why this matters:

- A `Promise` subclass inherits `then`, `catch`, and `finally`
  through the prototype chain, which reintroduces the implicit
  `await`-synchronization footgun that the non-thenable contract
  exists to close.
  Even an own-property `then: undefined` does not help, because
  `Promise.resolve(x)` and the host's `await` machinery walk the
  prototype chain in some paths and use internal slots in others.
- Static methods on `Promise` (`Promise.all`, `Promise.race`,
  `Promise.allSettled`, `Promise.any`) auto-coerce their arguments
  through the platform's promise-resolution algorithm.
  If the carrier is a `Promise` (subclass or instance), those
  algorithms recognize it as one and synchronize on it.
  A non-`Promise` carrier is opaque to all of them; it appears in the
  result array as the token, never as its eventual fulfillment.
- The "no carried state on the carrier" convergence from #1312 is
  easier to enforce on a plain frozen object than on a `Promise`
  subclass; subclassing forces the implementer to reason about which
  inherited slots are observable from the outside.

### Native `Promise` instances remain passable

The new pass-style promise kind is **additive**.
Existing native `Promise` instances continue to be passable through
the marshal codecs and CapTP exactly as they are today; their
semantics do not change.

- `passStyleOf(nativePromise)` continues to return `'promise'` — the
  same single pass-style tag the new carrier also uses.
- The codecs continue to special-case native promises through the
  user's `convertValToSlot` pathway; no native-promise call site
  needs to migrate.
- `await nativePromise` continues to synchronize on the native
  promise, as it always has.

The new pass-style kind is opt-in: callers who want the non-thenable,
no-implicit-`await` semantics call `makePromise()`
explicitly.
Callers who do not opt in see no change.

This rules out any "lockdown removes native Promise from the
passable set" framing.
The non-thenable contract is a new option, not a replacement.

## Dependencies

| Issue or design | Relationship |
|---|---|
| [endojs/endo#1312](https://github.com/endojs/endo/issues/1312) | Primary upstream issue; this design synthesizes its 16-comment thread. |
| [endojs/endo#1313](https://github.com/endojs/endo/pull/1313) | 2022 draft PR; this design picks the most-restrictive shape and replaces the draft's `then`-allowing variant. |
| [endojs/endo#1652](https://github.com/endojs/endo/issues/1652) | Source of `Promise.settle`/`WrappedPromise`; the synchronization half. |
| [endojs/endo#2869](https://github.com/endojs/endo/issues/2869) | The "then-pinhole" footgun this design closes. |
| [endojs/endo#1181](https://github.com/endojs/endo/issues/1181) | Reentrancy in `await`/`Promise.resolve`; orthogonal but settled in the same code path as `Promise.settle`. |
| [endojs/endo#1587](https://github.com/endojs/endo/issues/1587) | OCapN's promise-vs-remotable distinction; the new shape carries cleanly across OCapN. |
| [endojs/endo#3068](https://github.com/endojs/endo/issues/3068) | Type tightening for `Promise<Passable>`; orthogonal. |
| [endojs/endo#2421](https://github.com/endojs/endo/issues/2421) | `Promise<non-Passable>` typing; orthogonal. |

## Phases

### Phase 1: pass-style classification and producer kit (M)

- Add a `PromiseHelper` to `packages/pass-style/src/` modeled on
  `RemotableHelper`, recognizing the `[PASS_STYLE]: 'promise'` shape.
- Wire the helper into `passStyleOf`'s `HelperTable` and the
  fallthrough loop in `passStyleOfInternal`.
- Add the `PassablePromise` type to `types.d.ts` and broaden
  `PassStyleOf` accordingly.
- Export `makePromise` from `@endo/pass-style`. The export returns
  the `{ promise, resolver }` kit described in "Constructor surface"
  above; the resolver is the producer-side handle that drives
  listener notification once `@endo/eventual-send` registers the
  carrier with `HandledPromise` in Phase 3.

PR [endojs/endo#1313](https://github.com/endojs/endo/pull/1313) is
the template for the helper and the type changes (with the
simplification that the new shape forbids `then` rather than
admitting both variants).
The producer-side resolver kit is new to this design; PR #1313 did
not include it.
Hosting the kit in pass-style (rather than in eventual-send) keeps
the dependency direction correct: eventual-send already depends on
pass-style.

### Phase 2: marshal codec compatibility (XS)

The codecs are already `passStyleOf`-driven and need no source change.
This phase is a test-coverage phase: round-trip a pass-style promise
through `capdata` and `smallcaps` (the test cases in PR #1313 are the
template).

### Phase 3: eventual-send integration (M)

`@endo/eventual-send` hosts only `listen`, `settle`, and the
HandledPromise registration of pass-style carriers; it does not host
the producer-side construction (that lives in `@endo/pass-style` per
Phase 1).

- Add `HandledPromise.listen(x, onFulfilled, onRejected?)` as the
  fire-once, callback-based primitive that observes a pass-style
  promise's resolution. The producer-side resolver from `@endo/pass-style`'s
  `makePromise()` kit drives listener notification.
- Add `HandledPromise.settle(x)` layered on `listen`, walking
  chains of pass-style promises / native Promises / HandledPromises
  to a non-promise ground value.
- Register pass-style carriers with `HandledPromise` so that
  `HandledPromise.resolve(carrier)` routes through `settle(carrier)`
  and the contestant-race in `handle()` skips the synchronous-target
  optimization for pass-style carriers (see "E integration" above).
- Re-implement `E.when` in terms of `HandledPromise.settle`.
- Confirm `E(x).method(...)` dispatches correctly for a pass-style
  promise target.

`listen` and `settle` ship together.
`listen` cannot land before `settle` because `E.when` (and any
existing `await`-driven consumer migrating to the new shape) needs
the promise-returning form.
`settle` cannot land before `listen` because `listen` is the
primitive `settle` uses to walk pass-style-promise chains without
introducing an extra `then`-pinhole on each hop.

### Phase 3.5: SES permits (XS)

`HandledPromise.listen` and `HandledPromise.settle` are new
properties on the existing `HandledPromise` intrinsic.
SES's permits enumerate the properties allowed on each well-known
intrinsic; an unenumerated property is removed during lockdown.
The new methods MUST therefore be added to the `HandledPromise`
permit entry in `packages/ses/src/permits.js` (the existing entry
that already lists `apply`, `applyFunction`, `applyMethod`, `get`,
`resolve`, etc.), NOT introduced as new top-level intrinsics.

This is a small but load-bearing change: omitting it leaves the new
methods present pre-lockdown and absent post-lockdown, which produces
a confusing failure mode where a test that imports `@endo/init` sees
`HandledPromise.listen` go from `function` to `undefined`.

The permits live alongside other HandledPromise properties; the
diff is a two-line addition to an existing permit object, not a new
permits section.

### Phase 4: CapTP integration (M)

- `convertValToSlot` allocates a `'p'`-prefixed slot id for a
  pass-style promise, the same as for a native promise.
- `convertSlotToVal` calls `makePromise()` for an inbound
  `'p'`-prefixed slot when the local side has no native promise to
  bind, returning the kit's `promise` to the caller and retaining
  the kit's `resolver` in the slot table keyed by slot id.
  This path is gated on the feature flag below.
- Settle-resolution from the remote side invokes the retained
  resolver; downstream `HandledPromise.settle` callers observe
  the resolution through the standard listener path.

#### Feature flag: env-option

The inbound substitution of pass-style carriers for native promises
on a `'p'`-prefixed slot is gated by an env-option, so that downstream
consumers can opt in incrementally and so that a regression in the
new path can be diagnosed by toggling the flag off.

The flag uses the existing `@endo/env-options` pattern (the same
mechanism `TRACK_TURNS`, `DEBUG`, and the marshal message-breakpoints
options use):

```js
import { getEnvironmentOption } from '@endo/env-options';

const PROMISE_DELEGATES_INBOUND =
  /** @type {'disabled' | 'enabled'} */
  (getEnvironmentOption(
    'ENDO_PROMISE_DELEGATES',
    'disabled',
    ['enabled'],
  )) === 'enabled';
```

The flag's spelling reflects the future-standard direction: `Promise.delegate`
is the proposed TC39 name for the same concept, and the design
anticipates exposing the functionality as `Promise[Symbol.for('delegate')]`
in a follow-up (see [issue
#172](https://github.com/endojs/endo-but-for-bots/issues/172)).
Naming the flag after `delegate` rather than after the local
implementation term (`carrier`, `pass-style-promise`) lines up the
opt-in name with the concept it gates.

A subsequent default-flip (changing the default from `'disabled'` to
`'enabled'`) and a deprecation cycle for the legacy native-promise
inbound path is its own follow-up phase, not part of this design's
scope.

The default-flip proceeds unevenly across consumers rather than as one
blanket switch. OCapN has no downstream consumers today, so it can
adopt pass-style promises as its default from the start; the same
holds for Endo's own CapTP. Liveslots and Swingset need more care and
are migrated deliberately. Slot Machine is either migrated in place or
has the need to migrate recorded on its own open PR.

### Phase 5: documentation and migration (S)

- A `NEWS.md` entry under `@endo/pass-style` and `@endo/eventual-send`.
- A short migration note for liveSlots-style consumers: the
  `WeakMap<Promise, kref>` pattern can collapse into a direct
  `makePromise()`/slot mapping.
- Cross-link from `@endo/marshal`'s README to the new
  `Promise.settle` operation.

### Phase 6: agoric-sdk uptake (XL, downstream)

This is out of scope for the Endo PR but is the user-visible payoff:
agoric-sdk's liveSlots stops manufacturing native promises as opaque
tokens and adopts `makePromise` as its kref carrier.
Tracked separately in the agoric-sdk repo once Phases 1 to 5 land
upstream.

## Out of Scope, Future Work

The following directions are deliberately not in scope for this design,
but are recorded so the next iteration has a starting point.

### HandledPromise shimming and `Promise[Symbol.for('delegate')]`

[Issue endojs/endo-but-for-bots#172](https://github.com/endojs/endo-but-for-bots/issues/172)
tracks the follow-up of giving `HandledPromise` (and the new
`listen`/`settle` machinery) a race-to-install ponyfill at
`Promise[Symbol.for('delegate')]`, modeled on the
`Object[Symbol.for('harden')]` pattern that `@endo/harden` uses.

The pattern:

- Library races to install at the registered-symbol slot.
  If the library installs first, lockdown will fail loudly if it
  tries to install a conflicting implementation.
  If lockdown installs first, the library leaves it alone and
  provides a ponyfill that calls through to the global.
- The registered-symbol slot is realm-wide, so child compartments
  inherit it.
- The future-standard direction is `Promise.delegate` as a TC39
  proposal; installing at `Promise[Symbol.for('delegate')]` rather
  than `Promise.delegate` directly avoids stepping on the standard's
  eventual shape.

This is not in the present design's scope (which is the pass-style
shape and its eventual-send integration), but it is the natural
follow-up once `HandledPromise.listen` and `HandledPromise.settle`
are stable.

### Debug view for long-pending and unlistened-rejection promises

Per the rejection-retention principle in the Listening section,
the right answer to "rejections in transit before any listener"
is neither swallow nor eagerly throw.
A future debug-view direction is a ring buffer of recent
long-pending, forever-pending, and unlistened-rejection promises,
inspectable while debugging without producing noise in production.
This is its own design and is not blocked by the present one.

## Resolved Decisions

Every question that guided this design is now closed. The decisions are
integrated into the design body above; this section records each
closure and its provenance so the reasoning is not lost.

1. **`Promise.settle` / `listen` API surface — resolved.**
   The explicit synchronization operations live on
   `HandledPromise.listen` and `HandledPromise.settle` (paired with
   `HandledPromise.resolve`), with the SES permits added to the
   `HandledPromise` intrinsic per Phase 3.5. A new global on `Promise`
   is not the home; the future-standard direction is
   `Promise[Symbol.for('delegate')]` per
   [#172](https://github.com/endojs/endo-but-for-bots/issues/172).
   [Resolved 2026-05-10 per kriskowal review on
   [#169](https://github.com/endojs/endo-but-for-bots/pull/169#issuecomment-4414533060).]

2. **`listen` is a static method — resolved.**
   `listen` is a static on `HandledPromise`
   (`HandledPromise.listen(x, cb, errCb)`), never an instance method. A
   pass-style promise carrier has no own methods (the "no carried
   state" rule), so there is no `carrier.listen(cb)` form; the static
   form keeps the carrier opaque and property-free and works uniformly
   across the four argument shapes.
   [Resolved 2026-07-12 per kriskowal review on
   [#169](https://github.com/endojs/endo-but-for-bots/pull/169#pullrequestreview-4682392602):
   "`subscribe`, by whatever name, is a static method and pass-style
   promises have no methods."]

3. **Fire-once listener lifecycle — resolved.**
   Settlement is final on the carrier; a listener fires exactly once;
   a producer that settles twice is in violation. This matches the
   native-Promise model and the "no carried state on the carrier"
   convergence. Multi-fire "channel" semantics are a different
   abstraction (a stream or a publisher) and do not borrow the
   `'promise'` pass style.

4. **Single `'promise'` pass-style tag — resolved.**
   The new carrier shares the `'promise'` pass-style tag with native
   promises (`passStyleOf` returns `'promise'` for both); there is no
   distinct `'pseudoPromise'` tag. Existing `case 'promise'` consumers
   see both shapes through one arm and discriminate with `isPromise(x)`;
   the CapTP slot prefix (`'p'`) and the smallcaps `&N` shape are
   unchanged. This is the migration-friendly option — no new arm to add
   anywhere.
   [Resolved 2026-07-12 per kriskowal review on
   [#169](https://github.com/endojs/endo-but-for-bots/pull/169#pullrequestreview-4682392602):
   "Yes to single promise pass-style."]

5. **`Symbol.toStringTag` is `'PassablePromise'` — resolved.**
   The carrier's `Symbol.toStringTag` is `'PassablePromise'`, distinct
   from a native promise's `'Promise'` so the kind is visible in
   console output and stack traces. The carrier type is likewise named
   `PassablePromise` throughout this design.
   [Resolved 2026-07-12 per kriskowal review on
   [#169](https://github.com/endojs/endo-but-for-bots/pull/169#pullrequestreview-4682392602):
   "Let's run with `PassablePromise`."]

6. **`for await` / `Promise.all` see the carrier — resolved.**
   Passing a pass-style promise through `for await` or
   `Promise.all([...])` yields the carrier token itself, not its
   eventual target; observing the target requires an explicit
   `HandledPromise.settle`. This is the intended behavior, and it is
   called out in the design body (see "`for await` and `Promise.all`
   see the carrier, not its target") with a matching Test Plan entry.
   [Resolved 2026-07-12 per kriskowal review on
   [#169](https://github.com/endojs/endo-but-for-bots/pull/169#pullrequestreview-4682392602):
   "Agree."]

7. **Opt-in, migrated per consumer — resolved.**
   The inbound CapTP substitution is gated by the
   `ENDO_PROMISE_DELEGATES` env-option (Phase 4), so consumers opt in
   incrementally; the universal-day-one option is off the table. The
   eventual default-flip proceeds unevenly (see Phase 4): OCapN — which
   has no downstream consumers today — and Endo's own CapTP can default
   to pass-style promises from the start, while Liveslots and Swingset
   need care and migrate deliberately; Slot Machine is migrated in
   place or has the need recorded on its own open PR. A grep-and-audit
   of `case 'promise'` sites still precedes any default flip.
   [Resolved 2026-05-10 and refined 2026-07-12 per kriskowal reviews on
   [#169](https://github.com/endojs/endo-but-for-bots/pull/169#pullrequestreview-4682392602):
   "There are no downstream consumers of OCapN, so we can start with
   pass-style-promise by default there. Same for Endo's CapTP. We need
   care for Liveslots and Swingset."]

8. **Why PR #1313 stalled in 2022 — answered.**
   The 2022 @erights review withheld approval on two grounds: (a) the
   requested `checkTagRecord`-based validation and (b) the discomfort
   of introducing a `passStyleOf === 'promise'` value that `E` and
   `E.when` did not yet work with. This design addresses (b) directly
   by sequencing Phase 3 alongside Phase 1 (the eventual-send
   integration is part of the same delivery, not a deferred follow-up),
   and (a) by reusing the modern
   `confirmCanBeValid`/`assertRestValid` shape.

9. **No settlement state on the carrier — resolved.**
   This design intentionally does not carry settlement state on the
   pass-style promise itself. The producer (liveSlots, captp's slot
   table, an agoric-sdk vat) keeps the state in its own closure. A
   later design can layer durable settlement state on top once the
   non-stateful base is in place.

10. **Producer-side first-listen: Option A — resolved.**
    Option A — the `onFirstListen` callback in the `makePromise()`
    options bag, invoked on the next turn after the first listener
    attaches — ships in v1. The producer-side scope matches who owns
    the resolver and avoids exposing a listener-arrival signal to
    arbitrary holders of the carrier. Option B (a generic
    `HandledPromise.onFirstListen(p, cb)` op) is deferred and can be
    layered on later without changing the v1 contract.
    [Resolved 2026-05-10 per @kumavis on
    [#170](https://github.com/endojs/endo/pull/170#discussion_r4416253020)
    and the v1 greenlight on
    [#170](https://github.com/endojs/endo/pull/170#discussion_r4416544308).]

11. **Name: `listen` — resolved.**
    The primitive is `listen`, not `subscribe`. `subscribe` reads as
    pub/sub and reactive-stream observation, which sits awry with the
    one-shot settlement this primitive delivers; `listen` aligns with
    OCapN's `op:listen`. `E.when` remains the recursively-unwrapping,
    Promise-returning, `await`-composing convenience layered on
    `listen`.
    [Resolved 2026-07-12 per kriskowal review on
    [#169](https://github.com/endojs/endo-but-for-bots/pull/169#pullrequestreview-4682392602):
    "OCapN is leaning toward 'listen' (`op:listen`) and I feel
    'subscribe' will get muddy with pubsub and reactive patterns."]

## Alternatives Considered

### Allow `then` on the pass-style promise

The 2022 PR #1313 began with the most-restrictive shape (no own
properties), and the design discussion considered relaxing to allow a
`then` method.
**Rejected.**
Allowing `then` reintroduces the implicit-synchronization footgun that
issue #2869 names.
The non-thenable shape is the maintainer's stated framing in the
prompt and aligns with the @erights / @mhofman / @FUDCo convergence in
#1312.

### Use a `Far`-style remotable as the promise carrier

A pass-style promise could be expressed as a remotable with a marker
method (e.g., `__isPromise__`).
**Rejected.**
This conflates two distinct passable cap kinds at the marshal layer,
breaks `passStyleOf(x) === 'promise'` as a discriminator, and makes the
CapTP slot-id distinction (`'p'` vs. `'o'` prefix) impossible to
maintain.
The whole point of the pass-style promise is that it is a distinct
kind in the passable taxonomy.

### Defer until virtual/durable promises

@erights's January 2024 follow-up on #1312 asked whether the work
should wait for virtual/durable promise persistence.
**Rejected.**
The non-thenable, no-state base is a prerequisite for virtual/durable
promises (the state lives in the durable storage layer; the in-memory
carrier is the pass-style promise).
Landing the base now unblocks both the agoric-sdk kernel use case
(FUDCo) and the durable-promise design (mhofman) without committing to
the durability model in this PR.

## Test Plan

Tests live under `packages/pass-style/test/`,
`packages/marshal/test/`, `packages/eventual-send/test/`, and
`packages/captp/test/`.

1. **Recognition.**
   `passStyleOf(makePromise().promise) === 'promise'`.
2. **Non-thenability.**
   The token has no `then` (own or inherited beyond `Object.prototype`).
   `await passStylePromise` resolves to the token itself, not to a
   settlement value.
3. **Frozen.**
   `Object.isFrozen(passStylePromise) === true`.
4. **Rejected shapes.**
   - With a `then` method: `passStyleOf` throws.
   - With an extra own property: throws.
   - With the wrong `[PASS_STYLE]` value: throws.
   - With an enumerable or accessor `[PASS_STYLE]` descriptor: throws.
5. **Capdata round-trip.**
   `serialize(token)` produces a `slot` encoding; `unserialize` calls
   the user's `convertSlotToVal` and accepts whatever it returns.
6. **Smallcaps round-trip.**
   Same as above through the smallcaps codec (the `&N` shape).
7. **`HandledPromise.listen` fire-once.**
   `HandledPromise.listen(token, cb)` invokes `cb` exactly once
   when the producer resolves, with the resolution target as the only
   argument. A second producer resolution is rejected (or asserted
   against) by the implementation; listeners added after settlement
   fire on the next turn with the recorded target.
8. **`HandledPromise.listen` resolution-target shapes.**
   The four target cases (final Passable, native Promise,
   HandledPromise, another pass-style promise) are each delivered
   verbatim to the listener and are distinguishable by
   `passStyleOf(target)` plus an `isPromise(target)` check. A test
   resolves four separate carriers, one per shape, and asserts the
   listener receives the expected target each time.
9. **`HandledPromise.settle` walks chains.**
   A pass-style promise resolved to another pass-style promise (which
   in turn is resolved to a native Promise that fulfills with a
   Passable) settles to the ground Passable through a single
   `await HandledPromise.settle(token)` call.
10. **`E.when` on a pass-style promise.**
    The callback fires on the producer's resolution. Verifies that
    `E.when`'s reimplementation in terms of `HandledPromise.settle`
    preserves the prior contract.
11. **`E(token).method(...)` dispatch.**
    The pending-handler path forwards the call.
12. **`await passStylePromise` does NOT settle.**
    The carrier is not thenable, so `await passStylePromise` resolves
    to the carrier itself, not to its eventual target. This is the
    regression guard for the non-thenable contract; observing the
    target requires an explicit `listen` or `settle` call.
13. **CapTP round-trip.**
    Send a pass-style promise across a CapTP loopback; the remote side
    receives a fresh pass-style promise that settles when the local
    producer settles.
14. **Existing-consumer regression.**
    Run the existing `pass-style` and `marshal` test suites unchanged;
    no test that passes a native `Promise` should regress.
15. **`E(carrier).method(...)` integration via `HandledPromise.resolve`.**
    A test that calls `HandledPromise.resolve(carrier)` then dispatches
    a method through `E(...)` confirms the resolve-through-settle
    routing reaches the actual target's method (not the carrier's
    nonexistent method). Without the routing fix, this test fails with
    a "no such method" or equivalent against the carrier.
16. **Contestant-race skip for pass-style carriers.**
    A test that exercises `handle()`'s contestant race with a
    pass-style carrier as the target confirms the synchronous
    fallback is skipped and the dispatch lands on the eventual
    target. The regression guard is that without the guard, the
    second contestant wins immediately and the dispatch lands on the
    carrier itself.
17. **Rejection retention without listener.**
    A producer that calls `resolver.reject(reason)` before any
    listener registers MUST NOT cause a host-level
    unhandled-rejection event. The first listener that arrives
    receives the recorded rejection on the next turn. A second-stage
    test confirms a chain (`a.resolver.resolve(b.promise);
    b.resolver.reject(err)`) delivers `err` through `a`'s listener
    without intermediate noise.
18. **Env-flag gating of the inbound CapTP path.**
    With `ENDO_PROMISE_DELEGATES` unset (the default), inbound
    `'p'`-prefixed slots produce native promises (the legacy path).
    With `ENDO_PROMISE_DELEGATES=enabled`, inbound `'p'`-prefixed
    slots produce pass-style carriers. The flag's parse honors the
    `@endo/env-options` convention (`'enabled'` is the only
    non-default value).
19. **SES permits.**
    After `@endo/init` (i.e. post-lockdown), `HandledPromise.listen`
    and `HandledPromise.settle` are still callable. Without the
    permits entry, both go to `undefined` and the test fails
    closed.

## Self-Improvement and Bots-Side Note

This design lives in the `endojs/endo-but-for-bots` mirror (per the
prompt at issue #168).
The eventual implementation will land as a PR against `endojs/endo`
(or as a contribution back to the existing draft
[endojs/endo#1313](https://github.com/endojs/endo/pull/1313)),
delivered through the cross-mirror dispatch flow.
This document is the design input to that work; it is not itself the
implementation.

## Prompt

Reproduced from the maintainer comment on
[endojs/endo-but-for-bots#168](https://github.com/endojs/endo-but-for-bots/issues/168#issuecomment-4413989795):

> Please dispatch a designer to synthesize an implementation plan from
> the above resources.

The "above resources" refer to the prior researcher comment at
[endojs/endo-but-for-bots#168 (comment)](https://github.com/endojs/endo-but-for-bots/issues/168#issuecomment-4413986952),
which surfaced the upstream issues and PRs cited above.

The originating issue body for #168:

> Please find the issue on actual endo pertaining to the creation of a
> pass-style variant of promise and a "when" operation on handled
> promises.
> This would introduce a promise type that is not thenable, so would
> not be converted to a native promise and implicitly synchronized on
> await or return.

# Async Handler Implementation Plan

This plan starts from `src/async-handler.js`, `src/async-reflect.js`, and
`docs/Eventual Send API Redesign.md`. It extends the local async operation
ponyfill with identity-based handler dispatch and an `AsyncTargetFactory` that
can associate handlers with fresh targets.

The first implementation remains intentionally narrow:

- no integration with the existing `HandledPromise` handler tables;
- no transport, serialization, or RPC harness;
- no prototype or property-descriptor async operations;
- no implicit global installation;
- native Promise scheduling only;
- one shared `WeakMap` is the authority for target-to-handler associations;
- forwarding is tracked separately inside each dispatching handler.

The current code already defines the operation signatures, eventual options,
queue/completion envelope, local `Reflect` behavior, and hardening policy. The
new work is to move the local behavior behind `makeAsyncHandler`, preserve the
original target identity until dispatch, and add target constructors that
populate the shared handler table. Forwarding should follow the hand-written,
well-tested `shorten` model in `src/handled-promise.js`. The
`PromissoryWatcher` contract in the API redesign supplies the lifecycle
observer surface for `promiseWatch`.

## Target API

Create a complete async handler that closes over a handler table:

```js
const asyncHandlers = new WeakMap();
const handler = makeAsyncHandler(asyncHandlers);
```

`makeAsyncHandler` accepts an optional table and returns a complete, hardened
`AsyncHandler`:

```ts
makeAsyncHandler(
  asyncHandlers?: WeakMap<object, Partial<AsyncHandler>>,
): AsyncHandler
```

Each operation consults `asyncHandlers` using the operation target. If that
target has a partial handler with the corresponding operation, the operation is
delegated to it. Otherwise, promise targets are followed and dispatch retries
against the shortened resolution before using current local behavior based on
the matching `Reflect` method.

`makeAsyncReflect` uses a fresh dispatching handler by default:

```js
const reflectAsync = makeAsyncReflect(
  Promise,
  makeAsyncHandler(),
);
```

Callers that need client, reflect, and target creation to share associations
construct them around one table:

```js
const asyncHandlers = new WeakMap();
const handler = makeAsyncHandler(asyncHandlers);
const reflectAsync = makeAsyncReflect(Promise, handler);
const AsyncTargetFactory = makeAsyncTargetFactoryConstructor(asyncHandlers);
const targets = new AsyncTargetFactory(partialHandler);
```

The ponyfills do not mutate `Reflect`, `Proxy`, or `Promise`. A caller may
install the resulting values as `Reflect.async`, `Proxy.async`, and
`AsyncTargetFactory` if desired.

## Semantics From The Redesign

An `AsyncHandler` has the exact operand order specified in the API redesign and
the same operation surface currently used by `makeAsyncReflect`:

```js
{
  get,
  has,
  ownKeys,
  apply,
  invoke,
  construct,
  set,
  deleteProperty,
  optional,
}
```

Every operation returns:

```js
Promise<{ result: Promise<unknown> }>
```

The outer promise settles when the operation has been queued. The inner
`result` promise settles when the operation completes. This distinction lets
`sendOnly` acknowledge queueing without exposing a later operation failure,
while ordinary sends await the completed result.

The handler table is consulted by identity. Objects and functions can carry
associations because they are valid `WeakMap` keys. Primitive targets cannot
carry an association and therefore use local behavior.

Handlers are partial by design. A handler may intercept one operation while an
unimplemented operation follows any promise target and ultimately falls back to
local behavior:

```js
const handler = {
  invoke(target, thisArg, key, args, options) {
    // Custom eventual invocation.
  },
};
```

Handler dispatch must preserve promise identity while following settlement. In
particular, a promise created by an `AsyncTargetFactory` must remain visible as
the target of the initial dispatch lookup. An operation implemented by its
handler receives that original associated promise while it is pending. The
dispatching handler also observes settlement in the background. Once the
promise resolves and its forwarding edge is recorded, later dispatch proceeds
from its shortened resolution instead.

An unassociated promise is followed before local fallback. If its resolution
has an associated handler, that same handler is associated with the original
promise as a forwarding cache. A separate forwarding edge records that the
promise now denotes its resolution, and the current operation is dispatched
with the shortened resolution as its target. Rejections propagate normally. A
primitive or an unassociated non-promise target uses local behavior.

All operations remain future-turn operations. Looking up a handler, invoking a
custom handler, reading a target property, and invoking a target function must
not happen synchronously during the public `Reflect.async` call.

## Proposed Runtime Model

### Dispatching handler

Replace the singleton `localAsyncHandler` with:

```js
export const makeAsyncHandler = (asyncHandlers = new WeakMap()) => {
  // Return a complete hardened AsyncHandler.
};
```

The returned handler closes over `asyncHandlers`. For each operation it:

1. shortens the supplied target to its most-resolved known identity;
2. checks whether the current target is an object or function;
3. obtains its `Partial<AsyncHandler>` from `asyncHandlers` when present;
4. ensures that a promise target has one future-turn settlement observer;
5. calls the matching custom method with the current associated target when it
   is implemented;
6. follows a promise when the operation is absent, replacing the current target
   with its resolution;
7. records and shortens a forwarding edge from that promise to its resolution;
8. associates an original unassociated promise with a handler discovered on
   its resolution;
9. otherwise queues the current local operation;
10. returns the same hardened queue/completion envelope used today.

Operation selection uses optional call semantics, equivalent to
`handler[operation]?.(...)`. A missing operation therefore falls through, while
a present non-callable value throws the ordinary JavaScript `TypeError` instead
of being treated as absent. A conforming custom operation returns the required
queue/completion envelope; returning `undefined` is not a valid implementation.

The implementation can preserve the distinction between an absent operation
and an invalid return value without pre-validating callability:

```js
const custom = handler[operation];
const dispatched = custom?.(...args);
return custom == null ? followPromiseOrUseLocal(...args) : dispatched;
```

The custom handler owns the queue/completion envelope for operations it
implements. The dispatching wrapper must not wrap that envelope in another
operation or silently convert a custom queue acknowledgement into completion.

The existing local operations remain small adapters around `Reflect.get`,
`Reflect.has`, `Reflect.ownKeys`, `Reflect.apply`, `Reflect.construct`,
`Reflect.set`, and `Reflect.deleteProperty`. `invoke` remains an atomic property
lookup followed by `Reflect.apply`. `optional` remains a nullish gate around its
continuation.

### Forwarding and shortening

Before implementing forwarding, examine `shorten` and each of its call sites in
`src/handled-promise.js`. That implementation already solves the central
problem with a union-find-like forwarding forest and path splitting:

- `forwardedPromiseToPromise` records forwarding independently of handler and
  presence tables;
- resolution first shortens the proposed target, then records a forwarding
  edge without creating a cycle;
- shortening rewrites upstream edges to the most-resolved identity and removes
  stale pending-handler state;
- dispatch shortens immediately before looking up the effective handler.

`makeAsyncHandler` should initially adapt this design rather than extract or
generalize it. In addition to the shared `asyncHandlers` table, each returned
handler owns a private `forwardedTargetToTarget` `WeakMap`. An internal
`shorten(target)` follows those edges to the canonical target and path-splits
the traversed chain. Handler association remains in `asyncHandlers`; a
forwarding edge must never be encoded merely by copying a handler entry.

When a promise is followed, its settlement records the edge before redispatch.
If the resolution has a handler, that handler may also be cached on an
originally unassociated promise as an optimization, but `shorten` remains the
authority for the target identity supplied to the operation. The implementation
must reject or avoid cycles and must not observe a user-supplied thenable's
`then` synchronously.

An associated promise needs settlement observation even when its handler
implements the current operation. Register that observer at most once per
promise, in a future turn, without delaying the pipelined operation. Before the
observer records settlement, implemented operations still target the associated
promise. Afterwards, `shorten` directs later operations to the resolution. For
native promises this reveals final settlement but not every intermediate
forwarding step; ponyfill-controlled resolution and `PromiseStep` can record
the intermediate edges they actually observe.

Dispatch should preserve the useful race from `handled-promise.js`: a known
handler can accept a pipelined operation without waiting for settlement, while
an operation with no applicable handler follows settlement and retries against
the shortened target. This is also the basis for detectable `onForwarded`
notifications in `promiseWatch`.

### Reflect boundary

`makeAsyncReflect` continues to own public API concerns:

- eventual-options validation and defaults;
- `Metadata` sanitization and hardening;
- `sendMode` selection;
- `harden: 'none' | 'all'` handling;
- shallow freezing of copied argument arrays;
- result identity supplied as `options.result`;
- queue and completion bookkeeping for `whenQueued` and `whenCompleted`.

It must pass the original target to the configured `AsyncHandler`; it must not
first assimilate the target and then choose a handler. Local target resolution
moves behind `makeAsyncHandler`, where it is performed only for the local
fallback.

The default becomes logically equivalent to:

```js
export const makeAsyncReflect = (
  PromiseCtor = Promise,
  handler = makeAsyncHandler(),
) => {
  // Reflect.async ponyfill.
};
```

Supplying an explicit handler remains supported so separately constructed
components can share one table. `makeAsyncReflect` has no direct dependency on
the table: its default handler closes over a private table, while a caller that
needs composition passes a handler constructed with the shared table.

### Async target factory

Add `src/async-target.js` with a constructor maker bound to a handler table:

```ts
makeAsyncTargetFactoryConstructor(
  asyncHandlers: WeakMap<object, Partial<AsyncHandler>>,
): typeof AsyncTargetFactory
```

The maker returns the `AsyncTargetFactory` constructor:

```js
const AsyncTargetFactory = makeAsyncTargetFactoryConstructor(asyncHandlers);
const targets = new AsyncTargetFactory(partialHandler);
```

Each factory instance hardens and retains the original
`Partial<AsyncHandler>` object without copying it, so its identity remains the
same. Each creation method makes a fresh target, records
`asyncHandlers.set(target, partialHandler)`, and returns the target without
exposing the association.

The factory surface described by the redesign is:

```js
targets.promiseResolve(resolution);
targets.objectCreate(prototype);
targets.newProxy(proxyTarget, proxyHandler);
targets.proxyRevocable(proxyTarget, proxyHandler);
targets.functionCreate(wrappedFunction);
targets.promiseWatch(resolution, watcher, ...context);
```

`proxyRevocable` registers the returned proxy, not its target. Its wrapped
`revoke` synchronously deletes the proxy's association and revokes the proxy.
`newProxy` likewise associates the proxy identity rather than the proxy target.
`functionCreate` creates a fresh callable identity rather than registering the
caller-provided function directly.

`promiseResolve` always creates a fresh promise identity, equivalent to
`new Promise(resolve => resolve(resolution))`, and associates that fresh promise
with the factory's handler. `promiseWatch` mirrors the `Promise.watch` lifecycle
surface:

```ts
promiseWatch<T, C extends unknown[] = [], TR1 = Fulfilled<T>, TR2 = never>(
  value?: T,
  watcher?: PromissoryWatcher<Fulfilled<T>, C, TR1, TR2>,
  ...context: C
): PromiseStep<Fulfilled<TR1> | Fulfilled<TR2>>
```

It calls `onFulfilled` or `onRejected` once at settlement and calls
`onForwarded` whenever the ponyfill can detect a more-resolved identity. A
non-Promissory only invokes `onFulfilled`. The initial implementation must offer
settlement observation and should detect forwarding when the ponyfill has enough
control and information to do so; native promises do not expose general
forwarding detection.

### Transparent function targets

`functionCreate` can use the transparent-wrapper strategy suggested by
`@mhofman`: detect constructability with a temporary proxy, create a named
wrapper with matching call and construction behavior, then copy the shallow
function descriptors.

```js
const constructDetectHandler = {
  construct(target) {
    return target;
  },
};

const isConstructor = candidate => {
  try {
    const probe = new Proxy(candidate, constructDetectHandler);
    new probe();
    return true;
  } catch (_error) {
    return false;
  }
};

const wrapFunction = original => {
  const { [original.name]: result } = isConstructor(original)
    ? {
        [original.name]: function (...args) {
          switch (new.target) {
            case undefined:
              return Reflect.apply(original, this, args);
            case result:
              return Reflect.construct(original, args);
            default:
              return Reflect.construct(original, args, new.target);
          }
        },
      }
    : {
        [original.name](...args) {
          return Reflect.apply(original, this, args);
        },
      };

  for (const property of ['name', 'length', 'prototype']) {
    const descriptor = Reflect.getOwnPropertyDescriptor(original, property);
    if (descriptor) {
      Reflect.defineProperty(result, property, descriptor);
    } else {
      Reflect.deleteProperty(result, 'prototype');
    }
  }
  return result;
};
```

The implementation should harden its maker, constructor, factory instance, and
internal helper records. It must not harden the fresh function target: its
copied `prototype` descriptor may still reference the caller-owned prototype.

## Test-Driven Cycle

Create `test/async-handler.test.js` for handler dispatch and
`test/async-target.test.js` for target construction. Keep the existing
`test/async-reflect.test.js` focused on the public reflect surface.

Future-turn assertions should wait with
`await new Promise(resolve => setImmediate(resolve))`; chained `await null`
expressions do not establish the intended event-loop boundary.

### Phase 1: maker and local compatibility

Tests:

- `makeAsyncHandler()` returns a complete handler;
- each call creates an independent default `WeakMap`;
- the maker and returned handler are hardened;
- every operation retains the current local behavior;
- every operation retains the outer queue/inner completion contract;
- importing the module does not mutate globals.

Implementation:

- move the current local methods into `makeAsyncHandler`;
- preserve the existing `queue` helper and hardening behavior;
- remove `localAsyncHandler` after consumers use the maker;
- export the `AsyncHandler` and `HandlerOptions` typedefs from the new shape.

### Phase 2: identity dispatch and partial fallback

Tests:

- an associated target delegates an implemented operation;
- an associated non-promise target falls back locally for a missing operation;
- an unassociated object falls back locally;
- a primitive target falls back locally;
- handlers are selected by exact identity, not prototype inheritance;
- a proxy association is distinct from an association on its target;
- handler lookup and invocation occur in a future turn;
- custom queue acknowledgements and completion promises pass through unchanged;
- custom handler failures reject without falling back or retrying locally.

Implementation:

- add a shared operation-selection helper;
- consult the `WeakMap` only for objects and functions;
- distinguish an absent method from a present custom method;
- delegate exactly once when a custom method is selected;
- use local behavior only when no custom method is available.

### Phase 3: forwarding and shortening

Tests:

- a pending associated promise can receive an operation before settlement;
- an associated promise is observed without delaying its implemented operation;
- an operation after settlement dispatches against the shortened resolution;
- a missing operation follows a promise to its resolution and retries there;
- a multi-hop forwarding chain dispatches to its most-resolved target;
- shortening compresses traversed forwarding paths;
- stale cached handlers do not override a handler on the shortened target;
- an unassociated promise caches a handler discovered on its resolution;
- resolution cycles do not create cycles in the forwarding forest;
- rejections propagate without local fallback;
- forwarding observation never reads a user thenable's `then` synchronously.

Implementation:

- adapt the forwarding forest and path-splitting `shorten` algorithm from
  `src/handled-promise.js`;
- keep forwarding edges separate from `asyncHandlers` associations;
- register at most one future-turn settlement observer per promise target;
- shorten before handler lookup and after recording each forwarding edge;
- race known-handler dispatch against settlement as appropriate;
- clear or bypass stale cached handler state during shortening.

### Phase 4: Reflect.async integration

Tests:

- `makeAsyncReflect()` defaults to `makeAsyncHandler()` behavior;
- an explicitly shared handler table dispatches each reflect operation;
- a handler attached to a promise is found before that promise is assimilated;
- unassociated promises still resolve before local operations;
- eventual options reach custom handlers with the existing sanitized shape;
- `send` returns completion while `sendOnly` returns queue acknowledgement;
- `whenQueued` and `whenCompleted` work for custom operations;
- `harden: 'all'` retains its current public boundary behavior.

Implementation:

- default the `handler` parameter to `makeAsyncHandler()`;
- preserve the original target until the handler call;
- move local target assimilation into the dispatching handler;
- retain argument sanitization and result bookkeeping in `makeAsyncReflect`.

### Phase 5: Proxy.async identity integration

Tests:

- `makeAsyncClient` passes the original target identity to `Reflect.async`;
- a client operation on an associated promise reaches its handler before
  promise assimilation;
- lazy one-property caching does not force target assimilation;
- chained and optional sends retain their current behavior after dispatch moves
  behind `Reflect.async`;
- `.then.Meta` updates metadata without changing target identity, send mode, or
  optional state;
- metadata updater failures reject before a custom operation is dispatched;
- a custom `sendOnly` queue failure rejects, while a post-queue completion
  failure remains unobserved by the caller.

Implementation:

- retain the original target in client node state instead of eagerly replacing
  it with `Promise.resolve(target)`;
- preserve object and function identity, while boxing primitives only at client
  operation boundaries that use ordinary property lookup;
- rely on `Reflect.async` and `makeAsyncHandler` for future-turn scheduling and
  target following;
- preserve the client's lazy property-name cache and receiver checks;
- preserve the client's immutable promised metadata and branch isolation;
- silence only the completion promise of a confirmed `sendOnly` operation.

### Phase 6: object and proxy targets

Tests:

- `makeAsyncTargetFactoryConstructor(asyncHandlers)` returns a hardened
  `AsyncTargetFactory` constructor;
- a factory instance retains its partial handler;
- `objectCreate(prototype)` returns a fresh object with the requested prototype;
- `newProxy(target, handler)` returns and registers a fresh proxy;
- `proxyRevocable(target, handler)` registers the proxy and returns a revoker
  that synchronously removes the association and revokes the proxy;
- operations on each returned target reach the retained async handler;
- operations absent from the retained partial handler fall back locally;
- the handler association is not exposed as an own property or symbol.

Implementation:

- add `makeAsyncTargetFactoryConstructor` in `src/async-target.js`;
- centralize fresh-target registration;
- implement object and proxy construction with standard JavaScript operations;
- harden the maker, constructor/factory surface, and method records where doing
  so does not freeze caller-owned targets.

### Phase 7: function targets

Tests:

- `functionCreate(wrappedFunction)` returns a distinct callable identity;
- direct async apply dispatches through the associated handler;
- async method invocation works when the function is a property value;
- ordinary direct calls preserve the wrapped function's JavaScript behavior;
- construction behavior is preserved when the wrapped function is
  constructable;
- non-constructable wrapped functions remain non-constructable.

Implementation:

- use a transparent wrapper based on constructor detection with a temporary
  proxy `construct` trap;
- create a named wrapper with the same callable behavior and copy the original
  `name`, `length`, and `prototype` descriptors;
- preserve `this`, argument order, return values, `new.target`, and
  constructability;
- register only the fresh returned function.

### Phase 8: promise targets

Tests:

- `promiseResolve(resolution)` returns a fresh promise identity even when the
  resolution is already a promise of the same constructor;
- the returned promise is associated before async operations can dispatch;
- async operations select its handler before promise assimilation;
- ordinary `await` and `.then` retain normal promise behavior;
- rejection and thenable assimilation follow native Promise semantics;
- local fallback operations use the fulfilled value.

Implementation:

- create the equivalent of `new Promise(resolve => resolve(resolution))` and
  register it without exposing its handler;
- keep promise identity visible at the handler-dispatch boundary;
- resolve locally only after no custom operation was selected;
- record and shorten forwarding edges for missing operations, and cache a
  discovered resolution handler on the original unassociated promise.

### Phase 9: Promise.watch and PromiseStep boundary

Tests:

- `promiseWatch(value, watcher, ...context)` returns a `PromiseStep`;
- `onFulfilled(fulfilment, ...context)` is delivered once in a future turn;
- `onRejected(reason, ...context)` is delivered once in a future turn;
- a non-Promissory invokes only `onFulfilled`;
- the returned step adopts the selected settlement callback's result;
- a fresh watched target carries the factory's handler association;
- `onForwarded(next, ...context)` is called when forwarding occurs through a
  ponyfill-controlled resolution path;
- no forwarding event is invented when native Promise behavior hides it.

Implementation:

- implement the `PromissoryWatcher` callback and context contract;
- implement settlement observation as the required initial ponyfill;
- record forwarding when the ponyfill has the necessary identity information;
- emit detectable forwarding from the same edges consumed by `shorten`;
- document the native Promise cases where forwarding cannot be distinguished
  from ordinary settlement.

### Phase 10: composition and hardening

Tests:

- one shared handler map composes `makeAsyncHandler`, `makeAsyncReflect`,
  `makeAsyncClient`, and `makeAsyncTargetFactoryConstructor`;
- independently constructed maps do not leak associations across ponyfills;
- independently constructed dispatching handlers do not share forwarding
  forests;
- handler tables and associations remain externally unobservable;
- hardening a public ponyfill surface does not freeze mutable operation targets;
- package imports still do not install `Reflect.async`, `Proxy.async`, or a
  global `AsyncTargetFactory`.

Implementation:

- add a test-only composition fixture around one `WeakMap`;
- harden public makers and returned API surfaces;
- leave target mutability governed by eventual options and operation semantics;
- keep installation caller-owned.

## Resolved Design Choices

1. `makeAsyncTargetFactoryConstructor(asyncHandlers)` returns the
   `AsyncTargetFactory` constructor. Each instance accepts and hardens one
   partial handler while retaining that handler's identity.

2. A missing operation follows promises before falling back locally. When an
   unassociated promise resolves to an associated target, its handler is cached
   on the original promise.

3. A custom operation receives its original associated target. Once a promise
   resolves and dispatch follows it, the resolution becomes the current target,
   and any handler associated with that resolution governs later operations.

4. Operation dispatch uses optional-call semantics. Missing operations fall
   through; present malformed operation values fail with normal JavaScript
   errors.

5. `functionCreate` returns an effective shallow copy with the same callable
   and constructable behavior, including copied `name`, `length`, and
   `prototype` descriptors.

6. `promiseResolve` always creates a fresh promise identity and associates the
   factory's handler with it.

7. `promiseWatch` initially provides settlement observation and detects
   forwarding only where the ponyfill has sufficient control and information.
   Its watcher callbacks, context arguments, and result types follow the
   `PromissoryWatcher` contract from the redesign.

8. Proxy revocation removes the association and revokes synchronously.

9. `makeAsyncReflect` deals only with its configured dispatching handler. Its
   default handler owns a private table; callers compose shared state by passing
   an explicitly constructed handler.

10. Forwarding is separate from handler association. The initial implementation
    adapts the forwarding forest and path-splitting `shorten` algorithm from
    `src/handled-promise.js`, and canonicalizes targets before dispatch.

11. Client `Metadata` consists of `senderContext` and `harden`.
    `.then.Meta(updateOptions)` derives immutable metadata for a later chain
    segment without changing send mode, optional state, or handler-generated
    result identity.

## Deferred Decisions

Which makers and returned values become package exports will be decided after
the complete implementation passes its test suite.

## First Commit Shape

The first implementation commit should stay focused on dispatch:

- add `test/async-handler.test.js` with Phase 1 and Phase 2 tests;
- replace `localAsyncHandler` with `makeAsyncHandler` in
  `src/async-handler.js`;
- update `makeAsyncReflect` to default to `makeAsyncHandler()`;
- preserve all existing local reflect tests and behavior;
- defer `src/async-target.js` until the dispatch boundary is established.

The next commit can add `src/async-target.js` with object and proxy creation,
followed by separate passes for functions, promises, and eventually
`promiseWatch`.

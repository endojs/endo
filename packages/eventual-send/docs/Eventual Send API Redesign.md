# **Eventual Send API Redesign**

Decomposing HandledPromise into coherent pieces for standardization

Michael FIG [mfig@agoric.com](mailto:mfig@agoric.com), 2023-06-27  
Last updated: 2026-09-27

This document describes the target layered API. The implementation plans split
that work by responsibility:

- [`async-client.md`](./async-client.md) records the completed local
  `Proxy.async` baseline and its handler-integration phase;
- [`async-handler.md`](./async-handler.md) plans identity-based dispatch,
  forwarding, `AsyncTargetFactory`, and `Promise.watch` integration.

# **HandledPromise in Pieces**

HandledPromise as defined in https://github.com/tc39/proposal-eventual-send is a collection of intertwingled features.

We can define that functionality in terms of distinct components.

Even better, they can be layered.

* \#3 \- Concise eventual client API  
* \#2 \- Distinct eventual operations  
* \#1 \- Attach async handlers to fresh objects
* \#0 \- PromiseSteps to enable pipelining

# **\#3 \- Proxy.async client**

Most uses of eventual send can be accomplished by the eventual send client API. It is only library authors that need to understand the deeper layers.

The client API is currently only provided by a non-standard export (E) from the Endo eventual send shim. The new design will standardize a basic client available on the globals, which user-level code can rely on without being tied to Endo’s implementation of the shim.

This split allows the introduction of changes in the standard client that would break the Endo client, such as leveraging support from the Promise.watch implementation (layer \#0).

The current `packages/eventual-send/src/E2.js` sketch refines the client API as a family of small proxy entry points:

* `E(x, opts?)` is the one-step entry point. It permits at most one property access and at most one function or method call before yielding a promise-like result.
* Pipelining beyond that one step is explicit: either wrap an intermediate result with another `E(...)`, or select a chaining proxy with `E.Send(x, opts?)`, `E.SendOnly(x, opts?)`, `E.Optional(x, opts?)`, or the corresponding `.then` controls.
* The `.then` property is both the normal awaitable surface and the control surface for selecting the next operation mode or updating metadata: `.then.Send`, `.then.SendOnly`, `.then.Optional`, and `.then.Meta(updateOptions)`.

*Concise eventual client API*

# **Eventual Send Client (old)**

```ts
// Obtain the eventual client
import { E } from '@endo/far';

// Eventual get (property access)
const pr = await E.get(x)[prop]; // .get needed to distinguish from eventual send

// Eventual invoke (function call)
const pr2 = await E(x)(...args);

// Eventual send (method call)
const pr3 = await E(x)[prop](...args);

// Supply "eventual options" to the operation, and chain.
const pr4 = await E(E.get(E(x, opts)(...args))[subProp])[method](...args2);
```

# **Proxy.async (new)**

```ts
// Obtain the async client API. It retains the familiar shape of E.
const { async: E } = Proxy;

// One-step eventual get; options can be carried across the chain.
const pr = await E(x)[prop];
const contextual = await E(x, { senderContext: { traceId } })[prop];

// One-step eventual apply (function call).
const pr2 = await E(x)(...args);

// One-step eventual invoke (method call).
const pr3 = await E(x)[prop](...args);

// One-step mode does not keep exposing arbitrary subproperties.
// Continue explicitly by nesting E around the intermediate promise.
const pr4 = await E(E(x)[prop])[subProp](...args2);

// Or choose a chaining proxy to make pipelining explicit.
const pr5 = await E.Send(x, { senderContext: { traceId } })[prop][subProp][method](...args2);

// The same controls are available from the thenable surface.
const pr6 = await E(x)[prop].then.Send[subProp][method](...args2);

// Update immutable metadata for the following segment of the chain.
const pr7 = await E.Send(x, { senderContext: {}, harden: 'none' })
  [method](...args)
  .then.Meta(oldOptions => ({
    ...oldOptions,
    senderContext: { ...oldOptions.senderContext, traceId },
  }))
  [subProp];

// Optional mode short-circuits nullish targets to undefined.
const maybe = await E.Optional(x)[prop][subProp](...args);

// SendOnly queues the sends and discards the eventual result.
const ignored = E.SendOnly(x)[prop][subProp](...args);
await ignored; // Promise<void>
```

# **\#2 \- Reflect.async**

The eventual operations invoked by the eventual client are designed as static
methods on `globalThis.Reflect.async`, much like ordinary JavaScript operations
on `globalThis.Reflect`. The initial implementation is a ponyfill; it does not
mutate globals, and callers choose whether and where to install it.

The old operation names were chosen to avoid conflicting with methods on the `HandledPromise` constructor’s function prototype. The new names are not properties on a function, and thus can be more conventional.

Each method accepts a final, optional eventual-options argument after all of its
ordinary `Reflect` operands:

```ts
type EventualOptions = {
  result?: Promise<unknown>;
  senderContext: Record<string, any>;
  sendMode?: 'send' | 'sendOnly';
  harden?: 'none' | 'all';
};

type HandlerOptions = Required<EventualOptions>;

type Metadata = Pick<HandlerOptions, 'senderContext' | 'harden'>;
```

Callers must leave `result` empty. The reflect layer rejects a populated
`result`, copies and hardens `senderContext`, applies defaults, and passes the
fully populated `HandlerOptions` to the handler. With the default `send` mode,
the public result promise follows operation completion and propagates errors.
With `sendOnly`, it fulfills with `undefined` once the handler acknowledges
queueing; failures after queueing are suppressed. The local fallback does not
use the result or sender-context metadata yet. Omitting the options record uses
an empty `senderContext`; `sendMode` defaults to `send`, and `harden` defaults
to `none`.
Client options are static for a chain and reach each reflect operation, with
the client selecting its current send mode. The client may derive new metadata
for a later chain segment with:

```ts
Meta(updateOptions: (oldOptions: Metadata) => Metadata): AsyncClientNode;
```

The updater receives sanitized, hardened metadata and must synchronously return
a complete replacement. It runs once in a future turn before the following
operation is dispatched. Its result is sanitized and hardened, persists for the
remainder of that branch, and does not mutate sibling branches. An updater
failure rejects only its branch. `Meta` preserves the current send mode and
optional state; `sendMode` remains controlled by `Send` and `SendOnly`, while
the operation-specific `result` remains private to `Reflect.async`.

*Distinct eventual operations*

# **HandledPromise reflect (old)**

```ts
// Obtain operations
const pReflect = HandledPromise;

// Eventual get (property access)
const pr = pReflect.get(x, prop); // HandledPromise<T>

// Eventual apply (function call)
const pr2 = pReflect.applyFunction(x, args); // HandledPromise<T>

// Eventual invoke (method call)
const pr3 = pReflect.applyMethod(x, prop, args); // HandledPromise<T>
```

# **Reflect.async (new)**

```ts
// Obtain operations
const { async: pReflect } = Reflect;

// Eventual get (property access)
const pr = pReflect.get(x, prop, receiver, opts); // Promise<T>; receiver optional

// Eventual apply (function call); thisArg is passed to the function.
const pr2 = pReflect.apply(x, thisArg, args, opts); // Promise<T>

// Eventual invoke (method call); look up prop on x and call with thisArg.
const pr3 = pReflect.invoke(x, thisArg, prop, args, opts); // Promise<T>

const pr4 = pReflect.set(x, prop, value, receiver, opts); // Promise<boolean>; receiver optional
const pr5 = pReflect.deleteProperty(x, prop, opts); // Promise<boolean>
const prHas = pReflect.has(x, prop, opts); // Promise<boolean>
const prKeys = pReflect.ownKeys(x, opts); // Promise<PropertyKey[]>
const prObject = pReflect.construct(x, args, newTarget, opts); // Promise<object>

// Continue only when the eventual value is non-nullish.
const pr6 = pReflect.optional(x, nonNullish => pReflect.get(nonNullish, prop), opts);
// Promise<T | undefined>; nullish x skips the continuation.
```

`optional` waits for `x` in a future turn. It invokes the continuation once
with a non-nullish resolution, adopting its value or promise. A nullish
resolution skips the continuation and fulfills with `undefined`; input and
continuation failures reject the returned promise.

All `Reflect.async` methods return promises and schedule work in a future
turn. The wrapper returns the exact promise passed to the handler as `result`;
this requires a promise-returning wrapper rather than JavaScript `async`
function syntax, which would create a different outer promise. The local
handler delegates to the corresponding `Reflect` methods (and composes
`Reflect.get` with `Reflect.apply` for `invoke`), preserving receiver and
new-target arguments. Eventual options come after those operands, including the
`receiver` or `newTarget` position, and are not forwarded to native `Reflect`.
A caller that wants options while omitting one of those operands must still
preserve its position, normally by passing the target itself as `receiver` or
`newTarget`.
Consequently, `get` and `invoke` reject primitive targets instead of boxing
them for property lookup. `Proxy.async` boxes primitives at its property-lookup
boundary, so concise client expressions such as `E(2345).toFixed()` retain
normal JavaScript behavior.
`set`, `deleteProperty`, and `has` resolve to the booleans returned by the
corresponding `Reflect` operations. `ownKeys` returns an array of own
string and symbol keys. `construct` accepts an optional `newTarget`.
The reflect layer shallow-copies and freezes argument lists, and hardens
assigned values, optional continuations, sender context, returned promises, and
its API surface. The local handler returns a hardened outer promise settling to
a hardened `{ result }` envelope, whose inner result promise is also hardened.
Targets, `thisArg`, `receiver`, individual argument values, and fulfilled
results remain mutable by default. With `harden: 'all'`, these values are
hardened too, including resolved targets, the original argument array, and all
fulfillment values and rejection reasons as promises settle. An explicit
`newTarget` is hardened when distinct from the target. The client proxy
checks the local call receiver before forwarding an apply or invoke; a mismatched
receiver rejects.

`makeAsyncHandler(asyncHandlers = new WeakMap())` creates the dispatching
handler. Its methods receive the original target, their operation operands, and
final `{ result, senderContext, sendMode, harden }` metadata. Each handler
method returns a `Promise<{ result: Promise<unknown> }>`: the outer promise
settles when the operation is queued, while the inner `result` settles when it
completes. Associated targets dispatch to their partial handler; missing
operations follow promises and eventually fall back to the corresponding local
`Reflect` operation.

The complete handler surface preserves the operand order of the corresponding
`Reflect` methods and appends `HandlerOptions`. `invoke` and `optional` are the
two additional composite operations:

```ts
type AsyncOperationResult<T = unknown> = Promise<{
  result: Promise<T>;
}>;

type AsyncHandler = {
  get(
    target: unknown,
    propertyKey: PropertyKey,
    receiver: unknown,
    options: HandlerOptions,
  ): AsyncOperationResult;
  has(
    target: unknown,
    propertyKey: PropertyKey,
    options: HandlerOptions,
  ): AsyncOperationResult<boolean>;
  ownKeys(
    target: unknown,
    options: HandlerOptions,
  ): AsyncOperationResult<PropertyKey[]>;
  apply(
    target: unknown,
    thisArg: unknown,
    args: readonly unknown[],
    options: HandlerOptions,
  ): AsyncOperationResult;
  invoke(
    target: unknown,
    thisArg: unknown,
    propertyKey: PropertyKey,
    args: readonly unknown[],
    options: HandlerOptions,
  ): AsyncOperationResult;
  construct(
    target: unknown,
    args: readonly unknown[],
    newTarget: unknown,
    options: HandlerOptions,
  ): AsyncOperationResult<object>;
  set(
    target: unknown,
    propertyKey: PropertyKey,
    value: unknown,
    receiver: unknown,
    options: HandlerOptions,
  ): AsyncOperationResult<boolean>;
  deleteProperty(
    target: unknown,
    propertyKey: PropertyKey,
    options: HandlerOptions,
  ): AsyncOperationResult<boolean>;
  optional(
    target: unknown,
    continuation: (nonNullish: unknown) => unknown,
    options: HandlerOptions,
  ): AsyncOperationResult;
};
```

Forwarding is tracked separately from target-to-handler association. The
ponyfill follows the forwarding forest and path-splitting `shorten` model in
`src/handled-promise.js`: resolution records a forwarding edge, and dispatch
shortens to the most-resolved known identity before selecting a handler or
local fallback. A pending associated promise can still receive pipelined
operations through its handler; settlement observation records its edge so
later operations dispatch against the resolution. `makeAsyncReflect` delegates
to `makeAsyncHandler()` by default,
while callers that need an `AsyncTargetFactory` share its handler table with an
explicitly constructed handler. `Proxy.async` preserves original target
identity through that reflect boundary while retaining its lazy one-property
cache and call-receiver checks. For pipelined send-only operations, the client
retains the inner completion promise to supply the next operation, but exposes
only the queue acknowledgement to callers. RPC-specific hardening belongs in a
future custom handler harness, not in the local fallback.

# **\#1 \- AsyncTargetFactory**

Attaching an eventual handler to a `HandledPromise` can be done upon its construction. More baroquely, code within a `HandledPromise`’s executor can use its third argument (resolveWithPresence) to attach a handler to a fresh Object or Proxy.

The new `AsyncTargetFactory` encapsulates an async handler, and its methods
create various kinds of fresh objects with that handler attached. The handler
attachment is only used by async operations; no user code can directly inspect
the handler when provided one of the created objects. The ponyfill obtains the
constructor from `makeAsyncTargetFactoryConstructor(asyncHandlers)` so it can
share the same association table as `makeAsyncHandler(asyncHandlers)`. A future
global installation may expose the resulting constructor directly as
`AsyncTargetFactory`.

*Attach async handlers to fresh objects*

# **HandledPromise handlers (old)**

```ts
// Create a HandledPromise handler that intercepts some eventual traps.
const hpHandler = { applyMethod(x, prop, args) { … } };

// Attach a HandledPromise handler to a fresh Promise
const pr = new HandledPromise((resolve, reject) => { … }, hpHandler);

// …or to a fresh Object
let obj;
new HandledPromise((res, rej, resWithPresence) => (obj = resWithPresence(hpHandler)));

// …or to a fresh Proxy
const proxyOpts = { proxy: { handler: proxyHandler, target: proxyTarget } };
let proxy;
new HandledPromise((res, rej, resWP) => (proxy = resWP(hpHandler, proxyOpts)));
```

# **AsyncTargetFactory (new)**

```ts
const asyncHandlers = new WeakMap();
const dispatchingHandler = makeAsyncHandler(asyncHandlers);
const pReflect = makeAsyncReflect(Promise, dispatchingHandler);
const E = makeAsyncClient(Promise, pReflect);
const AsyncTargetFactory = makeAsyncTargetFactoryConstructor(asyncHandlers);

const evHandler = {
  invoke(target, thisArg, propertyKey, args, options) { … },
}; // an asynchronous handler
const asyncTargetFactory = new AsyncTargetFactory(evHandler); // an asynchronous target factory

// Attach the async handler to a fresh Promise
const pr = asyncTargetFactory.promiseResolve(resolution);

// …or to a fresh Object  
const obj = asyncTargetFactory.objectCreate(null);

// …or to a fresh Proxy  
const proxy = asyncTargetFactory.newProxy(proxyTarget, proxyHandler);

// …or to a fresh revocable Proxy  
const { proxy, revoke } = asyncTargetFactory.proxyRevocable(proxyTarget, proxyHandler);
```

## AsyncTargetFactory (new) cont’d

```ts
// …or to a fresh Function
const func = asyncTargetFactory.functionCreate(wrappedFunction);

// …or to a fresh PromiseStep (next section)
const promiseStep = asyncTargetFactory.promiseWatch(resolution, watcher, ...context);
```

# **\#0 \- Promise.watch**

The `HandledPromise` implementation tracks forwarding between promises and presences. This enables eventual operations to find the most resolved eventual handler for a given promise and promptly send messages to that handler. This mechanism comes with tradeoffs: it requires using `HandledPromises` instead of platform Promises wherever possible, otherwise forwarding cannot be observed.

Non-thenable `PromiseSteps` delimit high-latency ("remote") resolutions in a simpler way: using them for all remote operations prevents the platform’s await from blocking on remote eventual operations. Instead, await returns a PromiseStep or final result, either of which can be targets for other eventual operations. The `Promise.watch` function allows monitoring of fulfillments and rejections, as well as internal promise forwarding (whose detection is a necessary building block for a "promise pipelining" optimization).

We propose that JavaScript platform Promises should allow user code to track forwarding, so that promise pipelining can be implemented directly.

*Promise pipelining optimization as a shim*

# **Promise.watch (methods)**

```ts
// Object for subscribing to a Promissory's lifecycle events.
// Watching a non-Promissory only ever calls onFulfilled.
type PromissoryWatcher<F, C extends unknown[] = [], TResult1 = F, TResult2 = never> = {
  onForwarded?: (next: Promissory, ...context: C) => void;
  onFulfilled?: (fulfilment: F, ...context: C) => TResult1;
  onRejected?: (reason: any, ...context: C) => TResult2;
};

interface PromiseConstructor { // Static methods added to globalThis.Promise
  // Create a record of a pending PromiseStep, and its resolver (with both
  // resolver.resolve(_) and resolver.reject(_) methods).
  stepWithResolver<T>(): {
    step: PromiseStep<T>,
    resolver: Resolver<T>,
  };

  // Return a step for the settlement of optValue, chained through the onFulfilled
  // or onRejected watcher methods if any. Invoke onForwarded whenever possible.
  watch<T, C extends unknown[] = [], TR1 = Fulfilled<T>, TR2 = never>(
    optValue?: T,
    watcher?: PromissoryWatcher<Fulfilled<T>, C, TR1, TR2>,
    ...context: C // provide additional arguments to watcher methods
  ): PromiseStep<Fulfilled<TR1> | Fulfilled<TR2>>;
};
```

# **Promise.watch (types)**

```ts
// Types that are conceptually similar to Promise.

type Promissory<T = unknown> = PromiseLike<T> | PromiseStep<T> | Vow<T>; // …etc

// Extract the final fulfilment type from a chain of Promissories.
type Fulfilled<T> = T extends Promissory<infer U> ? Fulfilled<U> : T;

// Object whose resolve method forwards or settles a PromiseStep with F, or its
// reject method rejects the PromiseStep.
type Resolver<F> = {
  resolve(value: F | Promissory<F>): void;
  reject(reason: any): void;
};

```

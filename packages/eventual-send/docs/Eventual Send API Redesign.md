# **Eventual Send API Redesign**

Decomposing HandledPromise into coherent pieces for standardization

Michael FIG [mfig@agoric.com](mailto:mfig@agoric.com), 2023-06-27  
Last updated: 2026-09-21

# **HandledPromise in Pieces**

HandledPromise as defined in https://github.com/tc39/proposal-eventual-send is a collection of intertwingled features.

We can define that functionality in terms of distinct components.

Even better, they can be layered.

* \#3 \- Concise eventual client API  
* \#2 \- Distinct eventual operations  
* \#1 \- Attach eventual handlers to fresh objects  
* \#0 \- PromiseSteps to enable pipelining

# **\#3 \- Promise.client / E2 sketch**

Most uses of eventual send can be accomplished by the eventual send client API. It is only library authors that need to understand the deeper layers.

The client API is currently only provided by a non-standard export (E) from the Endo eventual send shim. The new design will standardize a basic client available on the globals, which user-level code can rely on without being tied to Endo’s implementation of the shim.

This split allows the introduction of changes in the standard client that would break the Endo client, such as leveraging support from the Promise.watch implementation (layer \#0).

The current `packages/eventual-send/src/E2.js` sketch refines the client API as a family of small proxy entry points:

* `E(x)` is exactly `E.Once(x)`.
* `Once` permits at most one property access and at most one function or method call before yielding a promise-like result.
* Pipelining beyond that one step is explicit: either wrap an intermediate result with another `E(...)`, or select a chaining proxy with `E.Send(x)`, `E.SendOnly(x)`, `E.Optional(x)`, or the corresponding `.then` controls.
* The `.then` property is both the normal awaitable surface and the control surface for selecting the next operation mode: `.then.Once`, `.then.Send`, `.then.SendOnly`, and `.then.Optional`.

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
const pr4 = await E(E.get(E(x, opts)(...args)))[subProp])[method](...args2);
```

# **Promise.client / E2 sketch (new)**

```ts
// Obtain the promise client API. In the E2 sketch, this has the shape of E.
const { client: E } = Promise;

// One-step eventual get. E(x) is E.Once(x).
const pr = await E(x)[prop];

// One-step eventual apply (function call).
const pr2 = await E(x)(...args);

// One-step eventual invoke (method call).
const pr3 = await E(x)[prop](...args);

// One-step mode does not keep exposing arbitrary subproperties.
// Continue explicitly by nesting E around the intermediate promise.
const pr4 = await E(E(x)[prop])[subProp](...args2);

// Or choose a chaining proxy to make pipelining explicit.
const pr5 = await E.Send(x)[prop][subProp][method](...args2);

// The same controls are available from the thenable surface.
const pr6 = await E(x)[prop].then.Send[subProp][method](...args2);

// Optional mode short-circuits nullish targets to undefined.
const maybe = await E.Optional(x)[prop][subProp](...args);

// SendOnly queues the sends and discards the eventual result.
const ignored = E.SendOnly(x)[prop][subProp](...args);
await ignored; // Promise<void>
```

# **\#2 \- Promise.reflect**

The eventual operations invoked by the eventual client are implemented as globally-available static methods, much like how normal JS operations are available as methods of globalThis.Reflect.

The old operation names were chosen to avoid conflicting with methods on the `HandledPromise` constructor’s function prototype. The new names are not properties on a function, and thus can be more conventional.

Also, the new API allows for a standard "eventual options" final argument to each operation, and reserves arguments after the options for future standards.

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

# **Promise.reflect (new)**

```ts
// Obtain operations
const { reflect: pReflect } = Promise;

// Eventual get (property access)
const pr = pReflect.get(x, prop, opts); // Promise<T>

// Eventual apply (function call)
const pr2 = pReflect.apply(x, args, opts); // Promise<T>

// Eventual invoke (method call)
const pr3 = pReflect.invoke(x, prop, args, opts); // Promise<T>

const pr4 = pReflect.set(x, prop, value, opts); // Eventual set
const pr5 = pReflect.delete(x, prop, opts); // Eventual delete
```

# **\#1 \- Proxy.eventual**

Attaching an eventual handler to a `HandledPromise` can be done upon its construction. More baroquely, code within a `HandledPromise`’s executor can use its third argument (resolveWithPresence) to attach a handler to a fresh Object or Proxy.

The new Proxy.eventual encapsulates an eventual handler, and its methods create various kinds of fresh objects with the handler attached. The handler attachment is only used by the eventual operations; no user code can directly inspect the eventual handler when provided one of the created objects.

*Attach eventual handlers to fresh objects*

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

# **Proxy.eventual (new)**

```ts
const evHandler = { invoke(x, prop, args) { … } }; // an eventual handler  
const evFactory = new Proxy.eventualFactory(evHandler); // an eventual factory

// Attach the eventual handler to a fresh Promise  
const pr = evFactory.promiseResolve(resolution);

// …or to a fresh Object  
const obj = evFactory.objectCreate(null);

// …or to a fresh Proxy  
const proxy = evFactory.newProxy(proxyTarget, proxyHandler);

// …or to a fresh revocable Proxy  
const { proxy, revoke } = evFactory.proxyRevocable(proxyTarget, proxyHandler);
```

## Proxy.eventual (new) cont’d

```ts
// …or to a fresh Function
const func = evFactory.functionCreate(wrappedFunction);

// …or to a fresh PromiseStep (next section)
const promiseStep = evFactory.promiseWatch(resolution);
```

# **\#0 \- Promise.watch**

The `HandledPromise` implementation tracks forwarding between promises and presences. This enables eventual operations to find the most resolved eventual handler for a given promise and promptly send messages to that handler. This mechanism comes with tradeoffs: it requires using `HandledPromises` instead of platform Promises wherever possible, otherwise forwarding cannot be observed.

Non-thenable `PromiseSteps` delimit high-latency ("remote") resolutions in a simpler way: using them for all remote operations prevents the platform’s await from blocking on remote eventual operations. Instead, await returns a PromiseStep or final result, either of which can be targets for other eventual operations. The `Promise.watch` function allows monitoring of fulfillments and rejections, as well as internal promise forwarding (whose detection is a necessary building block for a "promise pipelining" optimization).

We propose that Javascript platform Promises should allow user code to track forwarding, so that promise pipelining can be implemented directly.

*Promise pipelining optimization as a shim*

# **Promise.watch (methods)**

```ts
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
    …context: C // provide additional arguments to watcher methods
  ): PromiseStep<Fulfilled<TR1> | Fulfilled<TR2>>;
};
```

# **Promise.watch (types)**

```ts
// Types that are conceptually similar to Promise.

type Promissory = PromiseLike | PromiseStep | Vow; // …etc

// Extract the final fulfilment type from a chain of Promissories. |
type Fulfilled = T extends Promissory ? Fulfilled : T; |

// Object whose resolve method forwards or settles a PromiseStep with F, or its reject  
// method rejects the PromiseStep.  
type Resolver = { resolve(value: F | Promissory): void; reject(reason: any): void };

// Object for subscribing to Promissory’s lifecycle events.  
// Watching a non-Promissory only ever calls onFulfilled.  
type PromissoryWatcher\<F, C extends unknown\[\] = \[\], TResult1 = F, TResult2 = never\> = {  
onForwarded?: (next: Promissory, …context: C) =\> void; // when more-resolved detected  
onFulfilled?: (fulfilment: F, …context: C) =\> TResult1; // once when completely fulfilled  
onRejected?: (reason: any, …context: C) =\> TResult2; // once when rejected  
};
```

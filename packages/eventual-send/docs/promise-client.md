# E2 Implementation Plan

This plan starts from `src/E2.js` and `docs/Eventual Send API Redesign.md`.
Together they provide enough design information to begin a test-driven design
cycle for the local `Promise.client` shim, provided we keep the first
implementation intentionally narrow:

- no HandledPromise integration;
- no eventual proxy or presence-handler support;
- no Promise.watch or PromiseStep support;
- native Promise scheduling only;
- local objects, functions, primitives, and native promise/thenable targets only.

The current sketch is sufficient for the user-facing shape of the API, the
distinction between one-step and chaining sends, and the type expectations. It
is not yet sufficient for several edge cases. Those are flagged under
"Open questions" so they can be answered when tests or implementation get
stuck.

## Target API

Create a standalone client:

```js
const E = makePromiseClient();
E.Send
E.SendOnly
E.Optional
```

and control proxies on the `then` functions returned by E proxy nodes:

```js
E(x).then.Send
E(x).then.SendOnly
E(x).then.Optional
```

The default client entry point is the only one-step entry:

```js
const E = makePromiseClient();
await E(obj).method(arg);
```

The first implementation is a ponyfill. It should export a function that creates
the implementation standalone and leaves it up to the caller to install the
components somewhere useful, for example on `Promise.client`.
The `.then` controls are only attached to E proxy-owned then functions. The
ponyfill intentionally does not provide controls for arbitrary native promise
`.then` functions, since relying on the underlying native `.then` receiver path
is risky.

## Semantics From The Sketch

`E(x)` is the default one-step form. It permits:

- zero or one property access;
- zero or one function call on a callable target;
- zero or one method call after the property access;
- await/then on the resulting promise-like value.

Examples:

```js
await E(obj).method(arg);
await E(obj).prop;
await E(fn)(arg);
```

`Send` is the explicit chaining/pipelining mode. It keeps exposing property and
call proxies, so a whole chain can be expressed without nested `E(...)` calls:

```js
await E.Send(obj).a.b.c(arg);
await E(obj).a.then.Send.b.c(arg);
```

`SendOnly` is like `Send` for queueing, but discards the eventual result:

```js
await E.SendOnly(counter).incr(1); // resolves to undefined
```

`Optional` is spiritually similar to plain JavaScript `?.`. It checks whether
the predecessor is nullish. If so, the remaining property/call chain is skipped
and awaits as `undefined`; otherwise the chain proceeds as intended:

```js
await E(target).then.Optional.method
  .then.Optional(...args)
  .then.Optional.toString();
```

The `NullPrototype` type trick in `E2.js` is only a TypeScript workaround. The
runtime must always use normal JavaScript property lookup, including inherited
properties and Object prototype methods.

All operations must move to a future turn before reading target properties,
target methods, or a user-supplied thenable's `then`.

Delete and set operations wait for the reflect layer. The basic client ponyfill
only covers get, function call, method call, chaining controls, optional
controls, and send-only queueing.

## Proposed Runtime Model

Implement a small `makePromiseClient(PromiseCtor = Promise)` helper.

The helper returns a hardened callable `client` with own properties `Send`,
`SendOnly`, and `Optional`. It does not mutate `Promise`; callers that want a
global-style shim can install the returned client themselves.

Represent each expression as a proxy node:

```js
{
  targetP: Promise<unknown>,
  sendMode: 'send' | 'sendOnly',
  optional: boolean,
  recursion: 'shallow' | 'deep',
  receiverToken: object,
}
```

The proxy target should be callable so `E(x)(...args)` can work. Its proxy
handler implements:

- `get`: property access, `.then`, and selected control properties;
- `apply`: function call or method call depending on whether the node was
  produced by property access;
- minimal invariants needed for `await`, `Promise.resolve`, and AVA assertions.

For `E(x)`, property access returns a one-step E node. Calling it returns an E
node that can be awaited, but further ordinary property access rejects with
`Cannot pipeline further`. Select `.then.Send`, `.then.SendOnly`, or
`.then.Optional` to continue chaining, or wrap the intermediate node with
`E(...)`.

For `Send`, property access and calls return deep nodes so the chain remains
proxy-addressable until awaited.

For `SendOnly`, calls and property sends should be queued in a future turn and
the returned promise should resolve to `undefined` once the operation is queued.
Rejections from the queued operation are suppressed with `.catch(() => {})`.
The only way `SendOnly` should throw is if the operation cannot be queued, which
this basic implementation does not model because it has no custom operation
handling.

For `Optional`, the selected get or call gates on the nullishness of its
predecessor. If the predecessor resolves to `null` or `undefined`, the chain
enters a skipped state: later gets and calls in that chain do no work and the
eventual result is `undefined`. If the predecessor is present, the chain
continues normally with the selected recursion mode. Optional method calls also
short-circuit if the selected method is nullish. Selecting `.then.Optional`
preserves the current send mode, so `SendOnly` remains send-only.

## E Proxy `then` Controls

`E2.js` models controls as properties of `.then`:

```js
const ePromise = Promise.resolve().then(() => x);
return ePromise.then[method];
```

For the shim, define lazy accessors on the then function returned by each E
proxy node for:

```js
Send
SendOnly
Optional
```

These controls do not live on native promise `.then` functions. The ponyfill
does not expose a `Promise.prototype.then` accessor shim; users who want
controls must enter through the E proxy.

## Test-Driven Cycle

Create `test/e2.test.js`. Keep it independent from `HandledPromise` and the
existing `E` tests. Import only the E2 shim and AVA.

Current status: phases 1 through 8 are covered for the intentionally narrow
ponyfill scope. The policy decisions for this scope are recorded under
"Resolved Design Choices".

### Phase 1: installation and shape

Tests:

- importing the module does not mutate `Promise`;
- `makePromiseClient()` returns a callable client;
- `E.Send`, `E.SendOnly`, and `E.Optional` are callable;
- `E.Once` is absent;
- shim-created proxy results expose `.then.Send`, `.then.SendOnly`, and
  `.then.Optional`;
- `.then.Once` is absent;
- native promise `.then` functions do not expose `Send`, `SendOnly`, or
  `Optional`.

Implementation:

- add `makePromiseClient`;
- define the top-level client object and mode-specific entry points;
- add enough node/proxy creation for shape tests;
- keep `.then` controls scoped to E proxy-owned then functions.

### Phase 2: future-turn discipline

Tests:

- `E(thenable)` does not synchronously read `then`;
- `E(obj).prop` does not synchronously read `prop`;
- `E(obj).method(arg)` does not synchronously call `method`;
- rejections propagate through the returned promise.

Implementation:

- normalize targets with `Promise.resolve().then(() => target)`;
- perform get/apply work from promise continuations only.

### Phase 3: one-step operations

Tests:

- `await E(obj).prop` returns a property;
- `await E(fn)(...args)` applies a function target;
- `await E(obj).method(...args)` invokes with `this === obj`;
- extracted method proxies reject or throw when called with the wrong receiver;
- missing methods reject with the JavaScript error produced by normal property
  lookup and function application;
- non-callable targets reject on apply;
- non-callable properties reject on method invocation.

Implementation:

- implement get and apply traps for shallow nodes;
- distinguish function-call nodes from method-call nodes;
- add receiver-token checks matching the `NeedThis` intent in `E2.js`.

### Phase 4: explicit chaining with Send

Tests:

- `await E.Send(obj).a.b.c()` pipelines through multiple gets and a call;
- `await E(obj).a.then.Send.b.c()` continues from a one-step result;
- nested `E(awaitedOrPromised)` remains a supported explicit alternative;
- errors in any step reject the final promise.

Implementation:

- implement deep recursion mode;
- make get/apply return new deep nodes until awaited.

### Phase 5: Optional

Tests:

- `await E.Optional(null).a` resolves to `undefined`;
- `await E.Optional(undefined).a` resolves to `undefined`;
- `await E.Optional(undefined).a.b()` resolves to `undefined`;
- `await E.Optional(undefined).then.Optional.a.b()` resolves to `undefined`;
- `await E(target).then.Optional.method.then.Optional(...args).then.Optional.toString()`
  mirrors `target?.method?.(...args)?.toString()`;
- non-nullish values behave like `Send`;
- optional mode preserves the current send mode through `.then.Optional`.

Implementation:

- represent optional short-circuiting with an internal skipped-chain sentinel
  that awaits as `undefined`;
- let subsequent gets and calls on a skipped chain keep returning skipped nodes;
- preserve the existing send mode when applying `.then.Optional`.

### Phase 6: SendOnly

Tests:

- `await E.SendOnly(obj).method()` resolves to `undefined`;
- side effects are queued for a later turn;
- return values and thrown fulfillment values from successful sends are ignored;
- thrown errors from queued operations are suppressed.

Implementation:

- execute the queued operation;
- return a promise that resolves when the operation is queued;
- suppress the queued operation with `.catch(() => {})`.

### Phase 7: primitive and inherited surface behavior

Tests:

- `await E(2345).toFixed()` works;
- `await E('abc').charAt(1)` works;
- `await E({}).toString()` works through normal inherited property lookup;
- `E(null).toString` rejects because nullish targets have no property lookup.

Implementation:

- rely on normal property lookup for primitives where appropriate;
- do not add Object-prototype filtering.

### Phase 8: hardening and property descriptors

Tests:

- client and mode functions are frozen or at least non-extensible if that is the
  intended Endo convention;
- client mode properties are non-enumerable and non-writable;
- no package entry point mutates Promise; installation is caller-owned.
- arguments and fulfilled results are hardened.

Implementation:

- define client properties with explicit descriptors;
- harden arguments and fulfilled results;
- use `@endo/harden` and `@endo/assert` where helpful. The shims can be
  decoupled from running under SES later.

## Resolved Design Choices

These decisions bound the current ponyfill:

1. Arbitrary native promises do not support `somePromise.then.Send`; controls
   remain on E proxy-owned then functions only.

2. Arguments and fulfilled results are hardened.

3. `src/promise-client.js` remains internal/test-only for now rather than
   becoming a package subpath export.

## First Commit Shape

The first implementation commit was kept small:

- add `test/e2.test.js` with Phase 1 and Phase 2 tests;
- add an unexported ponyfill module at `src/promise-client.js`;
- make those tests pass without touching the existing `E`/`HandledPromise`
  implementation;
- leave the package public exports unchanged until the API surface stabilizes.

Subsequent test-driven passes filled out the remaining local ponyfill behavior
for one-step sends, explicit `Send` chaining, `Optional`, `SendOnly`, primitive
and inherited lookup, and hardening/property descriptors.

# Async Client Implementation Plan

This plan starts from `src/E2.js` and `docs/Eventual Send API Redesign.md`.
Together they provide enough design information for the completed local
`Proxy.async` baseline and its next integration with dispatching async handlers.
The completed baseline is intentionally narrow:

- no HandledPromise integration;
- no eventual proxy or presence-handler support;
- no Promise.watch or PromiseStep support;
- native Promise scheduling only;
- local objects, functions, primitives, and native promise/thenable targets only.

The handler integration described in `docs/async-handler.md` supersedes these
limitations without discarding the tested client syntax and lazy operation
model. In particular, that integration must preserve original target identity
until `Reflect.async` dispatch and use the forwarding/`shorten` model from
`src/handled-promise.js`.

The current implementation and tests establish the user-facing shape, the
distinction between one-step and chaining sends, and the type expectations for
the local baseline. Handler dispatch, target forwarding, and PromiseStep
integration belong to the later phases in `docs/async-handler.md`.

## Target API

Create a standalone client:

```js
const E = makeAsyncClient();
E.Send
E.SendOnly
E.Optional
```

and control proxies on the `then` functions returned by E proxy nodes:

```js
E(x).then.Send
E(x).then.SendOnly
E(x).then.Optional
E(x).then.Meta(updateOptions)
```

The default client entry point is the only one-step entry:

```js
const E = makeAsyncClient();
await E(obj).method(arg);
```

The first implementation is a ponyfill. It should export a function that creates
the implementation standalone and leaves it up to the caller to install the
components somewhere useful, for example on `Proxy.async`.
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

`Meta` updates immutable metadata for the following segment without changing
send mode or optional state:

```js
await E.Send(target, { senderContext: {}, harden: 'none' })
  .method()
  .then.Meta(oldOptions => ({
    ...oldOptions,
    senderContext: { ...oldOptions.senderContext, traceId },
  }))
  .nextMethod();
```

The `NullPrototype` type trick in `E2.js` is only a TypeScript workaround. The
runtime must always use normal JavaScript property lookup, including inherited
properties and Object prototype methods.

All operations must move to a future turn before reading target properties,
target methods, or a user-supplied thenable's `then`.

Set and delete are not part of the concise client surface. They are available
through `Reflect.async`; the client ponyfill covers get, function call, method
call, chaining controls, optional controls, and send-only queueing.

## Proposed Runtime Model

Implement a small
`makeAsyncClient(PromiseCtor = Promise, asyncReflect = makeAsyncReflect(PromiseCtor))`
helper.

The helper returns a hardened callable `client` with own properties `Send`,
`SendOnly`, and `Optional`. It does not mutate `Proxy`; callers that want a
global-style shim can install the returned client on `Proxy.async` themselves.

The completed local baseline represents each expression as a proxy node with
either a materialized target promise or one lazily cached property name:

```js
{
  targetP?: Promise<unknown>,
  metadataP: Promise<Metadata>,
  methodTargetP?: Promise<unknown>,
  methodKey?: PropertyKey,
  methodOptional?: boolean,
  sendMode: 'send' | 'sendOnly',
  optional: boolean,
  recursion: 'shallow' | 'deep' | 'none',
  expectedThis?: unknown,
}
```

Phase 10 replaces the root `targetP` with the original target identity until an
operation reaches `Reflect.async`. The one-property cache remains lazy: merely
forming `E(x).prop` records `prop`; awaiting `.then` performs a get, while
calling `(args)` performs one atomic invoke.

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
After queueing is acknowledged, rejection of that confirmed send-only
completion is suppressed with `.catch(() => {})`. No queue-stage or ordinary
send promise is silenced. The only way `SendOnly` should reject is if the
operation cannot be queued, which the local baseline cannot model because it
has no custom operation handling.

For `Optional`, the selected get or call gates on the nullishness of its
predecessor. If the predecessor resolves to `null` or `undefined`, the chain
enters a skipped state: later gets and calls in that chain do no work and the
eventual result is `undefined`. If the predecessor is present, the chain
continues normally with the selected recursion mode. Optional method calls also
short-circuit if the selected method is nullish. Selecting `.then.Optional`
preserves the current send mode, so `SendOnly` remains send-only.

For `Meta`, calling `.then.Meta(updateOptions)` materializes the predecessor
with its existing metadata and creates a deep continuation with a derived
`metadataP`. The updater receives a hardened, fully populated
`{ senderContext, harden }` record, runs exactly once in a future turn, and must
return a complete record synchronously. The returned metadata is copied,
hardened, and retained for later operations in that branch. Sibling branches
retain their own metadata. Updater failures and invalid asynchronous results
reject the updated branch.

## Async Client `then` Controls

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
Meta
```

These controls do not live on native promise `.then` functions. The ponyfill
does not expose a `Promise.prototype.then` accessor shim; users who want
controls must enter through the E proxy.

## Test-Driven Cycle

`test/async-client.test.js` remains independent from `HandledPromise` and the
existing `E` tests. It imports the async client ponyfill and AVA.

Current status: phases 1 through 9 are covered for the intentionally narrow
ponyfill scope. The policy decisions for this scope are recorded under
"Resolved Design Choices".

Future-turn assertions should wait with
`await new Promise(resolve => setImmediate(resolve))`; chained `await null`
expressions do not establish the intended event-loop boundary.

### Phase 1: installation and shape

Tests:

- importing the module does not mutate `Proxy`;
- `makeAsyncClient()` returns a callable client;
- `E.Send`, `E.SendOnly`, and `E.Optional` are callable;
- `E.Once` is absent;
- shim-created proxy results expose `.then.Send`, `.then.SendOnly`, and
  `.then.Optional`;
- shim-created proxy results expose callable `.then.Meta`;
- `.then.Once` is absent;
- native promise `.then` functions do not expose `Send`, `SendOnly`, or
  `Optional`, or `Meta`.

Implementation:

- add `makeAsyncClient`;
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
- completion errors after successful queueing are suppressed.

Implementation:

- execute the queued operation;
- return a promise that resolves when the operation is queued;
- suppress only the confirmed send-only completion with `.catch(() => {})`.

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
- no package entry point mutates Proxy; installation is caller-owned;
- arguments and fulfilled results are hardened.

Implementation:

- define client properties with explicit descriptors;
- harden arguments and fulfilled results;
- use `@endo/harden` and `@endo/assert` where helpful. The shims can be
  decoupled from running under SES later.

### Phase 9: metadata updates

Tests:

- `.then.Meta(updateOptions)` runs the updater once in a future turn;
- the updater receives sanitized and hardened defaulted metadata;
- predecessor operations use old metadata and following operations use updated
  metadata;
- updated metadata persists through the remainder of its branch;
- sibling branches retain independent metadata;
- updater failures reject only the updated branch;
- promise-returning updaters reject because metadata updates are synchronous;
- `Meta` preserves `SendOnly` and `Optional` behavior;
- `.then.Meta` is hardened and does not appear on native promise `then`
  functions.

Implementation:

- normalize entry options into a promised immutable `Metadata` record;
- derive a new metadata promise for each `Meta` continuation;
- materialize a lazy predecessor before installing metadata for its successor;
- carry metadata independently from recursion, send mode, and optional state;
- sanitize and harden both the updater input and returned metadata.

### Phase 10: async-handler integration

Tests:

- the client passes the original target identity through `Reflect.async`;
- an associated promise receives pipelined operations before assimilation;
- local unassociated promises retain the current eventual behavior;
- lazy property-name caching still distinguishes property gets from atomic
  method calls;
- `Send`, `SendOnly`, and `Optional` retain orthogonal recursion and send-mode
  behavior;
- only a confirmed `sendOnly` completion is silenced; queueing failures reject.

Implementation:

- store the original target in each root node instead of eagerly normalizing it
  with `Promise.resolve().then(() => target)`;
- preserve object and function identity, while continuing to box primitives at
  the operation boundary when normal property lookup requires it;
- defer target following to `Reflect.async` and `makeAsyncHandler`;
- retain the existing one-property lazy cache, receiver checks, and skipped
  optional-chain sentinel;
- use the handler's queue/completion envelope to distinguish send-only queue
  acknowledgement from operation completion.

## Resolved Design Choices

These decisions bound the current ponyfill:

1. Arbitrary native promises do not support `somePromise.then.Send`; controls
   remain on E proxy-owned then functions only.

2. Arguments and fulfilled results are hardened.

3. `src/async-client.js` remains internal/test-only for now rather than
   becoming a package subpath export.

4. `Metadata` contains `senderContext` and `harden`. `.then.Meta` updates only
   those fields and preserves send mode, optional state, and branch isolation.

## First Commit Shape

The first implementation commit was kept small:

- add `test/async-client.test.js` with Phase 1 and Phase 2 tests;
- add an unexported ponyfill module at `src/async-client.js`;
- make those tests pass without touching the existing `E`/`HandledPromise`
  implementation;
- leave the package public exports unchanged until the API surface stabilizes.

Subsequent test-driven passes filled out the remaining local ponyfill behavior
for one-step sends, explicit `Send` chaining, `Optional`, `SendOnly`, primitive
and inherited lookup, and hardening/property descriptors.

/* eslint-disable no-lone-blocks, no-empty-function */
import { expectAssignable, expectType } from 'tsd';

import type { Passable, RemotableObject } from '@endo/pass-style';
import type { RemotableBrand } from '@endo/eventual-send';
import { M } from '@endo/patterns';
import type {
  TypeFromInterfaceGuard,
  TypeFromMethodGuard,
} from '@endo/patterns';

import { makeExo, defineExoClass, defineExoClassKit } from '../index.js';
import type { Guarded, GuardedKit } from '../src/types.js';

// ===== makeExo (no guard) =====

// Return type has concrete methods and is Passable
{
  const exo = makeExo('Foo', undefined, { sayHi: () => 'hi' });
  expectAssignable<Passable>(exo);
  expectType<() => string>(exo.sayHi);
  // @ts-expect-error -- functions are not passable
  expectAssignable<Passable>(exo.sayHi);
}

// this.self is typed as the exo instance
{
  const exo = makeExo('Foo', undefined, {
    greet(name: string) {
      // this.self has the same method types
      expectAssignable<{ greet: (s: string) => string }>(this.self);
      return `hello ${name}`;
    },
  });
  expectType<(name: string) => string>(exo.greet);
}

// ===== makeExo (with InterfaceGuard) =====

// Guard constrains method arg and return types
{
  const FooI = M.interface('Foo', {
    bar: M.call(M.string()).returns(M.nat()),
  });
  const foo = makeExo('Foo', FooI, {
    bar(name) {
      // TS infers name: string from the guard
      expectType<string>(name);
      return 42n;
    },
  });
  expectAssignable<Passable>(foo);
  expectType<(name: string) => bigint>(foo.bar);
}

// Guard-driven: wrong argument type is a compile error
{
  const FooI = M.interface('Foo', {
    bar: M.call(M.string()).returns(M.nat()),
  });
  // @ts-expect-error -- arg must be string, not number
  makeExo('Foo', FooI, {
    bar(n: number) {
      return 0n;
    },
  });
}

// Guard-driven: wrong return type is a compile error
{
  const FooI = M.interface('Foo', {
    bar: M.call().returns(M.nat()),
  });
  // @ts-expect-error -- must return bigint, not string
  makeExo('Foo', FooI, {
    bar(): string {
      return 'oops';
    },
  });
}

// Return type is Guarded<M>, which is Passable and has the methods
{
  const FooI = M.interface('Foo', {
    inc: M.call(M.nat()).returns(M.nat()),
  });
  const foo = makeExo('Foo', FooI, {
    inc(n) {
      return n + 1n;
    },
  });
  expectAssignable<RemotableObject>(foo);
  expectAssignable<RemotableBrand<any, any>>(foo);
  expectType<(n: bigint) => bigint>(foo.inc);
}

// ===== defineExoClass (no guard) =====

// Maker function returns a constructor that produces a Guarded exo
{
  const makeFoo = defineExoClass('Foo', undefined, (x: number) => ({ x }), {
    getX() {
      return this.state.x;
    },
    double() {
      return this.state.x * 2;
    },
  });
  const foo = makeFoo(42);
  expectAssignable<Passable>(foo);
  expectType<() => number>(foo.getX);
  expectType<() => number>(foo.double);
}

// this.state is typed from init return, this.self is typed
{
  defineExoClass('Counter', undefined, (start: number) => ({ count: start }), {
    increment() {
      expectType<{ count: number }>(this.state);
      expectAssignable<{ increment: () => void; decrement: () => void }>(
        this.self,
      );
      this.state.count += 1;
    },
    decrement() {
      this.state.count -= 1;
    },
  });
}

// ===== defineExoClass (with InterfaceGuard) =====

// Guard constrains methods; init types flow through to state
{
  const CounterI = M.interface('Counter', {
    increment: M.call().returns(M.undefined()),
    read: M.call().returns(M.nat()),
  });
  const makeCounter = defineExoClass(
    'Counter',
    CounterI,
    (start: bigint) => ({ count: start }),
    {
      increment() {
        expectType<{ count: bigint }>(this.state);
        this.state.count += 1n;
      },
      read() {
        return this.state.count;
      },
    },
  );
  const counter = makeCounter(0n);
  expectAssignable<Passable>(counter);
  expectType<() => undefined>(counter.increment);
  expectType<() => bigint>(counter.read);
}

// Guard-driven: wrong return type is a compile error
{
  const FooI = M.interface('Foo', {
    get: M.call().returns(M.string()),
  });
  // @ts-expect-error -- must return string, not number
  defineExoClass('Foo', FooI, () => ({}), {
    get(): number {
      return 42;
    },
  });
}

// .returns() with no args: TypeFromMethodGuard produces () => undefined
{
  const mg = M.call().returns();
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<() => undefined>(null as unknown as Fn);
}

// .returns() with no args defaults to undefined return type
{
  const FooI = M.interface('Foo', {
    doSomething: M.call().returns(),
    getName: M.call().returns(M.string()),
  });
  const makeFoo = defineExoClass('Foo', FooI, () => ({}), {
    doSomething() {},
    getName() {
      return 'foo';
    },
  });
  const foo = makeFoo();
  // Implementation returns void; Guarded<M> preserves the inferred impl type.
  // TypeFromMethodGuard correctly resolves .returns() to () => undefined
  // (see test above), but defineExoClass infers M from the implementation.
  expectType<() => void>(foo.doSomething);
  expectType<() => string>(foo.getName);
}

// .returns() on callWhen defaults to Promise<undefined>
{
  const AsyncI = M.interface('Async', {
    fire: M.callWhen(M.await(M.string())).returns(),
    fetch: M.callWhen().returns(M.string()),
  });
  const exo = makeExo('Async', AsyncI, {
    async fire(_s) {},
    async fetch() {
      return 'data';
    },
  });
  // async void impl → Promise<void>, not Promise<undefined>
  expectType<(s: string) => Promise<void>>(exo.fire);
  expectType<() => Promise<string>>(exo.fetch);
}

// Complex guard similar to ChainStorageNode
{
  const StorageNodeI = M.interface('StorageNode', {
    setValue: M.callWhen(M.string()).returns(),
    getPath: M.call().returns(M.string()),
    getStoreKey: M.callWhen().returns(M.record()),
    makeChildNode: M.call(M.string())
      .optional(M.splitRecord({}, { sequence: M.boolean() }, {}))
      .returns(M.remotable('StorageNode')),
  });
  const makeNode = defineExoClass(
    'StorageNode',
    StorageNodeI,
    (path: string) => ({ path, data: '' }),
    {
      async setValue(val) {
        expectType<string>(val);
        this.state.data = val;
      },
      getPath() {
        return this.state.path;
      },
      async getStoreKey() {
        return { storeName: 'test', storeSubkey: this.state.path } as any;
      },
      makeChildNode(name, _opts?) {
        expectType<string>(name);
        return undefined as any;
      },
    },
  );
  const node = makeNode('/root');
  expectType<(val: string) => Promise<void>>(node.setValue);
  expectType<() => string>(node.getPath);
}

// ===== defineExoClassKit (no guard) =====

// Kit has distinct facets; each is Passable; this.facets (not this.self)
{
  const makeKit = defineExoClassKit(
    'MyKit',
    undefined,
    (x: number) => ({ x }),
    {
      public: {
        getX() {
          return this.state.x;
        },
      },
      admin: {
        setX(val: number) {
          this.state.x = val;
        },
      },
    },
  );
  const kit = makeKit(0);
  expectAssignable<Passable>(kit);
  expectAssignable<Passable>(kit.public);
  expectAssignable<Passable>(kit.admin);
  expectType<() => number>(kit.public.getX);
  expectType<(val: number) => void>(kit.admin.setX);
}

// this.facets is typed as the full GuardedKit; this.self does not exist
{
  defineExoClassKit('MyKit', undefined, () => ({}), {
    alice: {
      ping() {
        // this.facets gives typed access to all facets
        expectAssignable<{
          alice: { ping: () => void };
          bob: { pong: () => void };
        }>(this.facets);
        this.facets.bob.pong();
      },
    },
    bob: {
      pong() {
        this.facets.alice.ping();
      },
    },
  });
}

// ===== defineExoClassKit (with InterfaceGuardKit) =====

// Guard constrains each facet independently
{
  const PublicI = M.interface('Public', {
    getData: M.call().returns(M.string()),
  });
  const AdminI = M.interface('Admin', {
    setData: M.call(M.string()).returns(M.undefined()),
  });
  const makeKit = defineExoClassKit(
    'Store',
    { public: PublicI, admin: AdminI },
    (initial: string) => ({ data: initial }),
    {
      public: {
        getData() {
          expectType<{ data: string }>(this.state);
          return this.state.data;
        },
      },
      admin: {
        setData(val) {
          expectType<string>(val);
          this.state.data = val;
        },
      },
    },
  );
  const kit = makeKit('hello');
  expectType<() => string>(kit.public.getData);
  expectType<(val: string) => undefined>(kit.admin.setData);
}

// Cross-facet method access is a type error (no index-signature leak)
{
  const makeKit = defineExoClassKit(
    'MyKit',
    undefined,
    (x: number) => ({ x }),
    {
      public: {
        getX() {
          return this.state.x;
        },
      },
      admin: {
        setX(val: number) {
          this.state.x = val;
        },
      },
    },
  );
  const kit = makeKit(0);
  // @ts-expect-error -- setX is only on the admin facet
  kit.public.setX;
  // @ts-expect-error -- getX is only on the public facet
  kit.admin.getX;
}

// Non-existent method on a single exo is a type error
{
  const exo = makeExo('Foo', undefined, { sayHi: () => 'hi' });
  // @ts-expect-error -- 'nope' does not exist on this exo
  exo.nope;
}

// Cross-facet access with guards is also a type error
{
  const PublicI = M.interface('Public', {
    getData: M.call().returns(M.string()),
  });
  const AdminI = M.interface('Admin', {
    setData: M.call(M.string()).returns(M.undefined()),
  });
  const makeKit = defineExoClassKit(
    'Store',
    { public: PublicI, admin: AdminI },
    (initial: string) => ({ data: initial }),
    {
      public: {
        getData() {
          return this.state.data;
        },
      },
      admin: {
        setData(val) {
          this.state.data = val;
        },
      },
    },
  );
  const kit = makeKit('hello');
  // @ts-expect-error -- setData is only on admin
  kit.public.setData;
  // @ts-expect-error -- getData is only on public
  kit.admin.getData;
}

// TS limitation: defineExoClassKit has a fallback overload that accepts
// `Record<FacetName, InterfaceGuard> | undefined` without enforcing method
// types against the guard.  When the typed overload's constraint fails,
// TypeScript silently falls through to the fallback overload.  As a result,
// wrong method argument types in kits are NOT caught at compile time.
// Only makeExo and defineExoClass (which have a stricter two-overload design)
// reliably enforce guard types today.

// ===== M.remotable<typeof Guard>() facet-isolated return types =====

// A kit where one facet returns another facet, typed via M.remotable<G>
{
  const PublicI = M.interface('Public', {
    getData: M.call().returns(M.string()),
  });
  const AdminI = M.interface('Admin', {
    getPublic: M.call().returns(M.remotable<typeof PublicI>('Public')),
  });
  const makeKit = defineExoClassKit(
    'Store',
    { public: PublicI, admin: AdminI },
    (initial: string) => ({ data: initial }),
    {
      public: {
        getData() {
          return this.state.data;
        },
      },
      admin: {
        getPublic() {
          return this.facets.public;
        },
      },
    },
  );
  const kit = makeKit('hello');
  const pub = kit.admin.getPublic();
  // The returned value is typed with getData method + remotable branding
  expectAssignable<{ getData: () => string }>(pub);
  expectAssignable<RemotableObject>(pub);
}

// ===== Passable assignability of kit results =====

{
  const kit = defineExoClassKit('foo', undefined, () => {}, {
    public: { sayHi: () => 'hi' },
  })();
  expectAssignable<Passable>(kit);
  expectAssignable<Passable>(kit.public);
  // @ts-expect-error -- functions are not passable
  expectAssignable<Passable>(kit.public.sayHi);
}

// ===== M.callWhen: async method guards =====
//
// M.callWhen() is the async counterpart to M.call().  The runtime:
//   1. Wraps the call so the observable return is always Promise<T>.
//   2. Awaits any M.await(pattern) arguments before invoking the
//      implementation, so the implementation receives the resolved value,
//      not the promise.
//   3. Passes M.promise() arguments straight through — the implementation
//      receives the Promise object itself (no unwrapping).

// M.callWhen with no args returns Promise<string>
{
  const mg = M.callWhen().returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<() => Promise<string>>(null as unknown as Fn);
}

// M.callWhen with M.await(pattern): implementation receives the awaited value
// M.await(M.nat()) → arg type is bigint (unwrapped), NOT Promise<bigint>
{
  const mg = M.callWhen(M.await(M.nat())).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(n: bigint) => Promise<string>>(null as unknown as Fn);
}

// M.promise() as a plain (non-awaited) arg: the runtime passes the Promise
// object straight through to the implementation (no unwrapping).
// M.promise() has default Payload `any`, and TFStructural's 'promise' branch
// produces Promise<any>.
{
  const mg = M.callWhen(M.promise()).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(p: Promise<any>) => Promise<string>>(null as unknown as Fn);
}

// M.callWhen with mixed args: M.await + plain pattern
{
  const mg = M.callWhen(M.await(M.nat()), M.string()).returns(M.boolean());
  type Fn = TypeFromMethodGuard<typeof mg>;
  // first arg awaited (bigint), second passed as-is (string)
  expectType<(n: bigint, s: string) => Promise<boolean>>(null as unknown as Fn);
}

// M.callWhen with an exo as awaited argument (M.await(M.remotable<typeof I>()))
// The implementation receives the typed exo object, not a Promise of one.
{
  const SourceI = M.interface('Source', {
    read: M.call().returns(M.string()),
  });
  const mg = M.callWhen(M.await(M.remotable<typeof SourceI>('Source'))).returns(
    M.nat(),
  );
  type Fn = TypeFromMethodGuard<typeof mg>;
  // arg: the exo object with read() method + remotable branding (already awaited)
  type Arg0 = Parameters<Fn>[0];
  expectAssignable<{ read: () => string }>(null as unknown as Arg0);
  expectAssignable<RemotableObject>(null as unknown as Arg0);
  // return: Promise<bigint>
  expectType<Promise<bigint>>(null as unknown as ReturnType<Fn>);
}

// M.callWhen returning an exo (M.remotable<typeof I>()) — return is Promise<ExoType>
{
  const ResultI = M.interface('Result', {
    getValue: M.call().returns(M.nat()),
  });
  const mg = M.callWhen().returns(M.remotable<typeof ResultI>('Result'));
  type Fn = TypeFromMethodGuard<typeof mg>;
  type Ret = ReturnType<Fn>;
  // Ret is Promise<{ getValue: () => bigint } & RemotableObject & ...>
  expectAssignable<Promise<{ getValue: () => bigint }>>(null as unknown as Ret);
}

// makeExo with M.callWhen: observable method returns Promise<T>,
// implementation uses async to return Promise<T> as required by the constraint.
// The runtime awaits M.await() args before invoking the implementation, so
// implementation parameters are the resolved (non-Promise) types.
{
  const AsyncI = M.interface('Async', {
    // getStringOf awaits its arg (any Passable), then converts to string
    getStringOf: M.callWhen(M.await(M.any())).returns(M.string()),
    // double awaits a nat, returns its double
    double: M.callWhen(M.await(M.nat())).returns(M.nat()),
  });

  type AsyncMethods = TypeFromInterfaceGuard<typeof AsyncI>;
  // getStringOf: implementation receives the awaited value (Passable), returns Promise<string>
  expectAssignable<(val: Passable) => Promise<string>>(
    null as unknown as AsyncMethods['getStringOf'],
  );
  // double: arg is bigint (awaited nat), return is Promise<bigint>
  expectAssignable<(n: bigint) => Promise<bigint>>(
    null as unknown as AsyncMethods['double'],
  );

  const exo = makeExo('Async', AsyncI, {
    async getStringOf(val) {
      // val: Passable — the awaited, unwrapped value (not a Promise)
      expectAssignable<Passable>(val);
      return String(val);
    },
    async double(n) {
      // n: bigint — awaited nat
      expectType<bigint>(n);
      return n * 2n;
    },
  });

  // Callers see Promise<T> returns on the exo object
  expectType<(val: Passable) => Promise<string>>(exo.getStringOf);
  expectType<(n: bigint) => Promise<bigint>>(exo.double);
  expectAssignable<Passable>(exo);
}

// defineExoClass with M.callWhen: state flows through, async return on observable
{
  const CounterI = M.interface('Counter', {
    // increment is fire-and-forget async (returns undefined)
    increment: M.callWhen(M.await(M.nat())).returns(M.undefined()),
    // read is synchronous
    read: M.call().returns(M.nat()),
  });

  const makeCounter = defineExoClass(
    'Counter',
    CounterI,
    (start: bigint) => ({ count: start }),
    {
      async increment(n) {
        // n: bigint — the awaited value (not a promise)
        expectType<bigint>(n);
        this.state.count += n;
      },
      read() {
        return this.state.count;
      },
    },
  );

  const counter = makeCounter(0n);
  // increment observable return is Promise<undefined>
  expectType<(n: bigint) => Promise<undefined>>(counter.increment);
  // read is synchronous as declared
  expectType<() => bigint>(counter.read);
}

// defineExoClassKit with M.callWhen: one facet's async method passes an exo
// from another facet to its caller via Promise return
{
  const DataI = M.interface('Data', {
    get: M.call().returns(M.string()),
  });
  const LoaderI = M.interface('Loader', {
    // loadData is async: awaits a nat key, returns the Data exo
    loadData: M.callWhen(M.await(M.nat())).returns(
      M.remotable<typeof DataI>('Data'),
    ),
  });

  const makeKit = defineExoClassKit(
    'Store',
    { data: DataI, loader: LoaderI },
    (initial: string) => ({ value: initial }),
    {
      data: {
        get() {
          return this.state.value;
        },
      },
      loader: {
        async loadData(key) {
          // key: bigint (awaited nat)
          expectType<bigint>(key);
          return this.facets.data;
        },
      },
    },
  );

  const kit = makeKit('hello');
  // loadData returns Promise<DataFacet> — typed with get() method
  type LoadResult = ReturnType<typeof kit.loader.loadData>;
  expectAssignable<Promise<{ get: () => string }>>(
    null as unknown as LoadResult,
  );
  expectAssignable<Promise<RemotableObject>>(null as unknown as LoadResult);
}

// ===== GuardedKit type helper =====

// GuardedKit maps each facet's methods to a Guarded remotable
{
  type F = {
    alice: { ping: () => void };
    bob: { pong: () => string };
  };
  type GK = GuardedKit<F>;
  expectAssignable<RemotableObject>(null as unknown as GK['alice']);
  expectAssignable<RemotableObject>(null as unknown as GK['bob']);
}

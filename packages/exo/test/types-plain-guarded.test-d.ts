/* eslint-disable no-lone-blocks, no-empty-function */
// eslint-disable-next-line import/no-extraneous-dependencies
import { expectAssignable, expectType } from 'tsd';
import type { Passable, RemotableObject } from '@endo/pass-style';
import type { RemotableBrand } from '@endo/eventual-send';
import { M } from '@endo/patterns';
import type { TypeFromMethodGuard } from '@endo/patterns';
import { makeExo, defineExoClass, defineExoClassKit } from '../index.js';

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

// Guard-driven: narrowed type parameter wins over wide implementation
// M.string<`agoric1${string}`>() narrows the arg to a template literal type.
// The guard type flows into the implementation via contextual typing,
// and callers see the narrowed type on the returned exo.
{
  const AddrI = M.interface('Addr', {
    setAddr: M.call(M.string<`agoric1${string}`>()).returns(),
    getAddr: M.call().returns(M.string<`agoric1${string}`>()),
  });
  const makeAddr = defineExoClass(
    'Addr',
    AddrI,
    () => ({ addr: '' as string }),
    {
      setAddr(a) {
        expectType<`agoric1${string}`>(a);
        this.state.addr = a;
      },
      getAddr() {
        return this.state.addr as `agoric1${string}`;
      },
    },
  );
  const addr = makeAddr();
  // Caller sees the narrowed guard types
  addr.setAddr('agoric1abc');
  // @ts-expect-error -- wide string is not assignable to `agoric1${string}`
  addr.setAddr('cosmos1xyz');
  expectType<() => `agoric1${string}`>(addr.getAddr);
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

// Guard-driven: wrong argument type in defineExoClass is a compile error
{
  const FooI = M.interface('Foo', {
    set: M.call(M.string()).returns(),
  });
  // @ts-expect-error -- arg must be string, not number
  defineExoClass('Foo', FooI, () => ({}), {
    set(val: number) {},
  });
}

// Guard-driven: missing method in defineExoClass is a compile error
{
  const FooI = M.interface('Foo', {
    get: M.call().returns(M.string()),
    set: M.call(M.string()).returns(),
  });
  // @ts-expect-error -- 'set' method is missing
  defineExoClass('Foo', FooI, () => ({}), {
    get() {
      return 'hi';
    },
  });
}

// NOTE: defineExoClassKit guard enforcement is NOT tested here because of
// a known TS limitation: when the typed overload's constraint fails,
// TypeScript silently falls through to the fallback overload which does
// not enforce method types against the guard.  See the "TS limitation"
// comment in the defineExoClassKit section below.

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

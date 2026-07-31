/* eslint-disable no-empty-function */
import { expectTypeOf } from 'expect-type';
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
      expectTypeOf(name).toEqualTypeOf<string>();
      return 42n;
    },
  });
  expectTypeOf(foo).toExtend<Passable>();
  expectTypeOf(foo.bar).toEqualTypeOf<(name: string) => bigint>();
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
        expectTypeOf(a).toEqualTypeOf<`agoric1${string}`>();
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
  expectTypeOf(addr.getAddr).toEqualTypeOf<() => `agoric1${string}`>();
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
  expectTypeOf(foo).toExtend<RemotableObject>();
  expectTypeOf(foo).toExtend<RemotableBrand<any, any>>();
  expectTypeOf(foo.inc).toEqualTypeOf<(n: bigint) => bigint>();
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
        expectTypeOf(this.state).toEqualTypeOf<{ count: bigint }>();
        this.state.count += 1n;
      },
      read() {
        return this.state.count;
      },
    },
  );
  const counter = makeCounter(0n);
  expectTypeOf(counter).toExtend<Passable>();
  expectTypeOf(counter.increment).toEqualTypeOf<() => void>();
  expectTypeOf(counter.read).toEqualTypeOf<() => bigint>();
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

// .returns() with no args: TypeFromMethodGuard produces () => void
// (See TFKindMap['undefined'] = void comment in type-from-pattern.ts.)
{
  const mg = M.call().returns();
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<() => void>();
}

// .returns() with no args defaults to a void return type
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
  // defineExoClass infers the implementation's ergonomic void return.
  expectTypeOf(foo.doSomething).toEqualTypeOf<() => void>();
  expectTypeOf(foo.getName).toEqualTypeOf<() => string>();
}

// .returns() on callWhen defaults to Promise<void>
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
  expectTypeOf(exo.fire).toEqualTypeOf<(s: string) => Promise<void>>();
  expectTypeOf(exo.fetch).toEqualTypeOf<() => Promise<string>>();
}

// ===== defineExoClassKit (with InterfaceGuardKit) =====

// Guard is provided but `F` is not narrowed by the guard contextually.
// `defineExoClassKit`'s `F` constraint is intentionally wide
// (`Record<FacetName, Methods>`) so that the impl's TS/JSDoc types are
// preserved through to the returned kit type.  Guard-driven param
// contextual narrowing inside method bodies (e.g. `setData(val)` getting
// `val: string` from the guard) is intentionally NOT applied for kits —
// it would silently coerce the impl's types and break downstream subtype
// matching for consumers like
// `LiquidityPoolKit['repayer']['repay']`.
//
// To get param types in a kit method, annotate them explicitly via JSDoc
// or TS — see the `setData(val: string)` form below.  Guard conformance
// is still verified at runtime by the guard machinery.
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
          expectTypeOf(this.state).toEqualTypeOf<{ data: string }>();
          return this.state.data;
        },
      },
      admin: {
        setData(val: string) {
          expectTypeOf(val).toEqualTypeOf<string>();
          this.state.data = val;
        },
      },
    },
  );
  const kit = makeKit('hello');
  expectTypeOf(kit.public.getData).toEqualTypeOf<() => string>();
  expectTypeOf(kit.admin.setData).toEqualTypeOf<(val: string) => void>();
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
  expectTypeOf(pub).toExtend<{ getData: () => string }>();
  expectTypeOf(pub).toExtend<RemotableObject>();
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

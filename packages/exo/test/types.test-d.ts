/* eslint-disable no-lone-blocks, no-empty-function */
import { expectAssignable, expectType } from 'tsd';

import type { Passable, RemotableObject } from '@endo/pass-style';
import type { RemotableBrand } from '@endo/eventual-send';
import { M } from '@endo/patterns';
import type { TypeFromInterfaceGuard } from '@endo/patterns';

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

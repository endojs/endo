/* eslint-disable no-lone-blocks */
import { expectTypeOf } from 'expect-type';
import type { Passable, RemotableObject } from '@endo/pass-style';
import { makeExo, defineExoClass, defineExoClassKit } from '../index.js';
import type { GuardedKit } from '../src/types.js';

// ===== makeExo (no guard) =====

// Return type has concrete methods and is Passable
{
  const exo = makeExo('Foo', undefined, { sayHi: () => 'hi' });
  expectTypeOf(exo).toExtend<Passable>();
  expectTypeOf(exo.sayHi).toEqualTypeOf<() => string>();
  // @ts-expect-error -- functions are not passable
  expectTypeOf(exo.sayHi).toExtend<Passable>();
}

// this.self is typed as the exo instance
{
  const exo = makeExo('Foo', undefined, {
    greet(name: string) {
      // this.self has the same method types
      expectTypeOf(this.self).toExtend<{ greet: (s: string) => string }>();
      return `hello ${name}`;
    },
  });
  expectTypeOf(exo.greet).toEqualTypeOf<(name: string) => string>();
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
  expectTypeOf(foo).toExtend<Passable>();
  expectTypeOf(foo.getX).toEqualTypeOf<() => number>();
  expectTypeOf(foo.double).toEqualTypeOf<() => number>();
}

// this.state is typed from init return, this.self is typed
{
  defineExoClass('Counter', undefined, (start: number) => ({ count: start }), {
    increment() {
      expectTypeOf(this.state).toEqualTypeOf<{ count: number }>();
      expectTypeOf(this.self).toExtend<{
        increment: () => void;
        decrement: () => void;
      }>();
      this.state.count += 1;
    },
    decrement() {
      this.state.count -= 1;
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
  expectTypeOf(kit).toExtend<Passable>();
  expectTypeOf(kit.public).toExtend<Passable>();
  expectTypeOf(kit.admin).toExtend<Passable>();
  expectTypeOf(kit.public.getX).toEqualTypeOf<() => number>();
  expectTypeOf(kit.admin.setX).toEqualTypeOf<(val: number) => void>();
}

// this.facets is typed as the full GuardedKit; this.self does not exist
{
  defineExoClassKit('MyKit', undefined, () => ({}), {
    alice: {
      ping() {
        // this.facets gives typed access to all facets
        expectTypeOf(this.facets).toExtend<{
          alice: { ping: () => void };
          bob: { pong: () => void };
        }>();
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

// ===== Passable assignability of kit results =====

{
  const kit = defineExoClassKit('foo', undefined, () => {}, {
    public: { sayHi: () => 'hi' },
  })();
  expectTypeOf(kit).toExtend<Passable>();
  expectTypeOf(kit.public).toExtend<Passable>();
  // @ts-expect-error -- functions are not passable
  expectTypeOf(kit.public.sayHi).toExtend<Passable>();
}

// ===== GuardedKit type helper =====

// GuardedKit maps each facet's methods to a Guarded remotable
{
  type F = {
    alice: { ping: () => void };
    bob: { pong: () => string };
  };
  type GK = GuardedKit<F>;
  expectTypeOf(null as unknown as GK['alice']).toExtend<RemotableObject>();
  expectTypeOf(null as unknown as GK['bob']).toExtend<RemotableObject>();
}

// ===== Regression: F-collapse on undefined guard kit =====
//
// The shape `{ helper: {}, public: {...} }` (mixing an empty facet with a
// populated one, plus a non-trivial init state) used to collapse `F` to its
// constraint default `Record<FacetName, Methods>` because the per-facet
// `F[K] & ThisType<...>` intersection prevented TS from back-inferring `F`.
// The kit's facet names disappeared entirely, breaking direct property
// access at the call site.  Reported in agoric-sdk packages/orchestration
// (progress.js) and packages/portfolio-contract (portfolio.exo.ts).
{
  const makeProgressTrackerKit = defineExoClassKit(
    'ProgressTrackerKit',
    undefined,
    () => ({
      currentValue: 0,
      done: false,
    }),
    {
      helper: {},
      public: {
        getCurrentValue() {
          // `this.state` should be the init return type, not `any` / `unknown`.
          expectTypeOf(this.state.currentValue).toEqualTypeOf<number>();
          expectTypeOf(this.state.done).toEqualTypeOf<boolean>();
          return this.state.currentValue;
        },
        markDone() {
          this.state.done = true;
        },
      },
    },
  );
  const kit = makeProgressTrackerKit();

  // Direct access by facet name must work — this is what regressed.
  expectTypeOf(kit.public.getCurrentValue).toEqualTypeOf<() => number>();
  expectTypeOf(kit.public.markDone).toEqualTypeOf<() => void>();

  // The empty facet still exists at runtime and at the type level.
  expectTypeOf(kit.helper).toExtend<RemotableObject>();

  // The pattern that broke in the wild:
  //   const makeProgressTracker = () => makeProgressTrackerKit().public;
  // — selecting a facet from a fresh kit instance.
  const makeOnlyPublic = () => makeProgressTrackerKit().public;
  expectTypeOf(makeOnlyPublic().getCurrentValue).toEqualTypeOf<() => number>();
}

// Regression: facet method that references another facet via `this.facets`
// must see the *concrete* facet shape, not `Record<FacetName, Methods>`.
{
  defineExoClassKit('CrossRefKit', undefined, () => ({ count: 0 }), {
    reader: {
      read() {
        return this.state.count;
      },
    },
    writer: {
      bump() {
        // Should be able to call reader.read() with its concrete signature.
        const current: number = this.facets.reader.read();
        this.state.count = current + 1;
      },
    },
  });
}

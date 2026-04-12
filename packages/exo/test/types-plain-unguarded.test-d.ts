/* eslint-disable no-lone-blocks, no-empty-function */
// eslint-disable-next-line import/no-extraneous-dependencies
import { expectAssignable, expectType } from 'tsd';
import type { Passable, RemotableObject } from '@endo/pass-style';
import { makeExo, defineExoClass, defineExoClassKit } from '../index.js';
import type { GuardedKit } from '../src/types.js';

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

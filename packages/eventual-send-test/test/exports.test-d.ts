import { expectTypeOf } from 'expect-type';
import type { ERef, EReturn, FarRef } from '@endo/eventual-send';
import { E } from './_get-hp.js';

// Check the legacy ERef type
const foo = async (a: ERef<{ bar(): string; baz: number }>) => {
  const { baz } = await a;

  expectTypeOf(E(a).bar()).toEqualTypeOf<Promise<string>>();

  // Should be type error, but isn't.
  (await a).bar();

  expectTypeOf(E.get(a).baz).toEqualTypeOf<Promise<number>>();

  // Should be type error, but isn't.
  expectTypeOf(E.get(a).bar).toEqualTypeOf<Promise<() => string>>();

  // @ts-expect-error - calling a directly is not typed, but works.
  a.bar();
};

// EReturn
{
  const makeFoo = async () => 'foo' as const;
  expectTypeOf(makeFoo()).toEqualTypeOf<Promise<'foo'>>();
  type Foo = EReturn<typeof makeFoo>;
  expectTypeOf('foo' as const).toEqualTypeOf<Foo>();

  const fooP = Promise.resolve('foo' as const);
  expectTypeOf(fooP).toEqualTypeOf<Promise<'foo'>>();
  // @ts-expect-error takes only functions
  EReturn<typeof fooP>;
}

// FarRef<T>
const foo2 = async (a: FarRef<{ bar(): string; baz: number }>) => {
  const { baz } = await a;
  expectTypeOf(baz).toEqualTypeOf<number>();

  expectTypeOf(E(a).bar()).toEqualTypeOf<Promise<string>>();

  // @ts-expect-error - awaiting remotes cannot get functions
  (await a).bar;

  expectTypeOf(E.get(a).baz).toEqualTypeOf<Promise<number>>();

  // @ts-expect-error - E.get cannot obtain remote functions
  E.get(a).bar;

  expectTypeOf((await a).baz).toEqualTypeOf<number>();

  // @ts-expect-error - calling directly is valid but not yet in the typedef
  a.bar;
};

// when
const aPromise = Promise.resolve('a');
const onePromise = Promise.resolve(1);
const remoteString: ERef<string> = Promise.resolve('remote');
E.when(Promise.all([aPromise, onePromise, remoteString])).then(
  ([str, num, remote]) => {
    expectTypeOf(str).toEqualTypeOf<string>();
    expectTypeOf(num).toEqualTypeOf<number>();
    expectTypeOf(remote).toEqualTypeOf<string>();
  },
);
E.when(
  Promise.all([aPromise, onePromise, remoteString]),
  ([str, num, remote]) => {
    expectTypeOf(str).toEqualTypeOf<string>();
    expectTypeOf(num).toEqualTypeOf<number>();
    expectTypeOf(remote).toEqualTypeOf<string>();
    return { something: 'new' };
  },
).then(result => {
  expectTypeOf(result).toEqualTypeOf<{ something: string }>();
});

{
  const local = { getVal: () => 'val' };
  expectTypeOf(E(local).getVal()).toEqualTypeOf<Promise<string>>();
}

/* eslint-disable @endo/no-polymorphic-call, import/no-extraneous-dependencies, no-restricted-globals */
import { expectType } from 'tsd';
import { E } from '../test/_get-hp.js';
import type { ERef, FarRef } from './exports.js';

// Check the legacy ERef type
const foo = async (a: ERef<{ bar(): string; baz: number }>) => {
  const { baz } = await a;

  expectType<Promise<string>>(E(a).bar());

  // Should be type error, but isn't.
  (await a).bar();

  expectType<Promise<number>>(E.get(a).baz);

  // Should be type error, but isn't.
  expectType<Promise<() => string>>(E.get(a).bar);

  // @ts-expect-error - calling a directly is not typed, but works.
  a.bar();
};

// FarRef<T>
const foo2 = async (a: FarRef<{ bar(): string; baz: number }>) => {
  const { baz } = await a;
  expectType<number>(baz);

  expectType<Promise<string>>(E(a).bar());

  // @ts-expect-error - awaiting remotes cannot get functions
  (await a).bar;

  expectType<Promise<number>>(E.get(a).baz);

  // @ts-expect-error - E.get cannot obtain remote functions
  E.get(a).bar;

  expectType<number>((await a).baz);

  // @ts-expect-error - calling directly is valid but not yet in the typedef
  a.bar;
};

// when
const aPromise = Promise.resolve('a');
const onePromise = Promise.resolve(1);
const remoteString: ERef<string> = Promise.resolve('remote');
E.when(Promise.all([aPromise, onePromise, remoteString])).then(
  ([str, num, remote]) => {
    expectType<string>(str);
    expectType<number>(num);
    expectType<string>(remote);
  },
);
E.when(
  Promise.all([aPromise, onePromise, remoteString]),
  ([str, num, remote]) => {
    expectType<string>(str);
    expectType<number>(num);
    expectType<string>(remote);
    return { something: 'new' };
  },
).then(result => {
  expectType<{ something: string }>(result);
});

{
  const local = { getVal: () => 'val' };
  expectType<Promise<string>>(E(local).getVal());
}

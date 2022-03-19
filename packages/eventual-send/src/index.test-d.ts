/* eslint-disable @endo/no-polymorphic-call, import/no-extraneous-dependencies, no-restricted-globals, prettier/prettier */
import { expectType } from 'tsd';
import { E } from '../test/get-hp.js';
import { DataOnly, ERef } from './index.js';

type Remote<
  Primary,
  Local = DataOnly<Primary>
> = import('@endo/eventual-send').Remote<Primary, Local>;

const Far = <T>(_iface: string, value: T) => {
  return value as T & { __Remote__: T };
};

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

// Remote<T>
const foo2 = async (a: Remote<{ bar(): string; baz: number }>) => {
  const { baz } = await a;
  expectType<number>(baz);

  expectType<Promise<string>>(E(a).bar());

  // @ts-expect-error - awaiting remotes cannot get functions
  (await a).bar(); // FIXME any

  expectType<Promise<number>>(E.get(a).baz);

  // @ts-expect-error - E.get cannot obtain remote functions
  const barP = await E.get(a).bar; // FIXME any

  expectType<number>((await a).baz);

  // @ts-expect-error - calling a directly is not typed, but works.
  a.bar(); // FIXME any
};

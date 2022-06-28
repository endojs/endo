/* eslint-disable @endo/no-polymorphic-call, import/no-extraneous-dependencies, no-restricted-globals, prettier/prettier */
import { expectType } from 'tsd';
import { Far } from '@endo/marshal';
import { E } from '../test/get-hp.js';
import { DataOnly, ERef } from './index.js';

type FarRef<
  Primary,
  Local = DataOnly<Primary>
> = import('@endo/eventual-send').FarRef<Primary, Local>;

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

// Nullish handling
type SomeRemotable = { someMethod: () => 'hello'; someVal: 'alsoHello' };
const undefinedCase = () => {
  let ref: SomeRemotable | undefined;
  // @ts-expect-error can't proxy an undefined value
  E(ref);
  // @ts-expect-error could be undefined
  E(ref).someMethod();
  // @ts-expect-error optional chaining doesn't work with E()
  E(ref)?.someMethod();
  // @ts-expect-error could be undefined
  E.get(ref);
  const getters = E.get(ref);
  expectType < EGetters<SomeRemotable | undefined>(getters);
  getters.someMethod.then(sayHello => sayHello());
  getters.someVal;
};
const promiseUndefinedCase = () => {
  let ref: Promise<SomeRemotable | undefined>;
  // @ts-expect-error can't proxy an undefined value
  E(ref);
  // @ts-expect-error could be undefined
  E(ref).someMethod();
  // @ts-expect-error optional chaining doesn't work with E()
  E(ref)?.someMethod();
  // @ts-expect-error could be undefined
  E.get(ref);
  const getters = E.get(ref);
  getters.someMethod.then(sayHello => sayHello());
  getters.someVal;
};
const nullCase = () => {
  let ref: SomeRemotable | null;
  // @ts-expect-error could be null
  E(ref).someMethod();
  // @ts-expect-error optional chaining doesn't work with E()
  E(ref)?.someMethod();
  // @ts-expect-error could be null
  E.get(ref);
  const getters = E.get(ref!);
  getters.someMethod.then(sayHello => sayHello());
  getters.someVal;
};

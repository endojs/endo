// @ts-check
import { test } from './prepare-test-env-ava.js';

import { E } from './get-hp.js';

/** @template T @typedef {import('../src/index').ERef<T>} ERef */
/**
 * @template Primary
 * @template [Local=import('../src/index').DataOnly<Primary>]
 * @typedef {import('@endo/eventual-send').Remote<Primary, Local>} Remote
 */

/**
 * @template T
 * @param {string} _iface
 * @param {T} value
 */
const Far = (_iface, value) => {
  return /** @type {T & { __Remote__: T }} */ (value);
};

/**
 * Check the performance of the legacy ERef type.
 *
 * @param {import('./prepare-test-env-ava').ExecutionContext<unknown>} t
 * @param {ERef<{ bar(): string, baz: number }>} a
 */
const foo = async (t, a) => {
  const { baz } = await a;
  t.is(baz, 42);

  const bP = E(a).bar(); // bP is a promise for a string
  t.is(Promise.resolve(bP), bP);
  t.is(await bP, 'barRet');

  // Should be type error, but isn't.
  (await a).bar();

  const bazP = E.get(a).baz; // bazP is a promise for a number
  t.is(Promise.resolve(bazP), bazP);
  t.is(await bazP, 42);

  // Should be type error, but isn't.
  const barP = E.get(a).bar;
  t.is(Promise.resolve(barP), barP);
  t.is(typeof (await barP), 'function');

  t.is((await a).baz, 42);

  // @ts-expect-error - calling a directly is not typed, but works.
  a.bar();
};

/**
 * Check the performance of Remote<T>.
 *
 * @param {import('./prepare-test-env-ava').ExecutionContext<unknown>} t
 * @param {Remote<{ bar(): string, baz: number }>} a
 */
const foo2 = async (t, a) => {
  const { baz } = await a;
  t.is(baz, 42);

  const bP = E(a).bar(); // bP is a promise for a string
  t.is(Promise.resolve(bP), bP);
  t.is(await bP, 'barRet');

  // @ts-expect-error - awaiting remotes cannot get functions
  (await a).bar();

  const bazP = E.get(a).baz; // bazP is a promise for a number
  t.is(Promise.resolve(bazP), bazP);
  t.is(await bazP, 42);

  // @ts-expect-error - E.get cannot obtain remote functions
  const barP = E.get(a).bar;
  t.is(Promise.resolve(barP), barP);
  t.is(typeof (await barP), 'function');

  t.is((await a).baz, 42);

  // @ts-expect-error - calling a directly is not typed, but works.
  a.bar();
};

test('check types', async t => {
  const f = Far('foo remote', { bar: () => 'barRet', baz: 42 });

  await foo(t, f);
  await foo2(t, f);
});

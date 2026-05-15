import '@endo/lockdown/commit-debug.js';
import test from 'ava';

import { E } from './_get-hp.js';

/**
 * Mock a Remotable maker.
 *
 * @template {Record<string, any>} L
 * @template {Record<string, any>} R
 * @param {string} [_iface]
 * @param {L} [props]
 * @param {R} [remoteMethods]
 */
const Remotable = (
  _iface = 'Remotable',
  props = /** @type {L} */ ({}),
  remoteMethods = /** @type {R} */ ({}),
) => {
  const obj = remoteMethods;
  // Assign props to the object.
  for (const [key, value] of Object.entries(props)) {
    assert(!(key in obj));
    // @ts-expect-error Type 'R' is generic and can only be indexed for reading.
    obj[key] = value;
  }
  const ret =
    /** @type {L & R & import('@endo/eventual-send').RemotableBrand<L, R>} */ (
      obj
    );
  return ret;
};

/**
 * Mock a far object maker.
 *
 * @template {Record<string, any>} T
 * @param {string} iface
 * @param {T} value
 */
const Far = (iface, value) => {
  return Remotable(iface, {}, value);
};

/**
 * Check the performance of the legacy ERef type.
 *
 * @param {import('ava').ExecutionContext<unknown>} t
 * @param {import('@endo/eventual-send').ERef<{ bar(): string, baz: number }>} a
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
 * Check the correctness of FarRef<T>.
 *
 * @param {import('ava').ExecutionContext<unknown>} t
 * @param {import('@endo/eventual-send').FarRef<
 *  { bar(): string },
 *  { far: import('@endo/eventual-send').FarRef<() => 'hello'>,
 *    baz: number,
 *  }>} a
 */
const foo2 = async (t, a) => {
  const { baz } = await a;
  t.is(baz, 42);

  const bP = E(a).bar(); // bP is a promise for a string
  t.is(Promise.resolve(bP), bP);
  t.is(await bP, 'barRet');

  // @ts-expect-error - awaiting remotes cannot get functions
  (await a).bar;

  // Can obtain a far function.
  const ff = (await a).far;

  // @ts-expect-error - far functions cannot be called without E
  ff();

  // Can call the far function.
  const ffP = E(ff)();
  t.is(Promise.resolve(ffP), ffP);
  t.is(await ffP, 'hello');

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
  const f = Remotable(
    'foo remote',
    { baz: 42, far: Far('fn', () => 'hello') },
    { bar: () => 'barRet' },
  );

  await foo(t, f);
  await foo2(t, f);
});

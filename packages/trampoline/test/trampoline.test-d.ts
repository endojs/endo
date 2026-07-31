/* eslint-disable jsdoc/require-returns-type */
import { expectTypeOf } from 'expect-type';
import { asyncTrampoline, syncTrampoline } from '../src/trampoline.js';

function* simple<TResult extends string | Promise<string>>(
  thunk: (arg: string) => TResult,
  initial: string,
): Generator<TResult, string, string> {
  const hello = yield thunk(initial);
  return `${hello} world`;
}

expectTypeOf(simple((str: string) => `${str} cruel`, 'goodbye')).toExtend<
  Generator<string | Promise<string>, string, string>
>();

expectTypeOf(simple).toExtend<(...args: any[]) => Generator>();

expectTypeOf(simple).toExtend<
  (
    thunk: () => string | Promise<string>,
    initial: string,
  ) => Generator<string | Promise<string>, string, string>
>();

expectTypeOf(
  syncTrampoline(simple, (str: string) => `${str} cruel`, 'goodbye'),
).toEqualTypeOf<string>();

expectTypeOf(
  asyncTrampoline(simple, async (str: string) => `${str} cruel`, 'goodbye'),
).toEqualTypeOf<Promise<string>>();

expectTypeOf(
  asyncTrampoline(simple, (str: string) => `${str} cruel`, 'goodbye'),
).toEqualTypeOf<Promise<string>>();

/**
 * Generators are difficult to type. We _may know_ the order in which typed
 * values are yielded from the generator, but there's no way to define this in
 * TS. If multiple types are at play, we can only use a union.
 *
 * Further, the same applies to `TNext` (in `Generator<T, TReturn, TNext>`);
 * this is the type of the `value` passed to `iterator.next(value)`.
 *
 * The only thing we can be confident about is `TReturn` because it only happens
 * once.
 *
 * The generator returned from this function will always return a `boolean`, but
 * everything else is a mishmash.
 *
 * @param fn - Some callback
 * @returns A generator that yields a variety of types.
 */
function* varied<TResult extends number | Promise<number>, Foo = unknown>(
  fn: () => TResult,
): Generator<string | Date | TResult, boolean, RegExp | Foo> {
  let regexp: RegExp | Foo = yield 'hello world';
  regexp = yield fn();
  const ignored: RegExp | Foo = yield new Date();
  return regexp instanceof RegExp ? regexp.test('hello world') : false;
}

expectTypeOf(varied(() => 42)).toExtend<
  Generator<string | number | Promise<number> | Date, boolean, RegExp>
>();

expectTypeOf(varied).toExtend<(...args: any[]) => Generator>();

expectTypeOf(varied).toExtend<
  (
    fn: () => number | Promise<number>,
  ) => Generator<string | Date | number | Promise<number>, boolean, RegExp>
>();

expectTypeOf(syncTrampoline(varied, () => 42)).toEqualTypeOf<boolean>();

expectTypeOf(asyncTrampoline(varied, async () => 42)).toEqualTypeOf<
  Promise<boolean>
>();

expectTypeOf(asyncTrampoline(varied, () => 42)).toEqualTypeOf<
  Promise<boolean>
>();

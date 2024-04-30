/* eslint-disable jsdoc/require-returns-type */
/* eslint-disable jsdoc/require-param-type */
/* eslint-disable no-redeclare */
import { expectAssignable, expectType } from 'tsd';
import { syncTrampoline, asyncTrampoline } from '../src/trampoline.js';

function* simple<TResult extends string | Promise<string>>(
  thunk: (arg: string) => TResult,
  initial: string,
): Generator<TResult, string, string> {
  const hello = yield thunk(initial);
  return `${hello} world`;
}

expectAssignable<Generator<string | Promise<string>, string, string>>(
  simple((str: string) => `${str} cruel`, 'goodbye'),
);

expectAssignable<(...args: any[]) => Generator>(simple);

expectAssignable<
  (
    thunk: () => string | Promise<string>,
    initial: string,
  ) => Generator<string | Promise<string>, string, string>
>(simple);

expectType<string>(
  syncTrampoline(simple, (str: string) => `${str} cruel`, 'goodbye'),
);

expectType<Promise<string>>(
  asyncTrampoline(simple, async (str: string) => `${str} cruel`, 'goodbye'),
);

expectType<Promise<string>>(
  asyncTrampoline(simple, (str: string) => `${str} cruel`, 'goodbye'),
);

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

expectAssignable<
  Generator<string | number | Promise<number> | Date, boolean, RegExp>
>(varied(() => 42));

expectAssignable<(...args: any[]) => Generator>(varied);

expectAssignable<
  (
    fn: () => number | Promise<number>,
  ) => Generator<string | Date | number | Promise<number>, boolean, RegExp>
>(varied);

expectType<boolean>(syncTrampoline(varied, () => 42));

expectType<Promise<boolean>>(asyncTrampoline(varied, async () => 42));

expectType<Promise<boolean>>(asyncTrampoline(varied, () => 42));

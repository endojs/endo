/* eslint-disable @jessie.js/safe-await-separator */
/**
 * @import {TrampolineResult, SyncTrampolineResult} from './types.js'
 */
const { getPrototypeOf } = Object;
const { bind } = Function.prototype;
const uncurryThis = bind.bind(bind.call); // eslint-disable-line @endo/no-polymorphic-call
export const { prototype: generatorPrototype } = getPrototypeOf(
  // eslint-disable-next-line no-empty-function, func-names
  function* () {},
);
const generatorNext = uncurryThis(generatorPrototype.next);
const generatorThrow = uncurryThis(generatorPrototype.throw);

/**
 * Trampoline on {@link TrampolineGeneratorFn generatorFn} synchronously.
 *
 * @template {readonly any[]} TArgs Parameters for `generatorFn`
 * @template {(...args: TArgs) => Generator} TFn
 * @param {TFn} generatorFn Generator-returning function accepting any arguments
 * @param {TArgs} args Arguments to pass to `generatorFn`
 * @returns {SyncTrampolineResult<TFn>}
 */
export function syncTrampoline(generatorFn, ...args) {
  const iterator = generatorFn(...args);
  let result = generatorNext(iterator);
  while (!result.done) {
    try {
      result = generatorNext(iterator, result.value);
    } catch (err) {
      result = generatorThrow(iterator, err);
    }
  }
  return result.value;
}

/**
 * Trampoline on {@link TrampolineGeneratorFn generatorFn} asynchronously.
 *
 * @template {readonly any[]} TArgs Parameters for `generatorFn`
 * @template {(...args: TArgs) => Generator} TFn
 * @param {TFn} generatorFn Generator-returning function accepting any arguments
 * @param {TArgs} args Arguments to pass to `generatorFn`
 * @returns {Promise<TrampolineResult<TFn>>}
 */
export async function asyncTrampoline(generatorFn, ...args) {
  const iterator = generatorFn(...args);
  let result = generatorNext(iterator);
  while (!result.done) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const val = await result.value;
      result = generatorNext(iterator, val);
    } catch (err) {
      result = generatorThrow(iterator, err);
    }
  }
  return result.value;
}

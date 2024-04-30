/**
 * @import {ThunkFn, SyncTrampolineGeneratorFn, TrampolineGeneratorFn } from './types.js'
 */

/**
 * Synchronous trampoline
 *
 * This trampoline will only accept a `Hook` where `HookResult` is _not_ a `Promise`.
 *
 * @template TInitial Type of the initial value passed to the `generatorFn`
 * @template [TArg=TInitial] Type of the argument passed to the `thunkFn`
 * @template [TResult=TArg] Result of the `thunkFn` _and_ the return value of the `generatorFn`
 * @param {SyncTrampolineGeneratorFn<TInitial, TArg, TResult>} generatorFn Generator-returning function accepting a thunk and optionally an initial value
 * @param {ThunkFn<TArg, TResult>} thunkFn Synchronous thunk which `generatorFn` should call
 * @param {TInitial} initial Initial value
 * @returns {TResult}
 */
export function syncTrampoline(generatorFn, thunkFn, initial) {
  const iterator = generatorFn(thunkFn, initial);
  let result = iterator.next();
  while (!result.done) {
    result = iterator.next(result.value);
  }
  return result.value;
}

/**
 * Asynchronous trampoline
 *
 * This trampoline will accept a {@link ThunkFn} where `TResult` _may_ be a `Promise`.
 *
 * @template TInitial Type of the initial value passed to the `generatorFn`
 * @template [TArg=TInitial] Type of the argument passed to the `thunkFn`
 * @template [TResult=TArg] Result of `thunkFn` _and_ the return value of the `generatorFn`
 * @param {TrampolineGeneratorFn<TInitial, TArg, TResult>} generatorFn Generator-returning function accepting a thunk and optionally an initial value
 * @param {ThunkFn<TArg, TResult>} thunkFn Thunk function
 * @param {TInitial} initial Initial value passed to `generatorFn`
 * @returns {Promise<Awaited<TResult>>} Final value of generator
 */
export async function trampoline(generatorFn, thunkFn, initial) {
  const iterator = generatorFn(thunkFn, initial);
  let result = iterator.next();
  while (!result.done) {
    // eslint-disable-next-line no-await-in-loop
    const val = await result.value;
    result = iterator.next(val);
  }
  return result.value;
}

export const asyncTrampoline = trampoline;

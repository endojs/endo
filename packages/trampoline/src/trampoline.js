/* eslint-disable @jessie.js/safe-await-separator */
/**
 * @import {ThunkFn, SyncTrampolineGeneratorFn, TrampolineGeneratorFn, AsyncTrampolineGeneratorFn, SyncThunkFn } from './types.js'
 */

/**
 * Trampoline on {@link TrampolineGeneratorFn generatorFn} with a synchronous {@link SyncThunkFn thunk}.
 *
 * @template TInitial Type of the initial value passed to the `generatorFn`
 * @template [TArg=TInitial] Type of the argument passed to the `thunkFn`
 * @template [TResult=TArg] Result of the `thunkFn` _and_ the return value of the `generatorFn`
 * @param {SyncTrampolineGeneratorFn<TInitial, TArg, TResult>} generatorFn Generator-returning function accepting a thunk and optionally an initial value
 * @param {SyncThunkFn<TArg, TResult>} thunk Synchronous thunk which `generatorFn` should call
 * @param {TInitial} initial Initial value
 * @returns {TResult}
 */
export function syncTrampoline(generatorFn, thunk, initial) {
  const iterator = generatorFn(thunk, initial);
  let result = iterator.next();
  while (!result.done) {
    result = iterator.next(result.value);
  }
  return result.value;
}

/**
 * Trampoline on {@link TrampolineGeneratorFn generatorFn} with a synchronous _or_ asynchronous {@link ThunkFn thunk}.
 *
 * @template TInitial Type of the initial value passed to the `generatorFn`
 * @template [TArg=TInitial] Type of the argument passed to the `thunkFn`
 * @template [TResult=TArg] Result of `thunkFn` _and_ the return value of the `generatorFn`
 * @param {TrampolineGeneratorFn<TInitial, TArg, TResult>} generatorFn Generator-returning function accepting a thunk and optionally an initial value
 * @param {ThunkFn<TArg, TResult>} thunk Thunk function
 * @param {TInitial} initial Initial value passed to `generatorFn`
 * @returns {Promise<Awaited<TResult>>} Final value of generator
 */
export async function trampoline(generatorFn, thunk, initial) {
  const iterator = generatorFn(thunk, initial);
  let result = iterator.next();
  while (!result.done) {
    // eslint-disable-next-line no-await-in-loop
    const val = await result.value;
    result = iterator.next(val);
  }
  return result.value;
}

/**
 * Alias for {@link trampoline}
 */
export const asyncTrampoline = trampoline;

/**
 * These tests are based on example code written by @naugtur
 *
 * @module
 */

import test from 'ava';
import { setTimeout } from 'node:timers';
import { syncTrampoline, trampoline } from '../src/trampoline.js';

/**
 * @import {ThunkFn} from '../src/types.js'
 */

/**
 * @template {number|Promise<number>} TResult
 * @param {ThunkFn<number, TResult>} thunk
 * @param {number} [input]
 * @returns {Generator<TResult, number, number>}
 */
function* operationsWithThunk(thunk, input = 0) {
  let result = input * 2; // First operation
  result = yield thunk(result); // Call the hook, which can be sync or async
  result *= 2; // Operation on the hook's result
  // Check if the result is divisible by N, and if so, recurse
  if (result < 1000) {
    result = yield* operationsWithThunk(thunk, result); // Recurse with yield*
  }
  return result;
}

/**
 * Synchronous thunk
 * @param {number} x
 * @returns {number}
 */
function syncThunk(x = 0) {
  return x + 10;
}

/**
 * Asynchronous thunk
 * @param {number} x
 * @returns {Promise<number>}
 */
async function asyncThunk(x = 0) {
  await new Promise(resolve => setTimeout(resolve));
  return x + 10;
}

const expectedResult = 2980;

test('synchronous execution', t => {
  const syncResult = syncTrampoline(operationsWithThunk, syncThunk, 5);
  t.is(syncResult, expectedResult);
  t.pass();
});

test('asynchronous execution w/ sync thunk', async t => {
  const asyncResult = await trampoline(operationsWithThunk, syncThunk, 5);
  t.is(asyncResult, expectedResult);
  t.pass();
});

test('asynchronous execution', async t => {
  const asyncResult = await trampoline(operationsWithThunk, asyncThunk, 5);
  t.is(asyncResult, expectedResult);
  t.pass();
});

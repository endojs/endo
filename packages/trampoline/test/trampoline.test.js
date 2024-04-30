/**
 * These tests are based on example code written by @naugtur
 *
 * @module
 */

import test from 'ava';
import { setTimeout } from 'node:timers';
import { syncTrampoline, asyncTrampoline } from '../src/trampoline.js';

/**
 * @template {number|Promise<number>} TResult
 * @param {(arg: number) => TResult} thunk
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
 * @template {number|Promise<number>} TResult
 * @param {(arg: number) => TResult} thunk
 * @param {number} [input]
 * @returns {Generator<TResult, number, number>}
 */
function* operations(thunk, input = 0) {
  let result = input * 2; // First operation
  try {
    result = yield thunk(result); // Call the hook, which can be sync or async
  } catch {
    return result;
  }
  result *= 2; // Operation on the hook's result
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

/**
 * Asynchronous thunk which throws
 * @param {number} _x
 * @returns {Promise<number>}
 */
async function brokenAsyncThunk(_x = 0) {
  throw new Error('insubordinate!');
}

// eslint-disable-next-line jsdoc/require-returns-check
/**
 * Synchronous thunk which throws
 * @param {number} _x
 * @returns {number}
 */
function brokenSyncThunk(_x = 0) {
  throw new Error('churlish!');
}

/**
 * IDK; it does what it does.
 */
const expectedRecursiveResult = 2980;
/**
 * Should be (2 * initial value + 10) * 2
 */
const expectedResult = 40;
/**
 * Should be 2 * initial value
 */
const expectedErrorResult = 10;

test('synchronous execution - recursion', t => {
  const actual = syncTrampoline(operationsWithThunk, syncThunk, 5);
  t.is(actual, expectedRecursiveResult);
});

test('asynchronous execution w/ sync thunk - recursion', async t => {
  const actual = await asyncTrampoline(operationsWithThunk, syncThunk, 5);
  t.is(actual, expectedRecursiveResult);
});

test('asynchronous execution - recursion', async t => {
  const actual = await asyncTrampoline(operationsWithThunk, asyncThunk, 5);
  t.is(actual, expectedRecursiveResult);
});

test('synchronous execution', t => {
  const actual = syncTrampoline(operations, syncThunk, 5);
  t.is(actual, expectedResult);
});

test('asynchronous execution w/ sync thunk', async t => {
  const actual = await asyncTrampoline(operations, syncThunk, 5);
  t.is(actual, expectedResult);
});

test('asynchronous execution', async t => {
  const actual = await asyncTrampoline(operations, syncThunk, 5);
  t.is(actual, expectedResult);
});

test('async error handling', async t => {
  const actual = await asyncTrampoline(operations, brokenAsyncThunk, 5);
  t.is(actual, expectedErrorResult);
});

test('sync error handling', t => {
  const actual = syncTrampoline(operations, brokenSyncThunk, 5);
  t.is(actual, expectedErrorResult);
});

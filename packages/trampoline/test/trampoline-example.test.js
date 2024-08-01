/**
 * These tests are based on the example from the `README`
 * @module
 */

import test from 'ava';
import { syncTrampoline, trampoline } from '../src/trampoline.js';

/**
 * @import {ThunkFn} from '../src/types.js'
 */

/**
 * Mapping of filesnames to import specifiers. Trust me
 */
const sources = /** @type {const} */ ({
  a: ['b', 'c'],
  b: ['c', 'd'],
  c: ['e'],
  e: ['f', 'g'],
});

/**
 * This function "inspects the source code and returns a list of specifiers which
 * need to be imported.""
 *
 * @param {string} source
 * @returns {string[]}
 */
const findImportsInSource = source => {
  return [...(sources[/** @type {keyof typeof sources} */ (source)] || [])];
};

/**
 * This function "reads a file synchronously" and returns "a list of its imports"
 *
 * @param {string} filepath
 * @returns {string[]}
 */
const findImportsSync = filepath => findImportsInSource(filepath);

/**
 * This function "reads a file asynchronously" and returns "a list of its imports"
 *
 * @param {string} filepath
 * @returns {Promise<string[]>}
 */
const findImportsAsync = async filepath => findImportsInSource(filepath);

/**
 * Recursively crawls a dependency tree to find all dependencies
 *
 * @template {string[]|Promise<string[]>} TResult
 * @param {ThunkFn<string, TResult>} thunk
 * @param {string} filename
 * @returns {Generator<TResult, string[], string[]>}
 */
function* loadRecursive(thunk, filename) {
  let specifiers = yield thunk(filename);
  // pretend there's some de-duping, caching,
  // scrubbing, etc. happening here
  for (const specifier of specifiers) {
    specifiers = [...specifiers, ...(yield* loadRecursive(thunk, specifier))];
  }
  return specifiers;
}

const expected = ['b', 'c', 'c', 'd', 'e', 'f', 'g', 'e', 'f', 'g'];

test('asynchronous execution', async t => {
  const asyncResult = await trampoline(loadRecursive, findImportsAsync, 'a');
  t.deepEqual(asyncResult, expected);
});

test('asynchronous execution w/ sync thunk', async t => {
  const asyncResult = await trampoline(loadRecursive, findImportsSync, 'a');
  t.deepEqual(asyncResult, expected);
});

test('synchronous execution', t => {
  const syncResult = syncTrampoline(loadRecursive, findImportsSync, 'a');
  t.deepEqual(syncResult, expected);
});

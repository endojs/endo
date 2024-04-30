/**
 * These tests are based on the example from the `README`
 * @module
 */

import test from 'ava';
import { syncTrampoline, asyncTrampoline } from '../src/trampoline.js';

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
 * @template {string[] | Promise<string[]>} TResult Type of result (list of imports)
 * @param {(filepath: string) => TResult} finder Function which reads a file and returns its imports
 * @param {string} filename File to start from; entry point
 * @returns {Generator<TResult, string[], string[]>} Generator yielding list of imports
 */
function* findAllImports(finder, filename) {
  // it doesn't matter if finder is sync or async!
  let specifiers = yield finder(filename);

  // pretend there's some de-duping, caching,
  // scrubbing, etc. happening here

  for (const specifier of specifiers) {
    // it's okay to be recursive
    specifiers = [...specifiers, ...(yield* findAllImports(finder, specifier))];
  }
  return specifiers;
}

const expected = ['b', 'c', 'c', 'd', 'e', 'f', 'g', 'e', 'f', 'g'];

test('asynchronous execution - example code', async t => {
  const asyncResult = await asyncTrampoline(
    findAllImports,
    findImportsAsync,
    'a',
  );
  t.deepEqual(asyncResult, expected);
});

test('asynchronous execution w/ sync thunk - example code', async t => {
  const asyncResult = await asyncTrampoline(
    findAllImports,
    findImportsSync,
    'a',
  );
  t.deepEqual(asyncResult, expected);
});

test('synchronous execution - example code', t => {
  const syncResult = syncTrampoline(findAllImports, findImportsSync, 'a');
  t.deepEqual(syncResult, expected);
});

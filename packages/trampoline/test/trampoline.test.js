import { setTimeout } from 'node:timers';
import { syncTrampoline, trampoline } from '../src/trampoline.js';

/**
 * @import {ThunkFn} from '../src/types.js'
 */

/**
 * @template {number|Promise<number>} TResult
 * @template {ThunkFn<number, TResult>} Hook
 * @param {Hook} hook
 * @param {number} [input]
 * @returns {Generator<TResult, number, number>}
 */
function* operationsWithHook(hook, input = 0) {
  let result = input * 2; // First operation
  result = yield hook(result); // Call the hook, which can be sync or async
  result *= 2; // Operation on the hook's result
  console.log(Date.now(), [input, result]);
  // Check if the result is divisible by N, and if so, recurse
  if (result < 1000) {
    result = yield* operationsWithHook(hook, result); // Recurse with yield*
  }
  return result;
}

// Synchronous hook
/**
 *
 * @param {number} x
 * @returns {number}
 */
function syncHook(x = 0) {
  return x + 10;
}

// Asynchronous hook
/**
 *
 * @param {number} x
 * @returns {Promise<number>}
 */
async function asyncHook(x = 0) {
  await new Promise(resolve => setTimeout(resolve, 101));
  return x + 10;
}

// Execute synchronously
const syncResult = syncTrampoline(operationsWithHook, syncHook, 5);
console.log(syncResult); // Output will depend on operations and hook

// Execute asynchronously
trampoline(operationsWithHook, asyncHook, 5).then(result => {
  console.log(result); // Output will depend on operations and hook
});

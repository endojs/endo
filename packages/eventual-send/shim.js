/* global globalThis */
import { makeHandledPromise } from './src/handled-promise.js';

if (typeof globalThis.HandledPromise === 'undefined') {
  globalThis.HandledPromise = makeHandledPromise();
}

/* global globalThis */
import { makeHandledPromise } from './src/index.js';

if (typeof HandledPromise === 'undefined') {
  globalThis.HandledPromise = makeHandledPromise();
}

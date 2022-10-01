// @ts-nocheck
/* global globalThis */
import { makeHandledPromise } from './src/handled-promise.js';

if (typeof HandledPromise === 'undefined') {
  globalThis.HandledPromise = makeHandledPromise();
}

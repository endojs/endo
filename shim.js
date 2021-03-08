/* global globalThis */
import { makeHandledPromise } from './src/index';

if (typeof HandledPromise === 'undefined') {
  globalThis.HandledPromise = makeHandledPromise();
}

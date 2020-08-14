/* global globalThis */

// eslint-disable-next-line import/prefer-default-export
import { makeHandledPromise } from './src/index';

// 'E' and 'HandledPromise' are exports of the module

// For now:
// import { HandledPromise, E } from '@agoric/eventual-send';
// ...

if (typeof HandledPromise === 'undefined') {
  globalThis.HandledPromise = makeHandledPromise(Promise);
}

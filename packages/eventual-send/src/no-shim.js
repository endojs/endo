import makeE from './E.js';

// XXX module exports for HandledPromise fail if these aren't in scope
/** @import {Handler, HandledExecutor} from './handled-promise.js' */

const hp = HandledPromise;
export const E = makeE(hp);
export { hp as HandledPromise };

// eslint-disable-next-line import/export
export * from './exports.js';

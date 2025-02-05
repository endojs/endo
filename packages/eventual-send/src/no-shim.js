import makeE from './E.js';

// XXX module exports for HandledPromise fail if these aren't in scope
/** @import {Handler, HandledExecutor} from './handled-promise.js' */
/** @import {ECallableOrMethods, EGetters, ERef, ERemoteFunctions, ESendOnlyCallableOrMethods, LocalRecord, RemoteFunctions} from './E.js' */

const hp = HandledPromise;

/**
 * E(x) returns a proxy on which you can call arbitrary methods. Each of these method calls returns a promise.
 * The method will be invoked on whatever 'x' designates (or resolves to) in a future turn, not this one.
 *
 * E.get(x) returns a proxy on which you can get arbitrary properties. Each of these properties returns a
 * promise for the property.  The promise value will be the property fetched from whatever 'x' designates (or
 * resolves to) in a future turn, not this one.
 *
 * E.when(x, res, rej) is equivalent to HandledPromise.resolve(x).then(res, rej)
 */
export const E = makeE(hp);
export { hp as HandledPromise };

// eslint-disable-next-line import/export
export * from './exports.js';

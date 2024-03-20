/**
 * makePromiseKit() builds a Promise object, and returns a record
 * containing the promise itself, as well as separate facets for resolving
 * and rejecting it.
 *
 * @template T
 * @returns {import('./src/types.js').PromiseKit<T>}
 */
export function makePromiseKit<T>(): import("./src/types.js").PromiseKit<T>;
/**
 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
 * or rejected.
 *
 * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
 * the result promise.
 *
 * @template T
 * @param {Iterable<T>} values An iterable of Promises.
 * @returns {Promise<Awaited<T>>} A new Promise.
 */
export function racePromises<T>(values: Iterable<T>): Promise<Awaited<T>>;
export * from "./src/is-promise.js";
export * from "./src/types.js";
//# sourceMappingURL=index.d.ts.map
export { race as memoRace };
export type Deferred<T = any> = {
    resolve: (value?: import("./types.js").ERef<T>) => void;
    reject: (err?: any) => void;
};
export type PromiseMemoRecord = never | {
    settled: false;
    deferreds: Set<Deferred>;
} | {
    settled: true;
    deferreds?: undefined;
};
/**
 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
 * or rejected.
 *
 * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
 * the result promise.
 *
 * @template T
 * @template {PromiseConstructor} [P=PromiseConstructor]
 * @this {P}
 * @param {Iterable<T>} values An iterable of Promises.
 * @returns {Promise<Awaited<T>>} A new Promise.
 */
declare function race<T, P extends PromiseConstructor = PromiseConstructor>(this: P, values: Iterable<T>): Promise<Awaited<T>>;
//# sourceMappingURL=memo-race.d.ts.map
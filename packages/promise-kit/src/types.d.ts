/**
 * A reified Promise
 */
export type PromiseKit<T> = {
    resolve: (value: ERef<T>) => void;
    reject: (reason: any) => void;
    promise: Promise<T>;
};
/**
 * PromiseRecord is deprecated in favor of PromiseKit.
 */
export type PromiseRecord<T> = PromiseKit<T>;
/**
 * A reference of some kind for to an object of type T. It may be a direct
 * reference to a local T. It may be a local presence for a remote T. It may
 * be a promise for a local or remote T. Or it may even be a thenable
 * (a promise-like non-promise with a "then" method) for a T.
 */
export type ERef<T> = T | PromiseLike<T>;
//# sourceMappingURL=types.d.ts.map
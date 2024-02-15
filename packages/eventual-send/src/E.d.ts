export default makeE;
export type EProxy = ReturnType<(HandledPromise: {
    new <R>(executor: import("./handled-promise.js").HandledExecutor<R>, unfulfilledHandler?: import("./handled-promise.js").Handler<Promise<unknown>> | undefined): Promise<R>;
    prototype: Promise<unknown>;
} & PromiseConstructor & import("./handled-promise.js").HandledPromiseStaticMethods) => (<T>(x: T) => ECallableOrMethods<RemoteFunctions<T>>) & {
    /**
     * E.get(x) returns a proxy on which you can get arbitrary properties.
     * Each of these properties returns a promise for the property.  The promise
     * value will be the property fetched from whatever 'x' designates (or
     * resolves to) in a future turn, not this one.
     *
     * @template T
     * @param {T} x target for property get
     * @returns {EGetters<LocalRecord<T>>} property get proxy
     * @readonly
     */
    readonly get: <T_1>(x: T_1) => EGetters<LocalRecord<T_1>>;
    /**
     * E.resolve(x) converts x to a handled promise. It is
     * shorthand for HandledPromise.resolve(x)
     *
     * @template T
     * @param {T} x value to convert to a handled promise
     * @returns {Promise<Awaited<T>>} handled promise for x
     * @readonly
     */
    readonly resolve: {
        (): Promise<void>;
        <T_2>(value: T_2): Promise<Awaited<T_2>>;
        <T_3>(value: T_3 | PromiseLike<T_3>): Promise<Awaited<T_3>>;
    };
    /**
     * E.sendOnly returns a proxy similar to E, but for which the results
     * are ignored (undefined is returned).
     *
     * @template T
     * @param {T} x target for method/function call
     * @returns {ESendOnlyCallableOrMethods<RemoteFunctions<T>>} method/function call proxy
     * @readonly
     */
    readonly sendOnly: <T_4>(x: T_4) => ESendOnlyCallableOrMethods<RemoteFunctions<T_4>>;
    /**
     * E.when(x, res, rej) is equivalent to
     * HandledPromise.resolve(x).then(res, rej)
     *
     * @template T
     * @template [U = T]
     * @param {T|PromiseLike<T>} x value to convert to a handled promise
     * @param {(value: T) => ERef<U>} [onfulfilled]
     * @param {(reason: any) => ERef<U>} [onrejected]
     * @returns {Promise<U>}
     * @readonly
     */
    readonly when: <T_5, U = T_5>(x: T_5 | PromiseLike<T_5>, onfulfilled?: ((value: T_5) => ERef<U>) | undefined, onrejected?: ((reason: any) => ERef<U>) | undefined) => Promise<U>;
}>;
/**
 * Creates a type that accepts both near and marshalled references that were
 * returned from `Remotable` or `Far`, and also promises for such references.
 */
export type FarRef<Primary, Local = DataOnly<Primary>> = ERef<Local & import('./types').RemotableBrand<Local, Primary>>;
/**
 * `DataOnly<T>` means to return a record type `T2` consisting only of
 * properties that are *not* functions.
 */
export type DataOnly<T> = Omit<T, FilteredKeys<T, import('./types').Callable>>;
export type ERef<T> = PromiseLike<T> | T;
export type ECallable<T extends import("./types").Callable> = ReturnType<T> extends PromiseLike<infer U> ? T : (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>;
export type EMethods<T> = { readonly [P in keyof T]: T[P] extends import("./types").Callable ? ECallable<T[P]> : never; };
export type EGetters<T> = { readonly [P in keyof T]: T[P] extends PromiseLike<infer U> ? T[P] : Promise<Awaited<T[P]>>; };
export type ESendOnlyCallable<T extends import("./types").Callable> = (...args: Parameters<T>) => Promise<void>;
export type ESendOnlyMethods<T> = { readonly [P in keyof T]: T[P] extends import("./types").Callable ? ESendOnlyCallable<T[P]> : never; };
export type ESendOnlyCallableOrMethods<T> = (T extends import('./types').Callable ? ESendOnlyCallable<T> & ESendOnlyMethods<Required<T>> : ESendOnlyMethods<Required<T>>);
export type ECallableOrMethods<T> = (T extends import('./types').Callable ? ECallable<T> & EMethods<Required<T>> : EMethods<Required<T>>);
/**
 * Return a union of property names/symbols/numbers P for which the record element T[P]'s type extends U.
 *
 * Given const x = { a: 123, b: 'hello', c: 42, 49: () => {}, 53: 67 },
 *
 * FilteredKeys<typeof x, number> is the type 'a' | 'c' | 53.
 * FilteredKeys<typeof x, string> is the type 'b'.
 * FilteredKeys<typeof x, 42 | 67> is the type 'c' | 53.
 * FilteredKeys<typeof x, boolean> is the type never.
 */
export type FilteredKeys<T, U> = { [P in keyof T]: T[P] extends U ? P : never; }[keyof T];
/**
 * `PickCallable<T>` means to return a single root callable or a record type
 * consisting only of properties that are functions.
 */
export type PickCallable<T> = T extends import("./types").Callable ? (...args: Parameters<T>) => ReturnType<T> : Pick<T, FilteredKeys<T, import("./types").Callable>>;
/**
 * `RemoteFunctions<T>` means to return the functions and properties that are remotely callable.
 */
export type RemoteFunctions<T> = T extends import("./types").RemotableBrand<infer L, infer R> ? PickCallable<R> : Awaited<T> extends import("./types").RemotableBrand<infer L_1, infer R_1> ? PickCallable<R_1> : T extends PromiseLike<infer U> ? Awaited<T> : T;
export type LocalRecord<T> = T extends import("./types").RemotableBrand<infer L, infer R> ? L : Awaited<T> extends import("./types").RemotableBrand<infer L_1, infer R_1> ? L_1 : T extends PromiseLike<infer U> ? Awaited<T> : T;
export type EPromiseKit<R = unknown> = {
    promise: Promise<R>;
    settler: import('./types').Settler<R>;
};
/**
 * Type for an object that must only be invoked with E.  It supports a given
 * interface but declares all the functions as asyncable.
 */
export type EOnly<T> = T extends import("./types").Callable ? (...args: Parameters<T>) => ERef<Awaited<EOnly<ReturnType<T>>>> : T extends Record<PropertyKey, import("./types").Callable> ? { [K in keyof T]: T[K] extends import("./types").Callable ? (...args: Parameters<T[K]>) => ERef<Awaited<EOnly<ReturnType<T[K]>>>> : T[K]; } : T;
/**
 * @param {import('./types').HandledPromiseConstructor} HandledPromise
 */
declare function makeE(HandledPromise: import('./types').HandledPromiseConstructor): (<T>(x: T) => ECallableOrMethods<RemoteFunctions<T>>) & {
    /**
     * E.get(x) returns a proxy on which you can get arbitrary properties.
     * Each of these properties returns a promise for the property.  The promise
     * value will be the property fetched from whatever 'x' designates (or
     * resolves to) in a future turn, not this one.
     *
     * @template T
     * @param {T} x target for property get
     * @returns {EGetters<LocalRecord<T>>} property get proxy
     * @readonly
     */
    readonly get: <T_1>(x: T_1) => EGetters<LocalRecord<T_1>>;
    /**
     * E.resolve(x) converts x to a handled promise. It is
     * shorthand for HandledPromise.resolve(x)
     *
     * @template T
     * @param {T} x value to convert to a handled promise
     * @returns {Promise<Awaited<T>>} handled promise for x
     * @readonly
     */
    readonly resolve: {
        (): Promise<void>;
        <T_2>(value: T_2): Promise<Awaited<T_2>>;
        <T_3>(value: T_3 | PromiseLike<T_3>): Promise<Awaited<T_3>>;
    };
    /**
     * E.sendOnly returns a proxy similar to E, but for which the results
     * are ignored (undefined is returned).
     *
     * @template T
     * @param {T} x target for method/function call
     * @returns {ESendOnlyCallableOrMethods<RemoteFunctions<T>>} method/function call proxy
     * @readonly
     */
    readonly sendOnly: <T_4>(x: T_4) => ESendOnlyCallableOrMethods<RemoteFunctions<T_4>>;
    /**
     * E.when(x, res, rej) is equivalent to
     * HandledPromise.resolve(x).then(res, rej)
     *
     * @template T
     * @template [U = T]
     * @param {T|PromiseLike<T>} x value to convert to a handled promise
     * @param {(value: T) => ERef<U>} [onfulfilled]
     * @param {(reason: any) => ERef<U>} [onrejected]
     * @returns {Promise<U>}
     * @readonly
     */
    readonly when: <T_5, U = T_5>(x: T_5 | PromiseLike<T_5>, onfulfilled?: ((value: T_5) => ERef<U>) | undefined, onrejected?: ((reason: any) => ERef<U>) | undefined) => Promise<U>;
};
//# sourceMappingURL=E.d.ts.map
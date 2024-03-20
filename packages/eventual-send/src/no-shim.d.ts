export const E: (<T>(x: T) => import("./E.js").ECallableOrMethods<import("./E.js").RemoteFunctions<T>>) & {
    readonly get: <T_1>(x: T_1) => import("./E.js").EGetters<import("./E.js").LocalRecord<T_1>>;
    readonly resolve: {
        (): Promise<void>;
        <T_2>(value: T_2): Promise<Awaited<T_2>>;
        <T_3>(value: T_3 | PromiseLike<T_3>): Promise<Awaited<T_3>>;
    };
    readonly sendOnly: <T_4>(x: T_4) => import("./E.js").ESendOnlyCallableOrMethods<import("./E.js").RemoteFunctions<T_4>>;
    readonly when: <T_5, U = T_5>(x: T_5 | PromiseLike<T_5>, onfulfilled?: ((value: T_5) => import("./E.js").ERef<U>) | undefined, onrejected?: ((reason: any) => import("./E.js").ERef<U>) | undefined) => Promise<U>;
};
export { hp as HandledPromise };
export * from "./exports.js";
declare const hp: {
    new <R>(executor: import("./handled-promise.js").HandledExecutor<R>, unfulfilledHandler?: import("./handled-promise.js").Handler<Promise<unknown>> | undefined): Promise<R>;
    prototype: Promise<unknown>;
} & PromiseConstructor & import("./handled-promise.js").HandledPromiseStaticMethods;
//# sourceMappingURL=no-shim.d.ts.map
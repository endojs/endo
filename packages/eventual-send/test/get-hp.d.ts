export const HandledPromise: {
    new <R>(executor: import("../src/handled-promise.js").HandledExecutor<R>, unfulfilledHandler?: import("../src/handled-promise.js").Handler<Promise<unknown>> | undefined): Promise<R>;
    prototype: Promise<unknown>;
} & PromiseConstructor & import("../src/handled-promise.js").HandledPromiseStaticMethods;
export const E: (<T>(x: T) => import("../src/E.js").ECallableOrMethods<import("../src/E.js").RemoteFunctions<T>>) & {
    readonly get: <T_1>(x: T_1) => import("../src/E.js").EGetters<import("../src/E.js").LocalRecord<T_1>>;
    readonly resolve: {
        (): Promise<void>;
        <T_2>(value: T_2): Promise<Awaited<T_2>>;
        <T_3>(value: T_3 | PromiseLike<T_3>): Promise<Awaited<T_3>>;
    };
    readonly sendOnly: <T_4>(x: T_4) => import("../src/E.js").ESendOnlyCallableOrMethods<import("../src/E.js").RemoteFunctions<T_4>>;
    readonly when: <T_5, U = T_5>(x: T_5 | PromiseLike<T_5>, onfulfilled?: ((value: T_5) => import("../src/E.js").ERef<U>) | undefined, onrejected?: ((reason: any) => import("../src/E.js").ERef<U>) | undefined) => Promise<U>;
};
//# sourceMappingURL=get-hp.d.ts.map
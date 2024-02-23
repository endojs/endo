export function makeReleasingExecutorKit<T>(): Pick<import("./types.js").PromiseKit<T>, "resolve" | "reject"> & {
    executor: PromiseExecutor<T>;
};
/**
 * The promise executor
 */
export type PromiseExecutor<T> = (resolve: (value: import('./types.js').ERef<T>) => void, reject: (reason: any) => void) => any;
//# sourceMappingURL=promise-executor-kit.d.ts.map
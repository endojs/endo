export function makeHandledPromise(): {
    new <R>(executor: HandledExecutor<R>, unfulfilledHandler?: Handler<Promise<unknown>>): Promise<R>;
    prototype: Promise<unknown>;
} & PromiseConstructor & HandledPromiseStaticMethods;
export type Handler<T> = {
    get?(p: T, name: PropertyKey, returnedP?: Promise<unknown>): unknown;
    getSendOnly?(p: T, name: PropertyKey): void;
    applyFunction?(p: T, args: unknown[], returnedP?: Promise<unknown>): unknown;
    applyFunctionSendOnly?(p: T, args: unknown[]): void;
    applyMethod?(p: T, name: PropertyKey | undefined, args: unknown[], returnedP?: Promise<unknown>): unknown;
    applyMethodSendOnly?(p: T, name: PropertyKey | undefined, args: unknown[]): void;
};
export type ResolveWithPresenceOptionsBag<T extends {}> = {
    proxy?: {
        handler: ProxyHandler<T>;
        target: unknown;
        revokerCallback?(revoker: () => void): void;
    } | undefined;
};
export type HandledExecutor<R = unknown> = (resolveHandled: (value?: R) => void, rejectHandled: (reason?: unknown) => void, resolveWithPresence: (presenceHandler: Handler<{}>, options?: ResolveWithPresenceOptionsBag<{}>) => object) => void;
export type Settler<R = unknown> = {
    resolve(value?: R): void;
    reject(reason: unknown): void;
    resolveWithPresence(presenceHandler?: Handler<{}>, options?: ResolveWithPresenceOptionsBag<{}>): object;
};
export type HandledPromiseStaticMethods = {
    applyFunction(target: unknown, args: unknown[]): Promise<unknown>;
    applyFunctionSendOnly(target: unknown, args: unknown[]): void;
    applyMethod(target: unknown, prop: PropertyKey | undefined, args: unknown[]): Promise<unknown>;
    applyMethodSendOnly(target: unknown, prop: PropertyKey, args: unknown[]): void;
    get(target: unknown, prop: PropertyKey): Promise<unknown>;
    getSendOnly(target: unknown, prop: PropertyKey): void;
};
export type HandledPromiseConstructor = ReturnType<typeof makeHandledPromise>;
//# sourceMappingURL=handled-promise.d.ts.map
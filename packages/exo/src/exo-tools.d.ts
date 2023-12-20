export function defendPrototype<T extends Record<PropertyKey, CallableFunction>>(tag: string, contextProvider: ContextProvider, behaviorMethods: T, thisfulMethods?: boolean | undefined, interfaceGuard?: InterfaceGuard<{ [M in keyof T]: import("@endo/patterns").MethodGuard; }> | undefined): T & import("./get-interface.js").GetInterfaceGuard<T> & import("@endo/eventual-send").RemotableBrand<{}, T & import("./get-interface.js").GetInterfaceGuard<T>>;
export function defendPrototypeKit<F extends Record<string, Methods>>(tag: string, contextProviderKit: { [K in keyof F]: KitContextProvider; }, behaviorMethodsKit: F, thisfulMethods?: boolean | undefined, interfaceGuardKit?: { [K_1 in keyof F]: InterfaceGuard<Record<keyof F[K_1], import("@endo/patterns").MethodGuard>>; } | undefined): Record<keyof F, F[keyof F] & import("./get-interface.js").GetInterfaceGuard<F[keyof F]> & import("@endo/eventual-send").RemotableBrand<{}, F[keyof F] & import("./get-interface.js").GetInterfaceGuard<F[keyof F]>>>;
export type Method = import('@endo/patterns').Method;
export type MethodGuard = import('@endo/patterns').MethodGuard;
export type MethodGuardPayload = import('@endo/patterns').MethodGuardPayload;
export type InterfaceGuard<T extends Record<PropertyKey, import("@endo/patterns").MethodGuard> = Record<PropertyKey, import("@endo/patterns").MethodGuard>> = import('@endo/patterns').InterfaceGuard<T>;
export type MatchConfig = {
    declaredLen: number;
    hasRestArgGuard: boolean;
    restArgGuardIsRaw: boolean;
    paramsPattern: import('@endo/patterns').Pattern;
    redactedIndices: number[];
};
export type FacetName = string;
export type Methods = Record<PropertyKey, CallableFunction>;
export type ClassContext<S = any, M extends Methods = any> = {
    state: S;
    self: M;
};
export type KitContext<S = any, F extends Record<string, Methods> = any> = {
    state: S;
    facets: F;
};
export type KitContextProvider = (facet: any) => KitContext;
export type ContextProvider = KitContextProvider | ((representative: any) => ClassContext);
//# sourceMappingURL=exo-tools.d.ts.map
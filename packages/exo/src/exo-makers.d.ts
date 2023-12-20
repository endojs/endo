export function initEmpty(): {};
export function defineExoClass<I extends (...args: any[]) => any, M extends import("./exo-tools.js").Methods>(tag: string, interfaceGuard: import("@endo/patterns").InterfaceGuard<{ [K in keyof M]: import("@endo/patterns").MethodGuard; }> | undefined, init: I, methods: M & ThisType<{
    self: Guarded<M>;
    state: ReturnType<I>;
}>, options?: FarClassOptions<ClassContext<S, M_1>> | undefined): (...args: Parameters<I>) => Guarded<M>;
export function defineExoClassKit<I extends (...args: any[]) => any, F extends Record<string, import("./exo-tools.js").Methods>>(tag: string, interfaceGuardKit: { [K in keyof F]: import("@endo/patterns").InterfaceGuard<{ [M in keyof F[K]]: import("@endo/patterns").MethodGuard; }>; } | undefined, init: I, methodsKit: F & { [K_1 in keyof F]: ThisType<{
    facets: GuardedKit<F>;
    state: ReturnType<I>;
}>; }, options?: FarClassOptions<KitContext<S, F_1>> | undefined): (...args: Parameters<I>) => GuardedKit<F>;
export function makeExo<T extends import("./exo-tools.js").Methods>(tag: string, interfaceGuard: import("@endo/patterns").InterfaceGuard<{ [M in keyof T]: import("@endo/patterns").MethodGuard; }> | undefined, methods: T, options?: FarClassOptions<ClassContext<S, M_1>> | undefined): Guarded<T>;
export type FacetName = import('./exo-tools.js').FacetName;
export type Methods = import('./exo-tools.js').Methods;
export type ClassContext<S = any, M extends import("./exo-tools.js").Methods = any> = import('./exo-tools.js').ClassContext;
export type KitContext<S = any, F extends Record<string, import("./exo-tools.js").Methods> = any> = import('./exo-tools.js').KitContext;
/**
 * It looks like a copyRecord pattern, but the interpretation is different.
 * Each property is distinct, is checked and changed separately.
 */
export type StateShape = {
    [name: string]: any;
};
export type Revoker = (exo: any) => boolean;
export type ReceiveRevoker = (revoke: Revoker) => void;
export type FarClassOptions<C> = {
    finish?: ((context: C) => void) | undefined;
    stateShape?: StateShape | undefined;
    receiveRevoker?: ReceiveRevoker | undefined;
};
export type Farable<M extends import("./exo-tools.js").Methods> = M & import('@endo/eventual-send').RemotableBrand<{}, M>;
export type Guarded<M extends import("./exo-tools.js").Methods> = Farable<M & import('./get-interface.js').GetInterfaceGuard<M>>;
export type GuardedKit<F extends Record<string, import("./exo-tools.js").Methods>> = { [K in keyof F]: Guarded<F[K]>; };
//# sourceMappingURL=exo-makers.d.ts.map
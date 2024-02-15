export function initEmpty(): {};
export function defineExoClass<I extends (...args: any[]) => any, M extends import("./exo-tools.js").Methods>(tag: string, interfaceGuard: import("@endo/patterns").InterfaceGuard<{ [K in keyof M]: import("@endo/patterns").MethodGuard; }> | undefined, init: I, methods: M & ThisType<{
    self: Guarded<M>;
    state: ReturnType<I>;
}>, options?: FarClassOptions<ClassContext<S, M_1>, any> | undefined): (...args: Parameters<I>) => Guarded<M>;
export function defineExoClassKit<I extends (...args: any[]) => any, F extends Record<string, import("./exo-tools.js").Methods>>(tag: string, interfaceGuardKit: { [K in keyof F]: import("@endo/patterns").InterfaceGuard<{ [M in keyof F[K]]: import("@endo/patterns").MethodGuard; }>; } | undefined, init: I, methodsKit: F & { [K_1 in keyof F]: ThisType<{
    facets: GuardedKit<F>;
    state: ReturnType<I>;
}>; }, options?: FarClassOptions<KitContext<S, F_1>, GuardedKit<F>> | undefined): (...args: Parameters<I>) => GuardedKit<F>;
export function makeExo<T extends import("./exo-tools.js").Methods>(tag: string, interfaceGuard: import("@endo/patterns").InterfaceGuard<{ [M in keyof T]: import("@endo/patterns").MethodGuard; }> | undefined, methods: T, options?: FarClassOptions<ClassContext<S, M_1>, any> | undefined): Guarded<T>;
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
/**
 * Template for function-valued options for exo class or exo class kit
 * definitions, for receiving powers back at definition time. For example,
 * ```js
 * let amplify;
 * const makeFoo = defineExoClassKit(
 *   tag,
 *   interfaceGuardKit,
 *   initFn,
 *   behaviorKit,
 *   {
 *     receiveAmplifier(a) { amplify = a; },
 *   },
 * );
 * ```
 * uses the `receiveAmplifier` option to receive, during the
 * definition of this exo class kit, the power to amplify a facet of the kit.
 */
export type ReceivePower<P extends unknown> = (power: P) => void;
/**
 * The power to amplify a facet instance of the associated exo class kit
 * into the record of all facets of this facet instance's cohort.
 */
export type Amplify<F extends unknown = any> = (exoFacet: any) => F;
/**
 * The power to test if a value is an instance of the
 * associated exo class, or a facet instance of the
 * associated exo class kit. In the later case, if a `facetName` is provided,
 * then it tests only whether the argument is a facet instance of that
 * facet of the associated exo class kit.
 */
export type IsInstance = (exo: any, facetName?: string | undefined) => boolean;
/**
 * Currently, this one options type is used both for regular exo classes
 * as well as exo class kits. However, we may split these into distinct types
 * in the future, as not all options make sense for both uses.
 */
export type FarClassOptions<C extends unknown, F extends unknown = any> = {
    /**
     * If provided, the `finish` function is called after the instance has been
     * initialized and registered, but before it is returned. Try to avoid using
     * `finish` if you can, as we think we'd like to deprecate and retire it.
     * OTOH, if you encounter a compelling need, please let us know so we can
     * revise our plans.
     */
    finish?: ((context: C) => void) | undefined;
    /**
     * If provided, it must be a RecordPattern, i.e., a CopyRecord which is also
     * a Pattern. It thus has an exactly defined set of property names and
     * a Pattern as the value of each property. This is supposed to be an invariant
     * on the properties of an instance state record.
     * TODO Though note that only the virtual and durable exos currently
     * enforce the `stateShape` invariant. The heap exos defined in this
     * package currently ignore `stateShape`, but will enforce this in the future.
     */
    stateShape?: StateShape | undefined;
    /**
     * If a `receiveAmplifier` function is provided, it will be called during
     * definition of the exo class kit with an `Amplify` function. If called
     * during the definition of a normal exo or exo class, it will throw, since
     * only exo kits can be amplified.
     * An `Amplify` function is a function that takes a facet instance of
     * this class kit as an argument, in which case it will return the facets
     * record, giving access to all the facet instances of the same cohort.
     */
    receiveAmplifier?: ReceivePower<Amplify<F>> | undefined;
    /**
     * If a `receiveInstanceTester` function is provided, it will be called
     * during the definition of the exo class or exo class kit with an
     * `IsInstance` function. The first argument of `IsInstance`
     * is the value to be tested. When it may be a facet instance of an
     * exo class kit, the optional second argument, if provided, is
     * a `facetName`. In that case, the function tests only if the first
     * argument is an instance of that facet of the associated exo class kit.
     */
    receiveInstanceTester?: ReceivePower<IsInstance> | undefined;
};
export type Farable<M extends import("./exo-tools.js").Methods> = M & import('@endo/eventual-send').RemotableBrand<{}, M>;
export type Guarded<M extends import("./exo-tools.js").Methods> = Farable<M & import('./get-interface.js').GetInterfaceGuard<M>>;
export type GuardedKit<F extends Record<string, import("./exo-tools.js").Methods>> = { [K in keyof F]: Guarded<F[K]>; };
//# sourceMappingURL=exo-makers.d.ts.map
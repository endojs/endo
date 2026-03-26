import type { InterfaceGuard, TypeFromInterfaceGuard } from '@endo/patterns';
import type {
  Methods,
  Guarded,
  GuardedKit,
  FarClassOptions,
  ClassContext,
  KitContext,
  FacetName,
} from './src/types.js';

/**
 * Create a singleton exo object whose methods are type-checked against
 * the InterfaceGuard at compile time.
 *
 * When a typed InterfaceGuard is provided (built with `M.call(...).returns(...)`),
 * the `methods` parameter is constrained to match the guard's inferred method
 * signatures at compile time.  The return type is derived from the concrete
 * `methods` argument (not the guard), so narrower implementations are preserved.
 *
 * ```ts
 * const FooI = M.interface('Foo', {
 *   bar: M.call(M.string()).returns(M.nat()),
 * });
 * const foo = makeExo('Foo', FooI, {
 *   bar(name) { // name: string — inferred from guard
 *     return 0n; // must return bigint — enforced by guard
 *   },
 * });
 * ```
 */
// Expected behavior: When the guard uses `defaultGuards: 'passable'` (or is
// `InterfaceGuard<any>`), `TypeFromInterfaceGuard` produces a broad
// index-signature type.  Guard-driven enforcement is intentionally disabled
// in this case — `M` is inferred purely from the `methods` argument.
// This is not a TS limitation but the correct semantic: sloppy guards allow
// any method.
//
// TODO: If TypeScript gains exact types for generic object literals, the
// strict overload could be tightened to reject extra methods not listed in
// the guard.  For now, extra methods are silently allowed because excess
// property checking does not apply in generic contexts.
// Also: if `defaultGuards: 'passable'` is detected, extra methods must be
// allowed — so tightening would require the type to be cognizant of the
// defaultGuards option.
//
// Design note: The return type uses the implementation's types (Guarded<M>),
// not the guard's (Guarded<TypeFromInterfaceGuard<G>>).  This preserves
// real parameter names in IDE tooltips.  A consequence is that .optional()
// in a guard does not make a parameter optional in the static type if the
// implementation declares it as required.  This is intentional for change
// management: a guard can use .optional() to avoid breaking old callers at
// runtime, while the implementation's required parameter documents the
// expectation for new code.
export declare function makeExo<
  G extends InterfaceGuard,
  M extends TypeFromInterfaceGuard<G> & Methods,
>(
  tag: string,
  interfaceGuard: G,
  methods: M & ThisType<{ self: Guarded<M, G>; state: {} }>,
  options?: FarClassOptions<ClassContext<{}, M>>,
): Guarded<M, G>;

// Note: `makeExo(tag, undefined, methods)` is runtime-equivalent to
// `makeExo(tag, M.interface(x, {}, { defaultGuards: 'passable' }), methods)`.
// Both allow any methods without guard enforcement.  The typed overload above
// applies only when a specific InterfaceGuard is provided.
export declare function makeExo<M extends Methods>(
  tag: string,
  interfaceGuard: undefined,
  methods: M & ThisType<{ self: Guarded<M>; state: {} }>,
  options?: FarClassOptions<ClassContext<{}, M>>,
): Guarded<M>;

/**
 * Define an exo class whose methods are type-checked against the InterfaceGuard.
 */
export declare function defineExoClass<
  G extends InterfaceGuard,
  I extends (...args: readonly any[]) => any,
  M extends TypeFromInterfaceGuard<G> & Methods,
>(
  tag: string,
  interfaceGuard: G,
  init: I,
  methods: M &
    ThisType<{
      self: Guarded<M, G>;
      state: ReturnType<I>;
    }>,
  options?: FarClassOptions<ClassContext<ReturnType<I>, M>>,
): (...args: Parameters<I>) => Guarded<M, G>;

// Passing `undefined` is runtime-equivalent to passing
// `M.interface(x, {}, { defaultGuards: 'passable' })` — no guard enforcement.
export declare function defineExoClass<
  I extends (...args: readonly any[]) => any,
  M extends Methods,
>(
  tag: string,
  interfaceGuard: undefined,
  init: I,
  methods: M & ThisType<{ self: Guarded<M>; state: ReturnType<I> }>,
  options?: FarClassOptions<ClassContext<ReturnType<I>, M>>,
): (...args: Parameters<I>) => Guarded<M>;

/**
 * Define an exo class kit whose facet methods are type-checked against
 * the InterfaceGuardKit.
 *
 * When the guard kit carries typed InterfaceGuards, each facet's methods
 * are constrained to match the corresponding guard's inferred signatures.
 */
export declare function defineExoClassKit<
  GK extends Record<FacetName, InterfaceGuard>,
  I extends (...args: readonly any[]) => any,
  F extends {
    [K in keyof GK]: TypeFromInterfaceGuard<GK[K]> & Methods;
  },
>(
  tag: string,
  interfaceGuardKit: GK,
  init: I,
  methodsKit: {
    [K in keyof F]: F[K] &
      ThisType<{
        facets: GuardedKit<F, GK>;
        state: ReturnType<I>;
      }>;
  },
  options?: FarClassOptions<
    KitContext<ReturnType<I>, GuardedKit<F, GK>>,
    GuardedKit<F, GK>
  >,
): (...args: Parameters<I>) => GuardedKit<F, GK>;

// Passing `undefined` is runtime-equivalent to passing a guard kit where every
// facet uses `{ defaultGuards: 'passable' }` — no guard enforcement.
export declare function defineExoClassKit<
  I extends (...args: readonly any[]) => any,
  F extends Record<FacetName, Methods>,
>(
  tag: string,
  interfaceGuardKit: Record<FacetName, InterfaceGuard> | undefined,
  init: I,
  methodsKit: {
    [K in keyof F]: F[K] &
      ThisType<{
        facets: GuardedKit<F>;
        state: ReturnType<I>;
      }>;
  },
  options?: FarClassOptions<
    KitContext<ReturnType<I>, GuardedKit<F>>,
    GuardedKit<F>
  >,
): (...args: Parameters<I>) => GuardedKit<F>;

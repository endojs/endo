import type {
  InterfaceGuard,
  TypeFromInterfaceGuard,
} from '@endo/patterns';
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
 * the `methods` parameter must satisfy the inferred method signatures.
 * The return type preserves the concrete method types from `methods`.
 *
 * ```ts
 * const FooI = M.interface('Foo', {
 *   bar: M.call(M.string()).returns(M.nat()),
 * });
 * const foo = makeExo('Foo', FooI, {
 *   bar(name) { // name: string
 *     return 0n; // must return bigint
 *   },
 * });
 * ```
 */
// TS limitation: When the guard is `InterfaceGuard<any>` (e.g., from
// sloppy mode with `defaultGuards: 'passable'`), TypeFromInterfaceGuard
// produces a broad index-signature type, and M is inferred from the
// methods parameter.  Guard-driven enforcement only works when the
// guard carries specific MethodGuard type parameters.
//
// TS limitation: Excess property checking does not apply in generic
// contexts, so passing extra methods not in the guard is not a
// compile-time error.  If TS adds exact types for generics, this
// could be tightened.
export declare function makeExo<
  G extends InterfaceGuard,
  M extends TypeFromInterfaceGuard<G> & Methods,
>(
  tag: string,
  interfaceGuard: G,
  methods: M & ThisType<{ self: Guarded<M>; state: {} }>,
  options?: FarClassOptions<ClassContext<{}, M>>,
): Guarded<M>;

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
    ThisType<{ self: Guarded<M>; state: ReturnType<I> }>,
  options?: FarClassOptions<ClassContext<ReturnType<I>, M>>,
): (...args: Parameters<I>) => Guarded<M>;

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
 */
export declare function defineExoClassKit<
  I extends (...args: any[]) => any,
  F extends Record<FacetName, Methods>,
>(
  tag: string,
  interfaceGuardKit: { [K in keyof F]: InterfaceGuard } | undefined,
  init: I,
  methodsKit: F & {
    [K in keyof F]: ThisType<{
      facets: GuardedKit<F>;
      state: ReturnType<I>;
    }>;
  },
  options?: FarClassOptions<
    KitContext<ReturnType<I>, GuardedKit<F>>,
    GuardedKit<F>
  >,
): (...args: Parameters<I>) => GuardedKit<F>;

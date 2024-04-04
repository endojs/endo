export function initEmpty(): {};
export function defineExoClass<I extends (...args: any[]) => any, M extends Methods>(tag: string, interfaceGuard: ExoClassInterfaceGuard<M> | undefined, init: I, methods: ExoClassMethods<M, I>, options?: FarClassOptions<import("./types.js").ClassContext<ReturnType<I>, M>> | undefined): (...args: Parameters<I>) => Guarded<M>;
export function defineExoClassKit<I extends (...args: any[]) => any, F extends Record<string, Methods>>(tag: string, interfaceGuardKit: ExoClassInterfaceGuardKit<F> | undefined, init: I, methodsKit: ExoClassKitMethods<F, I>, options?: FarClassOptions<KitContext<ReturnType<I>, GuardedKit<F>>, GuardedKit<F>> | undefined): (...args: Parameters<I>) => GuardedKit<F>;
export function makeExo<T extends Methods>(tag: string, interfaceGuard: import("@endo/patterns").InterfaceGuard<{ [M in keyof T]: import("@endo/patterns").MethodGuard; }> | undefined, methods: T, options?: FarClassOptions<import("./types.js").ClassContext<{}, T>> | undefined): Guarded<T>;
import type { Methods } from './types.js';
import type { ExoClassInterfaceGuard } from './types.js';
import type { ExoClassMethods } from './types.js';
import type { FarClassOptions } from './types.js';
import type { Guarded } from './types.js';
import type { ExoClassInterfaceGuardKit } from './types.js';
import type { ExoClassKitMethods } from './types.js';
import type { GuardedKit } from './types.js';
import type { KitContext } from './types.js';
//# sourceMappingURL=exo-makers.d.ts.map
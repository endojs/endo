export function defendPrototype<T extends Record<PropertyKey, CallableFunction>>(tag: string, contextProvider: ContextProvider, behaviorMethods: T, thisfulMethods?: boolean | undefined, interfaceGuard?: InterfaceGuard<{ [M in keyof T]: MethodGuard; }> | undefined): T & import("./get-interface.js").GetInterfaceGuard<T> & import("@endo/pass-style").RemotableObject<`Alleged: ${string}`> & import("@endo/eventual-send").RemotableBrand<{}, T & import("./get-interface.js").GetInterfaceGuard<T>>;
export function defendPrototypeKit<F extends Record<string, Methods>>(tag: string, contextProviderKit: { [K in keyof F]: KitContextProvider; }, behaviorMethodsKit: F, thisfulMethods?: boolean | undefined, interfaceGuardKit?: { [K_1 in keyof F]: InterfaceGuard<Record<keyof F[K_1], MethodGuard>>; } | undefined): Record<keyof F, F[keyof F] & import("./get-interface.js").GetInterfaceGuard<F[keyof F]> & import("@endo/pass-style").RemotableObject<`Alleged: ${string}`> & import("@endo/eventual-send").RemotableBrand<{}, F[keyof F] & import("./get-interface.js").GetInterfaceGuard<F[keyof F]>>>;
import type { ContextProvider } from './types.js';
import type { MethodGuard } from '@endo/patterns';
import type { InterfaceGuard } from '@endo/patterns';
import type { Methods } from './types.js';
import type { KitContextProvider } from './types.js';
//# sourceMappingURL=exo-tools.d.ts.map
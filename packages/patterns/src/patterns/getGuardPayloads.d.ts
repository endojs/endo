export function getAwaitArgGuardPayload(awaitArgGuard: import('./types.js').AwaitArgGuard): import('./types.js').AwaitArgGuardPayload;
export function getMethodGuardPayload(methodGuard: import('./types.js').MethodGuard): import('./types.js').MethodGuardPayload;
export function getInterfaceGuardPayload<T extends Record<PropertyKey, import("./types.js").MethodGuard> = Record<PropertyKey, import("./types.js").MethodGuard>>(interfaceGuard: import("./types.js").InterfaceGuard<T>): import("./types.js").InterfaceGuardPayload<T>;
export function getInterfaceMethodKeys(interfaceGuard: import('./types.js').InterfaceGuard): (string | symbol)[];
//# sourceMappingURL=getGuardPayloads.d.ts.map
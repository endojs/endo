export function getAwaitArgGuardPayload(awaitArgGuard: AwaitArgGuard): AwaitArgGuardPayload;
export function getMethodGuardPayload(methodGuard: MethodGuard): MethodGuardPayload;
export function getInterfaceGuardPayload<T extends Record<PropertyKey, MethodGuard> = Record<PropertyKey, MethodGuard>>(interfaceGuard: InterfaceGuard<T>): InterfaceGuardPayload<T>;
export function getInterfaceMethodKeys(interfaceGuard: InterfaceGuard): (string | symbol)[];
import type { AwaitArgGuard } from '../types.js';
import type { AwaitArgGuardPayload } from '../types.js';
import type { MethodGuard } from '../types.js';
import type { MethodGuardPayload } from '../types.js';
import type { InterfaceGuard } from '../types.js';
import type { InterfaceGuardPayload } from '../types.js';
//# sourceMappingURL=getGuardPayloads.d.ts.map
export function getErrorConstructor(name: string): import('ses').GenericErrorConstructor | undefined;
export function isErrorLike(candidate: unknown): boolean;
export function checkRecursivelyPassableErrorPropertyDesc(propName: string, desc: PropertyDescriptor, passStyleOfRecur: import('./internal-types.js').PassStyleOf, check?: Checker | undefined): boolean;
export function checkRecursivelyPassableError(candidate: unknown, passStyleOfRecur: import('./internal-types.js').PassStyleOf, check?: Checker | undefined): boolean;
/**
 * @type {PassStyleHelper}
 */
export const ErrorHelper: PassStyleHelper;
import type { Checker } from './types.js';
import type { PassStyleHelper } from './internal-types.js';
//# sourceMappingURL=error.d.ts.map
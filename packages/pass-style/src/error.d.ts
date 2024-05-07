export function getErrorConstructor(name: string): import('ses').GenericErrorConstructor | undefined;
export function isErrorLike(candidate: unknown): boolean;
export function checkRecursivelyPassableErrorPropertyDesc(propName: string, desc: PropertyDescriptor, passStyleOfRecur: (val: any) => PassStyle, check?: Checker | undefined): boolean;
export function checkRecursivelyPassableError(candidate: unknown, passStyleOfRecur: (val: any) => PassStyle, check?: Checker | undefined): boolean;
/**
 * @type {PassStyleHelper}
 */
export const ErrorHelper: PassStyleHelper;
import type { PassStyle } from './types.js';
import type { Checker } from './types.js';
import type { PassStyleHelper } from './internal-types.js';
//# sourceMappingURL=error.d.ts.map
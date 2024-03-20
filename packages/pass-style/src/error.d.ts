export function getErrorConstructor(name: string): import('ses').GenericErrorConstructor | undefined;
export function isErrorLike(candidate: unknown): boolean;
export function checkRecursivelyPassableErrorPropertyDesc(propName: string, desc: PropertyDescriptor, passStyleOfRecur: import('./internal-types.js').PassStyleOf, check?: import("./types.js").Checker | undefined): boolean;
export function checkRecursivelyPassableError(candidate: unknown, passStyleOfRecur: import('./internal-types.js').PassStyleOf, check?: import("./types.js").Checker | undefined): boolean;
/**
 * @type {PassStyleHelper}
 */
export const ErrorHelper: PassStyleHelper;
export type PassStyleHelper = import('./internal-types.js').PassStyleHelper;
export type Checker = import('./types.js').Checker;
//# sourceMappingURL=error.d.ts.map
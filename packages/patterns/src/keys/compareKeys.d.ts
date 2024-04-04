/** @template {import('../types.js').Key} [K=import('../types.js').Key] @typedef {import('../types').CopySet<K>} CopySet */
/**
 * CopySet X is smaller than CopySet Y iff all of these conditions hold:
 * 1. For every x in X, x is also in Y.
 * 2. There is a y in Y that is not in X.
 *
 * X is equivalent to Y iff the condition 1 holds but condition 2 does not.
 */
export const setCompare: <K extends unknown>(left: CopySet<K>, right: CopySet<K>) => number;
/**
 * CopyBag X is smaller than CopyBag Y iff all of these conditions hold
 * (where `count(A, a)` is shorthand for the count associated with `a` in `A`):
 * 1. For every x in X, x is also in Y and count(X, x) <= count(Y, x).
 * 2. There is a y in Y such that y is not in X or count(X, y) < count(Y, y).
 *
 * X is equivalent to Y iff the condition 1 holds but condition 2 does not.
 */
export const bagCompare: <K>(left: import("./checkKey.js").CopyBag<K>, right: import("./checkKey.js").CopyBag<K>) => number;
/** @type {import('../types').KeyCompare} */
export const compareKeys: import('../types').KeyCompare;
export function keyLT(left: any, right: any): boolean;
export function keyLTE(left: any, right: any): boolean;
export function keyEQ(left: any, right: any): boolean;
export function keyGTE(left: any, right: any): boolean;
export function keyGT(left: any, right: any): boolean;
export type CopySet<K extends unknown = any> = import('../types').CopySet<K>;
//# sourceMappingURL=compareKeys.d.ts.map
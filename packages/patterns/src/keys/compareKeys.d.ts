/** @import {CopySet, Key, KeyCompare} from '../types.js' */
/**
 * CopySet X is smaller than CopySet Y iff all of these conditions hold:
 * 1. For every x in X, x is also in Y.
 * 2. There is a y in Y that is not in X.
 *
 * X is equivalent to Y iff the condition 1 holds but condition 2 does not.
 */
export const setCompare: <K extends Key>(left: CopySet<K>, right: CopySet<K>) => number;
/**
 * CopyBag X is smaller than CopyBag Y iff all of these conditions hold
 * (where `count(A, a)` is shorthand for the count associated with `a` in `A`):
 * 1. For every x in X, x is also in Y and count(X, x) <= count(Y, x).
 * 2. There is a y in Y such that y is not in X or count(X, y) < count(Y, y).
 *
 * X is equivalent to Y iff the condition 1 holds but condition 2 does not.
 */
export const bagCompare: <K extends Key>(left: import("../types.js").CopyBag<K>, right: import("../types.js").CopyBag<K>) => number;
/** @type {KeyCompare} */
export const compareKeys: KeyCompare;
export function keyLT(left: any, right: any): boolean;
export function keyLTE(left: any, right: any): boolean;
export function keyEQ(left: any, right: any): boolean;
export function keyGTE(left: any, right: any): boolean;
export function keyGT(left: any, right: any): boolean;
import type { Key } from '../types.js';
import type { CopySet } from '../types.js';
import type { KeyCompare } from '../types.js';
//# sourceMappingURL=compareKeys.d.ts.map
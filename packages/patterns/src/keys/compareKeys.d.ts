export function setCompare<K extends unknown>(left: CopySet<K>, right: CopySet<K>): number;
export function bagCompare<K>(left: import("./checkKey.js").CopyBag<K>, right: import("./checkKey.js").CopyBag<K>): number;
/** @type {import('../types').KeyCompare} */
export const compareKeys: import('../types').KeyCompare;
export function keyLT(left: any, right: any): boolean;
export function keyLTE(left: any, right: any): boolean;
export function keyEQ(left: any, right: any): boolean;
export function keyGTE(left: any, right: any): boolean;
export function keyGT(left: any, right: any): boolean;
export type CopySet<K extends unknown = any> = import('../types').CopySet<K>;
//# sourceMappingURL=compareKeys.d.ts.map
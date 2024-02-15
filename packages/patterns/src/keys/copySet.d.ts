export function assertNoDuplicates<T>(elements: T[], fullCompare?: import("@endo/marshal").RankCompare | undefined): void;
export function checkElements(elements: Passable[], check: Checker): boolean;
export function assertElements(elements: any): void;
export function coerceToElements(elementsList: any): any[];
export function makeSetOfElements<K>(elementIter: Iterable<K>): CopySet<K>;
export type CopySet<K extends unknown = any> = import('../types').CopySet<K>;
export type Key = import('../types').Key;
export type FullCompare = import('../types').FullCompare;
export type Checker = import('@endo/marshal').Checker;
export type Passable = import('@endo/pass-style').Passable;
//# sourceMappingURL=copySet.d.ts.map
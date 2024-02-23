export function assertNoDuplicateKeys<T>(bagEntries: [T, bigint][], fullCompare?: import("@endo/marshal").RankCompare | undefined): void;
export function checkBagEntries(bagEntries: [Passable, bigint][], check: Checker): boolean;
export function assertBagEntries(bagEntries: [Passable, bigint][]): asserts bagEntries is [any, bigint][];
export function coerceToBagEntries(bagEntriesList: any): [any, bigint][];
export function makeBagOfEntries<K>(bagEntryIter: Iterable<[K, bigint]>): CopyBag<K>;
export type CopyBag<K extends unknown = any> = import('../types').CopyBag<K>;
export type Key = import('../types').Key;
export type FullCompare = import('../types').FullCompare;
export type Checker = import('@endo/marshal').Checker;
export type Passable = import('@endo/pass-style').Passable;
//# sourceMappingURL=copyBag.d.ts.map
export function assertNoDuplicateKeys<T>(bagEntries: [T, bigint][], fullCompare?: import("@endo/marshal").RankCompare | undefined): void;
export function checkBagEntries(bagEntries: [any, bigint][], check: Checker): boolean;
export function assertBagEntries(bagEntries: [any, bigint][]): asserts bagEntries is [any, bigint][];
export function coerceToBagEntries(bagEntriesList: any): [any, bigint][];
export function makeBagOfEntries<K>(bagEntryIter: Iterable<[K, bigint]>): CopyBag<K>;
export type CopyBag<K extends unknown = any> = import('../types').CopyBag<K>;
import type { Checker } from '@endo/marshal';
//# sourceMappingURL=copyBag.d.ts.map
export function assertNoDuplicateKeys<T extends Key>(bagEntries: [T, bigint][], fullCompare?: import("@endo/marshal").RankCompare | undefined): void;
export function checkBagEntries(bagEntries: [Passable, bigint][], check: Checker): boolean;
export function assertBagEntries(bagEntries: [Passable, bigint][]): asserts bagEntries is [Passable, bigint][];
export function coerceToBagEntries<K extends Key>(bagEntriesList: Iterable<[K, bigint]>): [K, bigint][];
export function makeBagOfEntries<K extends Key>(bagEntryIter: Iterable<[K, bigint]>): CopyBag<K>;
import type { Key } from '../types.js';
import type { Passable } from '@endo/pass-style';
import type { Checker } from '@endo/marshal';
import type { CopyBag } from '../types.js';
//# sourceMappingURL=copyBag.d.ts.map
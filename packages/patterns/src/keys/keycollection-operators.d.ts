export function generateCollectionPairEntries<C = import("../types").KeyCollection, V = unknown>(c1: C, c2: C, getEntries: (collection: C) => [any, V][], absentValue: any): IterableIterator<[any, any, any]>;
export function makeCompareCollection<C = import("../types").KeyCollection, V = unknown>(getEntries: (collection: C) => [any, V][], absentValue: any, compareValues: KeyCompare): (left: C, right: C) => KeyComparison;
export type RankCompare = import('@endo/marshal').RankCompare;
export type KeyComparison = import('../types').KeyComparison;
export type KeyCompare = import('../types').KeyCompare;
export type FullCompare = import('../types').FullCompare;
export type KeyCollection = import('../types').KeyCollection;
//# sourceMappingURL=keycollection-operators.d.ts.map
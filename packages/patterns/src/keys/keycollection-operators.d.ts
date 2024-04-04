export function generateCollectionPairEntries<C = KeyCollection, V = unknown>(c1: C, c2: C, getEntries: (collection: C) => [any, V][], absentValue: any): IterableIterator<[any, any, any]>;
export function makeCompareCollection<C = KeyCollection, V = unknown>(getEntries: (collection: C) => [any, V][], absentValue: any, compareValues: KeyCompare): (left: C, right: C) => number;
import type { KeyCollection } from '../types';
import type { KeyCompare } from '../types';
//# sourceMappingURL=keycollection-operators.d.ts.map
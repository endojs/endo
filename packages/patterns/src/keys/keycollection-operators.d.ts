export function generateCollectionPairEntries<C = KeyCollection, V = unknown>(c1: C, c2: C, getEntries: (collection: C) => [Key, V][], absentValue: any): IterableIterator<[Key, any, any]>;
export function makeCompareCollection<C = KeyCollection, V = unknown>(getEntries: (collection: C) => [Key, V][], absentValue: any, compareValues: KeyCompare): (left: C, right: C) => number;
import type { KeyCollection } from '../types.js';
import type { Key } from '../types.js';
import type { KeyCompare } from '../types.js';
//# sourceMappingURL=keycollection-operators.d.ts.map
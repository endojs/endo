export function assertNoDuplicates<T extends Passable>(elements: T[], fullCompare?: import("@endo/marshal").RankCompare | undefined): void;
export function checkElements(elements: Passable[], check: Checker): boolean;
export function assertElements(elements: any): void;
export function coerceToElements<K extends Key>(elementsList: Iterable<K>): K[];
export function makeSetOfElements<K extends Key>(elementIter: Iterable<K>): CopySet<K>;
import type { Passable } from '@endo/pass-style';
import type { Checker } from '@endo/marshal';
import type { Key } from '../types.js';
import type { CopySet } from '../types.js';
//# sourceMappingURL=copySet.d.ts.map
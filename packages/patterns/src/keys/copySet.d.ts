export function assertNoDuplicates<T>(elements: T[], fullCompare?: import("@endo/marshal").RankCompare | undefined): void;
export function checkElements(elements: any[], check: Checker): boolean;
export function assertElements(elements: any): void;
export function coerceToElements(elementsList: any): any[];
export function makeSetOfElements<K>(elementIter: Iterable<K>): CopySet<K>;
import type { Checker } from '@endo/marshal';
import type { CopySet } from '../types';
//# sourceMappingURL=copySet.d.ts.map
export function isPrimitiveKey(val: any): boolean;
export function assertPrimitiveKey(val: Passable): void;
export function checkScalarKey(val: Passable, check: Checker): boolean;
export function isScalarKey(val: any): boolean;
export function assertScalarKey(val: Passable): void;
export function checkKey(val: unknown, check: Checker): boolean;
/**
 * @type {{
 *   (val: Passable): val is Key;
 *   (val: any): boolean;
 * }}
 */
export const isKey: {
    (val: Passable): val is Key;
    (val: any): boolean;
};
export function assertKey(val: Key): asserts val is Key;
export function checkCopySet(s: any, check: Checker): boolean;
export function isCopySet(s: any): s is CopySet;
/**
 * @callback AssertCopySet
 * @param {Passable} s
 * @returns {asserts s is CopySet}
 */
/** @type {AssertCopySet} */
export const assertCopySet: AssertCopySet;
export function getCopySetKeys<K extends Key>(s: CopySet<K>): K[];
export function everyCopySetKey<K extends Key>(s: CopySet<K>, fn: (key: K, index: number) => boolean): boolean;
export function makeCopySet<K extends Key>(elementIter: Iterable<K>): CopySet<K>;
export function checkCopyBag(b: any, check: Checker): boolean;
export function isCopyBag(b: any): b is CopyBag;
/**
 * @callback AssertCopyBag
 * @param {Passable} b
 * @returns {asserts b is CopyBag}
 */
/** @type {AssertCopyBag} */
export const assertCopyBag: AssertCopyBag;
export function getCopyBagEntries<K extends Key>(b: CopyBag<K>): [K, bigint][];
export function everyCopyBagEntry<K extends Key>(b: CopyBag<K>, fn: (entry: [K, bigint], index: number) => boolean): boolean;
export function makeCopyBag<K extends Key>(bagEntryIter: Iterable<[K, bigint]>): CopyBag<K>;
export function makeCopyBagFromElements<K extends Key>(elementIter: Iterable<K>): CopyBag<K>;
export function checkCopyMap(m: any, check: Checker): boolean;
export function isCopyMap(m: any): m is CopyMap<Key, Passable>;
export function assertCopyMap(m: Passable): asserts m is CopyMap<Key, Passable>;
export function getCopyMapKeys<K extends Key, V extends Passable>(m: CopyMap<K, V>): K[];
export function getCopyMapValues<K extends Key, V extends Passable>(m: CopyMap<K, V>): V[];
export function getCopyMapEntryArray<K extends Key, V extends Passable>(m: CopyMap<K, V>): [K, V][];
export function getCopyMapEntries<K extends Key, V extends Passable>(m: CopyMap<K, V>): Iterable<[K, V]>;
export function everyCopyMapKey<K extends Key, V extends Passable>(m: CopyMap<K, V>, fn: (key: K, index: number) => boolean): boolean;
export function everyCopyMapValue<K extends Key, V extends Passable>(m: CopyMap<K, V>, fn: (value: V, index: number) => boolean): boolean;
export function copyMapKeySet<K extends Key, V extends Passable>(m: CopyMap<K, V>): CopySet<K>;
export function makeCopyMap<K extends Key, V extends Passable>(entries: Iterable<[K, V]>): CopyMap<K, V>;
export type AssertCopySet = (s: Passable) => asserts s is CopySet;
export type AssertCopyBag = (b: Passable) => asserts b is CopyBag;
import type { Passable } from '@endo/pass-style';
import type { Checker } from '@endo/marshal';
import type { Key } from '../types.js';
import type { CopySet } from '../types.js';
import type { CopyBag } from '../types.js';
import type { CopyMap } from '../types.js';
//# sourceMappingURL=checkKey.d.ts.map
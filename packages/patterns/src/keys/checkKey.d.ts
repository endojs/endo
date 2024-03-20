export function isPrimitiveKey(val: Passable): boolean;
export function assertPrimitiveKey(val: Passable): void;
export function checkScalarKey(val: Passable, check: Checker): boolean;
export function isScalarKey(val: Passable): boolean;
export function assertScalarKey(val: Passable): void;
export function checkKey(val: Passable, check: Checker): boolean;
export function isKey(val: Passable): boolean;
export function assertKey(val: Key): void;
export function checkCopySet(s: Passable, check: Checker): boolean;
/**
 * @callback IsCopySet
 * @param {Passable} s
 * @returns {s is CopySet}
 */
/** @type {IsCopySet} */
export const isCopySet: IsCopySet;
/**
 * @callback AssertCopySet
 * @param {Passable} s
 * @returns {asserts s is CopySet}
 */
/** @type {AssertCopySet} */
export const assertCopySet: AssertCopySet;
export function getCopySetKeys<K>(s: CopySet<K>): K[];
export function everyCopySetKey<K>(s: CopySet<K>, fn: (key: K, index: number) => boolean): boolean;
export function makeCopySet<K>(elementIter: Iterable<K>): CopySet<K>;
export function checkCopyBag(b: Passable, check: Checker): boolean;
/**
 * @callback IsCopyBag
 * @param {Passable} b
 * @returns {b is CopyBag}
 */
/** @type {IsCopyBag} */
export const isCopyBag: IsCopyBag;
/**
 * @callback AssertCopyBag
 * @param {Passable} b
 * @returns {asserts b is CopyBag}
 */
/** @type {AssertCopyBag} */
export const assertCopyBag: AssertCopyBag;
export function getCopyBagEntries<K>(b: CopyBag<K>): [K, bigint][];
export function everyCopyBagEntry<K>(b: CopyBag<K>, fn: (entry: [K, bigint], index: number) => boolean): boolean;
export function makeCopyBag<K>(bagEntryIter: Iterable<[K, bigint]>): CopyBag<K>;
export function makeCopyBagFromElements<K>(elementIter: Iterable<K>): CopyBag<K>;
export function checkCopyMap(m: Passable, check: Checker): boolean;
/**
 * @callback IsCopyMap
 * @param {Passable} m
 * @returns {m is CopyMap<Key, Passable>}
 */
/** @type {IsCopyMap} */
export const isCopyMap: IsCopyMap;
/**
 * @callback AssertCopyMap
 * @param {Passable} m
 * @returns {asserts m is CopyMap<Key, Passable>}
 */
/** @type {AssertCopyMap} */
export const assertCopyMap: AssertCopyMap;
export function getCopyMapKeys<K extends unknown, V extends unknown>(m: CopyMap<K, V>): K[];
export function getCopyMapValues<K extends unknown, V extends unknown>(m: CopyMap<K, V>): V[];
export function getCopyMapEntryArray<K extends unknown, V extends unknown>(m: CopyMap<K, V>): [K, V][];
export function getCopyMapEntries<K extends unknown, V extends unknown>(m: CopyMap<K, V>): Iterable<[K, V]>;
export function everyCopyMapKey<K extends unknown, V extends unknown>(m: CopyMap<K, V>, fn: (key: K, index: number) => boolean): boolean;
export function everyCopyMapValue<K extends unknown, V extends unknown>(m: CopyMap<K, V>, fn: (value: V, index: number) => boolean): boolean;
export function copyMapKeySet<K extends unknown, V extends unknown>(m: CopyMap<K, V>): CopySet<K>;
export function makeCopyMap<K extends unknown, V extends unknown>(entries: Iterable<[K, V]>): CopyMap<K, V>;
export type Checker = import('@endo/marshal').Checker;
export type Passable = import('@endo/pass-style').Passable;
export type KeyComparison = import('../types').KeyComparison;
export type Key = import('../types').Key;
export type CopyBag<K extends unknown = any> = import('../types').CopyBag<K>;
export type CopySet<K extends unknown = any> = import('../types').CopySet<K>;
export type CopyMap<K extends unknown = any, V extends unknown = any> = import('../types').CopyMap<K, V>;
export type KeyCompare = import('../types').KeyCompare;
export type FullCompare = import('../types').FullCompare;
export type IsCopySet = (s: Passable) => s is CopySet<any>;
export type AssertCopySet = (s: Passable) => asserts s is CopySet<any>;
export type IsCopyBag = (b: Passable) => b is CopyBag<any>;
export type AssertCopyBag = (b: Passable) => asserts b is CopyBag<any>;
export type IsCopyMap = (m: Passable) => m is CopyMap<any, any>;
export type AssertCopyMap = (m: Passable) => asserts m is CopyMap<any, any>;
//# sourceMappingURL=checkKey.d.ts.map
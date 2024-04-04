export function isPrimitiveKey(val: any): boolean;
export function assertPrimitiveKey(val: any): void;
export function checkScalarKey(val: any, check: Checker): boolean;
export function isScalarKey(val: any): boolean;
export function assertScalarKey(val: any): void;
export function checkKey(val: any, check: Checker): boolean;
export function isKey(val: any): boolean;
export function assertKey(val: any): void;
export function checkCopySet(s: any, check: Checker): boolean;
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
export function checkCopyBag(b: any, check: Checker): boolean;
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
export function checkCopyMap(m: any, check: Checker): boolean;
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
export type CopyBag<K extends unknown = any> = import('../types').CopyBag<K>;
export type CopySet<K extends unknown = any> = import('../types').CopySet<K>;
export type CopyMap<K extends unknown = any, V extends unknown = any> = import('../types').CopyMap<K, V>;
export type IsCopySet = (s: any) => s is CopySet;
export type AssertCopySet = (s: any) => asserts s is CopySet;
export type IsCopyBag = (b: any) => b is CopyBag;
export type AssertCopyBag = (b: any) => asserts b is CopyBag;
export type IsCopyMap = (m: any) => m is CopyMap<any, any>;
export type AssertCopyMap = (m: any) => asserts m is CopyMap<any, any>;
import type { Checker } from '@endo/marshal';
//# sourceMappingURL=checkKey.d.ts.map
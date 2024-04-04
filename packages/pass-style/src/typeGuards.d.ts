export type CopyArray<T extends unknown = any> = import('./types.js').CopyArray<T>;
export type CopyRecord<T extends unknown = any> = import('./types.js').CopyRecord<T>;
export type AssertArray = (array: any, optNameOfArray?: string | undefined) => asserts array is CopyArray<any>;
export type AssertRecord = (record: any, optNameOfRecord?: string | undefined) => asserts record is CopyRecord<any>;
export type AssertRemotable = (remotable: any, optNameOfRemotable?: string | undefined) => asserts remotable is any;
/**
 * @callback AssertRecord
 * @param {Passable} record
 * @param {string=} optNameOfRecord
 * @returns {asserts record is CopyRecord<any>}
 */
/** @type {AssertRecord} */
export const assertRecord: AssertRecord;
/**
 * @callback AssertArray
 * @param {Passable} array
 * @param {string=} optNameOfArray
 * @returns {asserts array is CopyArray<any>}
 */
/** @type {AssertArray} */
export const assertCopyArray: AssertArray;
/**
 * @callback AssertRemotable
 * @param {Passable} remotable
 * @param {string=} optNameOfRemotable
 * @returns {asserts remotable is RemotableObject}
 */
/** @type {AssertRemotable} */
export const assertRemotable: AssertRemotable;
/**
 * Check whether the argument is a remotable.
 *
 * @param {Passable} remotable
 * @returns {remotable is RemotableObject}
 */
export function isRemotable(remotable: any): remotable is any;
/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @endo/marshal terms
 *
 * @param {Passable} record
 * @returns {record is CopyRecord<any>}
 */
export function isRecord(record: any): record is CopyRecord<any>;
/** @import {Passable} from './types.js' */
/**
 * @template {Passable} [T=Passable]
 * @typedef {import('./types.js').CopyArray<T>} CopyArray
 */
/**
 * @template {Passable} [T=Passable]
 * @typedef {import('./types.js').CopyRecord<T>} CopyRecord
 */
/** @import {RemotableObject} from './types.js' */
/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @endo/marshal terms
 *
 * @param {Passable} arr
 * @returns {arr is CopyArray<any>}
 */
export function isCopyArray(arr: any): arr is CopyArray<any>;
//# sourceMappingURL=typeGuards.d.ts.map
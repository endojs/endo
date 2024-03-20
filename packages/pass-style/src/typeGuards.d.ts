export type Passable = import('./types.js').Passable;
export type CopyArray<T extends unknown = any> = import('./types.js').CopyArray<T>;
export type CopyRecord<T extends unknown = any> = import('./types.js').CopyRecord<T>;
export type Remotable = import('./types.js').RemotableObject;
export type AssertArray = (array: Passable, optNameOfArray?: string | undefined) => asserts array is CopyArray<any>;
export type AssertRecord = (record: Passable, optNameOfRecord?: string | undefined) => asserts record is CopyRecord<any>;
export type AssertRemotable = (remotable: Passable, optNameOfRemotable?: string | undefined) => asserts remotable is any;
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
 * @returns {asserts remotable is Remotable}
 */
/** @type {AssertRemotable} */
export const assertRemotable: AssertRemotable;
/**
 * Check whether the argument is a remotable.
 *
 * @param {Passable} remotable
 * @returns {remotable is Remotable}
 */
export function isRemotable(remotable: Passable): remotable is any;
/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @endo/marshal terms
 *
 * @param {Passable} record
 * @returns {record is CopyRecord<any>}
 */
export function isRecord(record: Passable): record is CopyRecord<any>;
/** @typedef {import('./types.js').Passable} Passable */
/**
 * @template {Passable} [T=Passable]
 * @typedef {import('./types.js').CopyArray<T>} CopyArray
 */
/**
 * @template {Passable} [T=Passable]
 * @typedef {import('./types.js').CopyRecord<T>} CopyRecord
 */
/** @typedef {import('./types.js').RemotableObject} Remotable */
/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @endo/marshal terms
 *
 * @param {Passable} arr
 * @returns {arr is CopyArray<any>}
 */
export function isCopyArray(arr: Passable): arr is CopyArray<any>;
//# sourceMappingURL=typeGuards.d.ts.map
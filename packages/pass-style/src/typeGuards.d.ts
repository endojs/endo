/**
 * @param {any} record
 * @param {string=} optNameOfRecord
 * @returns {asserts record is CopyRecord<any>}
 */
export function assertRecord(record: any, optNameOfRecord?: string | undefined): asserts record is CopyRecord<any>;
/**
 * @param {any} array
 * @param {string=} optNameOfArray
 * @returns {asserts array is CopyArray<any>}
 */
export function assertCopyArray(array: any, optNameOfArray?: string | undefined): asserts array is CopyArray<any>;
/**
 * @param {Passable} remotable
 * @param {string=} optNameOfRemotable
 * @returns {asserts remotable is RemotableObject}
 */
export function assertRemotable(remotable: Passable, optNameOfRemotable?: string | undefined): asserts remotable is RemotableObject;
/**
 * Check whether the argument is a remotable.
 *
 * @param {Passable} remotable
 * @returns {remotable is RemotableObject}
 */
export function isRemotable(remotable: Passable): remotable is RemotableObject;
/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @endo/marshal terms
 *
 * @param {any} record
 * @returns {record is CopyRecord<any>}
 */
export function isRecord(record: any): record is CopyRecord<any>;
/** @import {CopyArray, CopyRecord, Passable, RemotableObject} from './types.js' */
/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @endo/marshal terms
 *
 * @param {any} arr
 * @returns {arr is CopyArray<any>}
 */
export function isCopyArray(arr: any): arr is CopyArray<any>;
import type { CopyRecord } from './types.js';
import type { CopyArray } from './types.js';
import type { Passable } from './types.js';
import type { RemotableObject } from './types.js';
//# sourceMappingURL=typeGuards.d.ts.map
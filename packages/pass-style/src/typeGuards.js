import { Fail, q } from '@endo/errors';
import { passStyleOf } from './passStyleOf.js';

/** @import {CopyArray, CopyRecord, Passable, RemotableObject} from './types.js' */

/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @endo/marshal terms
 *
 * @param {any} arr
 * @returns {arr is CopyArray<any>}
 */
const isCopyArray = arr => passStyleOf(arr) === 'copyArray';
harden(isCopyArray);

/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @endo/marshal terms
 *
 * @param {any} record
 * @returns {record is CopyRecord<any>}
 */
const isRecord = record => passStyleOf(record) === 'copyRecord';
harden(isRecord);

/**
 * Check whether the argument is a remotable.
 *
 * @param {Passable} remotable
 * @returns {remotable is RemotableObject}
 */
const isRemotable = remotable => passStyleOf(remotable) === 'remotable';
harden(isRemotable);

/**
 * @param {any} array
 * @param {string=} optNameOfArray
 * @returns {asserts array is CopyArray<any>}
 */
const assertCopyArray = (array, optNameOfArray = 'Alleged array') => {
  const passStyle = passStyleOf(array);
  passStyle === 'copyArray' ||
    Fail`${q(optNameOfArray)} ${array} must be a pass-by-copy array, not ${q(
      passStyle,
    )}`;
};
harden(assertCopyArray);

/**
 * @param {any} record
 * @param {string=} optNameOfRecord
 * @returns {asserts record is CopyRecord<any>}
 */
const assertRecord = (record, optNameOfRecord = 'Alleged record') => {
  const passStyle = passStyleOf(record);
  passStyle === 'copyRecord' ||
    Fail`${q(optNameOfRecord)} ${record} must be a pass-by-copy record, not ${q(
      passStyle,
    )}`;
};
harden(assertRecord);

/**
 * @param {Passable} remotable
 * @param {string=} optNameOfRemotable
 * @returns {asserts remotable is RemotableObject}
 */
const assertRemotable = (
  remotable,
  optNameOfRemotable = 'Alleged remotable',
) => {
  const passStyle = passStyleOf(remotable);
  passStyle === 'remotable' ||
    Fail`${q(optNameOfRemotable)} ${remotable} must be a remotable, not ${q(
      passStyle,
    )}`;
};
harden(assertRemotable);

export {
  assertRecord,
  assertCopyArray,
  assertRemotable,
  isRemotable,
  isRecord,
  isCopyArray,
};

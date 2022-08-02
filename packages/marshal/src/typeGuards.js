// @ts-check

import { isObject } from './helpers/passStyle-helpers.js';
import { passStyleOf } from './passStyleOf.js';

/** @typedef {import('./types.js').Passable} Passable */
/** @template T @typedef {import('./types.js').CopyArray<T>} CopyArray */
/** @template T @typedef {import('./types.js').CopyRecord<T>} CopyRecord */
/** @typedef {import('./types.js').Remotable} Remotable */

const { details: X, quote: q } = assert;

/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @endo/marshal terms
 *
 * @param {Passable} array
 * @returns {array is CopyArray<any>}
 */
const isCopyArray = array => passStyleOf(array) === 'copyArray';
harden(isCopyArray);

/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @endo/marshal terms
 *
 * @param {Passable} record
 * @returns {record is CopyRecord<any>}
 */
const isRecord = record => passStyleOf(record) === 'copyRecord';
harden(isRecord);

/**
 * Check whether the argument is a remotable.
 *
 * @param {Passable} remotable
 * @returns {remotable is Remotable}
 */
const isRemotable = remotable => passStyleOf(remotable) === 'remotable';
harden(isRemotable);

/**
 * @callback AssertArray
 * @param {Passable} array
 * @param {string=} optNameOfArray
 * @returns {asserts array is CopyArray<any>}
 */

/** @type {AssertArray} */
const assertCopyArray = (array, optNameOfArray = 'Alleged array') => {
  const passStyle = passStyleOf(array);
  assert(
    passStyle === 'copyArray',
    X`${q(optNameOfArray)} ${array} must be a pass-by-copy array, not ${q(
      passStyle,
    )}`,
  );
};
harden(assertCopyArray);

/**
 * @callback AssertRecord
 * @param {Passable} record
 * @param {string=} optNameOfRecord
 * @returns {asserts record is CopyRecord<any>}
 */

/** @type {AssertRecord} */
const assertRecord = (record, optNameOfRecord = 'Alleged record') => {
  const passStyle = passStyleOf(record);
  assert(
    passStyle === 'copyRecord',
    X`${q(optNameOfRecord)} ${record} must be a pass-by-copy record, not ${q(
      passStyle,
    )}`,
  );
};
harden(assertRecord);

/**
 * @callback AssertRemotable
 * @param {Passable} remotable
 * @param {string=} optNameOfRemotable
 * @returns {asserts remotable is Remotable}
 */

/** @type {AssertRemotable} */
const assertRemotable = (
  remotable,
  optNameOfRemotable = 'Alleged remotable',
) => {
  const passStyle = passStyleOf(remotable);
  assert(
    passStyle === 'remotable',
    X`${q(optNameOfRemotable)} ${remotable} must be a remotable, not ${q(
      passStyle,
    )}`,
  );
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

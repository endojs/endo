// @ts-check

import { passStyleOf } from './passStyleOf.js';

const { details: X, quote: q } = assert;

/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @agoric/marshal terms
 *
 * @param {CopyArray<any>} array
 * @returns {boolean}
 */
const isCopyArray = array => passStyleOf(array) === 'copyArray';
harden(isCopyArray);

/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @agoric/marshal terms
 *
 * @param {CopyRecord<any>} record
 * @returns {boolean}
 */
const isRecord = record => passStyleOf(record) === 'copyRecord';
harden(isRecord);

/**
 * Check whether the argument is a remotable.
 *
 * @param {Remotable} remotable
 * @returns {boolean}
 */
const isRemotable = remotable => passStyleOf(remotable) === 'remotable';
harden(isRemotable);

/**
 * Assert that the argument is a pass-by-copy array, AKA a "copyArray"
 * in @agoric/marshal terms
 *
 * @param {CopyArray<any>} array
 * @param {string=} optNameOfArray
 * @returns {void}
 */
const assertCopyArray = (array, optNameOfArray = 'Alleged array') => {
  const passStyle = passStyleOf(array);
  assert(
    passStyle === 'copyArray',
    X`${q(
      optNameOfArray,
    )} ${array} must be a pass-by-copy array, not ${passStyle}`,
  );
};
harden(assertCopyArray);

/**
 * Assert that the argument is a pass-by-copy record, or a
 * "copyRecord" in @agoric/marshal terms
 *
 * @param {CopyRecord<any>} record
 * @param {string=} optNameOfRecord
 * @returns {void}
 */
const assertRecord = (record, optNameOfRecord = 'Alleged record') => {
  const passStyle = passStyleOf(record);
  assert(
    passStyle === 'copyRecord',
    X`${q(
      optNameOfRecord,
    )} ${record} must be a pass-by-copy record, not ${passStyle}`,
  );
};
harden(assertRecord);

/**
 * Assert that the argument is a remotable.
 *
 * @param {Remotable} remotable
 * @param {string=} optNameOfRemotable
 * @returns {void}
 */
const assertRemotable = (
  remotable,
  optNameOfRemotable = 'Alleged remotable',
) => {
  const passStyle = passStyleOf(remotable);
  assert(
    passStyle === 'remotable',
    X`${q(
      optNameOfRemotable,
    )} ${remotable} must be a remotable, not ${passStyle}`,
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

import { passStyleOf } from './passStyleOf.js';

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

const { Fail, quote: q } = assert;

/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @endo/marshal terms
 *
 * @param {unknown} arr
 * @returns {arr is CopyArray<unknown>}
 */
const isCopyArray = arr => passStyleOf(arr) === 'copyArray';
harden(isCopyArray);

/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @endo/marshal terms
 *
 * @param {unknown} record
 * @returns {record is CopyRecord<unknown>}
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
 * @param {unknown} array
 * @param {string=} optNameOfArray
 * @returns {asserts array is CopyArray<unknown>}
 */

/** @type {AssertArray} */
const assertCopyArray = (array, optNameOfArray = 'Alleged array') => {
  const passStyle = passStyleOf(array);
  passStyle === 'copyArray' ||
    Fail`${q(optNameOfArray)} ${array} must be a pass-by-copy array, not ${q(
      passStyle,
    )}`;
};
harden(assertCopyArray);

/**
 * @callback AssertRecord
 * @param {unknown} record
 * @param {string=} optNameOfRecord
 * @returns {asserts record is CopyRecord<unknown>}
 */

/** @type {AssertRecord} */
const assertRecord = (record, optNameOfRecord = 'Alleged record') => {
  const passStyle = passStyleOf(record);
  passStyle === 'copyRecord' ||
    Fail`${q(optNameOfRecord)} ${record} must be a pass-by-copy record, not ${q(
      passStyle,
    )}`;
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

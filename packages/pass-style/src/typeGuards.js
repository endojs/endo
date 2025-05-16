import { Fail, q, X } from '@endo/errors';
import { identChecker } from '@endo/common/ident-checker.js';
import { passStyleOf } from './passStyleOf.js';
import { assertChecker } from './passStyle-helpers.js';

/**
 * @import {CopyArray, CopyRecord, Passable, RemotableObject, ByteArray, Checker, Atom} from './types.js'
 */

/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @endo/marshal terms
 *
 * @param {any} arr
 * @returns {arr is CopyArray<any>}
 */
export const isCopyArray = arr => passStyleOf(arr) === 'copyArray';
harden(isCopyArray);

/**
 * Check whether the argument is a pass-by-copy binary data, AKA a "byteArray"
 * in @endo/marshal terms
 *
 * @param {Passable} arr
 * @returns {arr is ByteArray}
 */
export const isByteArray = arr => passStyleOf(arr) === 'byteArray';
harden(isByteArray);

/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @endo/marshal terms
 *
 * @param {any} record
 * @returns {record is CopyRecord<any>}
 */
export const isRecord = record => passStyleOf(record) === 'copyRecord';
harden(isRecord);

/**
 * Check whether the argument is a remotable.
 *
 * @param {Passable} remotable
 * @returns {remotable is RemotableObject}
 */
export const isRemotable = remotable => passStyleOf(remotable) === 'remotable';
harden(isRemotable);

/**
 * @param {any} arr
 * @param {string=} optNameOfArray
 * @returns {asserts arr is CopyArray<any>}
 */
export const assertCopyArray = (arr, optNameOfArray = 'Alleged array') => {
  const passStyle = passStyleOf(arr);
  passStyle === 'copyArray' ||
    Fail`${q(optNameOfArray)} ${arr} must be a pass-by-copy array, not ${q(
      passStyle,
    )}`;
};
harden(assertCopyArray);

/**
 * @param {Passable} arr
 * @param {string=} optNameOfArray
 * @returns {asserts arr is ByteArray}
 */
export const assertByteArray = (arr, optNameOfArray = 'Alleged byteArray') => {
  const passStyle = passStyleOf(arr);
  passStyle === 'byteArray' ||
    Fail`${q(
      optNameOfArray,
    )} ${arr} must be a pass-by-copy binary data, not ${q(passStyle)}`;
};
harden(assertByteArray);

/**
 * @callback AssertRecord
 * @param {any} record
 * @param {string=} optNameOfRecord
 * @returns {asserts record is CopyRecord<any>}
 */
export const assertRecord = (record, optNameOfRecord = 'Alleged record') => {
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
export const assertRemotable = (
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

/**
 * @param {any} val Not necessarily passable
 * @param {Checker} check
 * @returns {val is Atom}
 */
const checkAtom = (val, check) => {
  let passStyle;
  try {
    passStyle = passStyleOf(val);
  } catch (err) {
    return (
      check !== identChecker &&
      check(false, X`Not even Passable: ${q(err)}: ${val}`)
    );
  }
  switch (passStyle) {
    case 'undefined':
    case 'null':
    case 'boolean':
    case 'number':
    case 'bigint':
    case 'string':
    case 'byteArray':
    case 'symbol': {
      // The AtomStyle cases
      return true;
    }
    default: {
      // The other PassStyle cases
      return (
        check !== identChecker &&
        check(false, X`A ${q(passStyle)} cannot be an atom: ${val}`)
      );
    }
  }
};

/**
 * @param {any} val
 * @returns {val is Atom}
 */
export const isAtom = val => checkAtom(val, identChecker);
harden(isAtom);

/**
 * @param {Passable} val
 * @returns {asserts val is Atom}
 */
export const assertAtom = val => {
  checkAtom(val, assertChecker);
};
harden(assertAtom);

/* global globalThis */
// This module assumes the existence of a non-standard `assert` host object.
// SES version 0.11.0 introduces this global object and entangles it
// with the `console` host object in scope when it initializes,
// allowing errors, particularly assertion errors, to hide their "details"
// from callers that might catch those errors, then reveal them to the
// underlying console.
// To the extent that this `console` is considered a resource,
// this module must be considered a resource module.

// The assertions re-exported here are defined in
// https://github.com/endojs/endo/blob/HEAD/packages/ses/src/error/assert.js

const { defineProperty } = Object;

const globalAssert = globalThis.assert;

if (globalAssert === undefined) {
  throw Error(
    `Cannot initialize @endo/errors, missing globalThis.assert, import 'ses' before '@endo/errors'`,
  );
}

const missing = [
  'typeof',
  'fail',
  'equal',
  'string',
  'note',
  'details',
  'Fail',
  'quote',
  // As of 2025-07, the Agoric chain's bootstrap vat runs with a version of SES
  // that predates addition of the 'bare' and 'makeError' methods, so we must
  // tolerate their absence and fall back to other behavior in that environment
  // (see below).
  // 'bare',
  // 'makeError',
  'makeAssert',
].filter(name => globalAssert[name] === undefined);
if (globalAssert.makeError === undefined && globalAssert.error === undefined) {
  missing.push('makeError');
}
if (missing.length > 0) {
  throw Error(
    `Cannot initialize @endo/errors, missing globalThis.assert methods ${missing.join(
      ', ',
    )}`,
  );
}

// The global assert mixed assertions and utility functions.
// This module splits them apart
// and also updates the names of the utility functions.
const {
  bare: globalBare,
  details,
  error: globalError,
  Fail,
  makeAssert: _omittedMakeAssert,
  makeError: globalMakeError,
  note,
  quote,
  ...assertions
} = globalAssert;
/** @type {import("ses").AssertionFunctions } */
// @ts-expect-error missing properties assigned next
const assert = (value, optDetails, errContructor, options) =>
  globalAssert(value, optDetails, errContructor, options);
Object.assign(assert, assertions);

// As of 2025-07, the Agoric chain's bootstrap vat runs with a version of SES
// that predates the addition of the 'bare' and 'makeError' methods, so we must
// fall back to 'quote' for the former and 'error' for the latter.
const bare = globalBare || quote;
const makeError = globalMakeError || globalError;

// XXX module exports fail if these aren't in scope
/** @import {AssertMakeErrorOptions, Details, GenericErrorConstructor} from 'ses' */

export {
  // assertions
  assert,
  // non-assertion utilities that appear as properties of `assert`
  bare,
  makeError,
  details,
  note,
  quote,
  Fail,
};

// conventional abbreviations
export const b = bare;
export const X = details;
export const q = quote;

// other aliases
export const annotateError = note;
export const redacted = details;
export const throwRedacted = Fail;

/**
 * `stackFiltering: 'omit-frames'` and `stackFiltering: 'concise'` omit frames
 * not only of "obvious" infrastructure functions, but also of functions
 * whose `name` property begins with `'__HIDE_'`. (Note: currently
 * these options only work on v8.)
 *
 * Given that `func` is not yet frozen, then `hideAndHardenFunction(func)`
 * will prifix `func.name` with an additional `'__HIDE_'`, so that under
 * those stack filtering options, frames for calls to such functions are
 * not reported.
 *
 * Then the function is hardened and returned. Thus, you can say
 * `hideAndHardenFunction(func)` where you would normally first say
 * `harden(func)`.
 *
 * @template {Function} [T=Function]
 * @param {T} func
 * @returns {T}
 */
export const hideAndHardenFunction = func => {
  typeof func === 'function' || Fail`${func} must be a function`;
  const { name } = func;
  defineProperty(func, 'name', {
    // Use `String` in case `name` is a symbol.
    value: `__HIDE_${String(name)}`,
  });
  return harden(func);
};

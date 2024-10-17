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

const globalAssert = globalThis.assert;

if (globalAssert === undefined) {
  throw Error(
    `Cannot initialize @endo/errors, missing globalThis.assert, import 'ses' before '@endo/errors'`,
  );
}

const missing = /** @type {const} */ ([
  'typeof',
  'error',
  'fail',
  'equal',
  'string',
  'note',
  'details',
  'Fail',
  'quote',
  // As of 2024-02, the Agoric chain's bootstrap vat runs with a version of SES that
  // predates addition of the 'bare' method, so we must tolerate its absence and fall
  // back to quote behavior in that environment (see below).
  // 'bare',
  'makeAssert',
]).filter(name => globalAssert[name] === undefined);
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
  bare,
  details: redacted,
  error: makeError,
  Fail: throwRedacted,
  makeAssert: _omittedMakeAssert,
  note,
  quote,
  ...assertions
} = globalAssert;
/** @type {import("ses").AssertionFunctions } */
// @ts-expect-error missing properties assigned next
const assert = (value, optDetails, errContructor, options) =>
  globalAssert(value, optDetails, errContructor, options);
Object.assign(assert, assertions);

// As of 2024-02, the Agoric chain's bootstrap vat runs with a version of SES
// that predates the addition of the 'bare' method, so we must fall back to
// quote behavior for that environment.
const bareOrQuote = bare || quote;

// XXX module exports fail if these aren't in scope
/** @import {AssertMakeErrorOptions, Details, GenericErrorConstructor} from 'ses' */

export {
  // assertions
  assert,
  // related utilities that aren't assertions
  bareOrQuote as bare,
  makeError,
  note,
  quote,
  redacted,
  throwRedacted,
  // conventional abbreviations and aliases
  bareOrQuote as b,
  quote as q,
  redacted as X,
  throwRedacted as Fail,
  note as annotateError,
};

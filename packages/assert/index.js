/* global globalThis */
/// <reference types="ses"/>

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
    `Cannot initialize @endo/assert, missing globalThis.assert, import 'ses' before '@endo/assert'`,
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
  'bare',
  'makeAssert',
]).filter(name => globalAssert[name] === undefined);
if (missing.length > 0) {
  throw Error(
    `Cannot initialize @endo/assert, missing globalThis.assert methods ${missing.join(
      ', ',
    )}`,
  );
}

// The global assert mixed assertions and utility functions. This module splits them apart
// and also updates the names of the utility functions.
const {
  bare,
  details: redacted,
  error,
  Fail: throwRedacted,
  makeAssert,
  note,
  quote,
  ...assertions
} = globalAssert;
/** @type {import("ses").AssertionFunctions } */
// @ts-expect-error missing properties assigned next
const assert = (value, optDetails, optErrorContructor) =>
  globalAssert(value, optDetails, optErrorContructor);
Object.assign(assert, assertions);

export {
  // assertions
  assert,
  // related utilities that aren't assertions
  bare,
  error,
  makeAssert,
  note,
  quote,
  redacted,
  throwRedacted,
};

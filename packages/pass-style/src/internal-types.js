export {};

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {PassStyle} from './types.js';
 */

/**
 * The PassStyleHelper are only used to make a `passStyleOf` function.
 * Thus, it should not depend on an ambient one. Rather, each helper should be
 * pure, and get its `passStyleOf` or similar function from its caller.
 *
 * For those methods that have a last `passStyleOf` or `passStyleOfRecur`,
 * they must defend against the other arguments being malicious, but may
 * *assume* that `passStyleOfRecur` does what it is supposed to do.
 * Each such method is not trying to defend itself against a malicious
 * `passStyleOfRecur`, though it may defend against some accidents.
 *
 * @typedef {object} PassStyleHelper
 * @property {PassStyle} styleName
 * @property {(candidate: any, reject: Rejector) => boolean} confirmCanBeValid
 * If `confirmCanBeValid` returns true, then the candidate would
 * definitely not be valid for any of the other helpers.
 * `assertRestValid` still needs to be called to determine if it
 * actually is valid, but only after the `confirmCanBeValid` check has passed.
 *
 * @property {(candidate: any,
 *             passStyleOfRecur: (val: any) => PassStyle
 *            ) => void} assertRestValid
 */

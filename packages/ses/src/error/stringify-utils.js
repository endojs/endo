// @ts-check

import { freeze } from '../commons.js';

/**
 * Prepend the correct indefinite article onto a noun, typically a typeof
 * result, e.g., "an object" vs. "a number"
 *
 * @param {string} str The noun to prepend
 * @returns {string} The noun prepended with a/an
 */
const an = str => {
  str = `${str}`;
  if (str.length >= 1 && 'aeiouAEIOU'.includes(str[0])) {
    return `an ${str}`;
  }
  return `a ${str}`;
};
freeze(an);
export { an };

/**
 * Like `JSON.stringify` but does not blow up if given a cycle or a bigint.
 * This is not
 * intended to be a serialization to support any useful unserialization,
 * or any programmatic use of the resulting string. The string is intended
 * *only* for showing a human under benign conditions, in order to be
 * informative enough for some
 * logging purposes. As such, this `bestEffortStringify` has an
 * imprecise specification and may change over time.
 *
 * The current `bestEffortStringify` possibly emits too many "seen"
 * markings: Not only for cycles, but also for repeated subtrees by
 * object identity.
 *
 * As a best effort only for diagnostic interpretation by humans,
 * `bestEffortStringify` also turns various cases that normal
 * `JSON.stringify` skips or errors on, like `undefined` or bigints,
 * into strings that convey their meaning. However, if these strings appear
 * in the input they will also appear in the output, so the output is
 * ambiguous in the face of these collisions.
 *
 * @param {any} payload
 * @param {(string|number)=} spaces
 * @returns {string}
 */
const bestEffortStringify = (payload, spaces = undefined) => {
  const seenSet = new Set();
  const replacer = (_, val) => {
    switch (typeof val) {
      case 'object': {
        if (val === null) {
          return null;
        }
        if (seenSet.has(val)) {
          return '[Circular]';
        }
        seenSet.add(val);
        if (Promise.resolve(val) === val) {
          return '[Promise]';
        }
        if (val instanceof Error) {
          return `[${val.name}: ${val.message}]`;
        }
        if (Object.keys(val).length === 0 && Symbol.toStringTag in val) {
          // Note that this test is `Object.keys` rather than `Refect.ownKeys`.
          // Like `JSON.stringify`, `Object.ownKeys` will enumerate only
          // string-named enumerable own properties, which will therefore
          // omit Symbol.toStringTag even if it is own and enumerable.
          // This case will happen to do a good job with presences without
          // violating abstraction layering. This behavior makes sense
          // purely in terms of JavaScript concepts. That's some of the
          // motivation for choosing that representation of remotables
          // in the first place.
          return `[${val[Symbol.toStringTag]}]`;
        }
        return val;
      }
      case 'function': {
        return `[Function ${val.name || '<anon>'}]`;
      }
      case 'undefined':
      case 'symbol': {
        return `[${String(val)}]`;
      }
      case 'bigint': {
        return `[${val}n]`;
      }
      case 'number': {
        if (Object.is(val, NaN)) {
          return '[NaN]';
        } else if (val === Infinity) {
          return '[Infinity]';
        } else if (val === -Infinity) {
          return '[-Infinity]';
        }
        return val;
      }
      default: {
        return val;
      }
    }
  };
  return JSON.stringify(payload, replacer, spaces);
};
freeze(bestEffortStringify);
export { bestEffortStringify };

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
 * Like `JSON.stringify` but does not blow up if given a cycle. This is not
 * intended to be a serialization to support any useful unserialization,
 * or any programmatic use of the resulting string. The string is intended
 * only for showing a human, in order to be informative enough for some
 * logging purposes. As such, this `cycleTolerantStringify` has an
 * imprecise specification and may change over time.
 *
 * The current `cycleTolerantStringify` possibly emits too many "seen"
 * markings: Not only for cycles, but also for repeated subtrees by
 * object identity.
 *
 * @param {any} payload
 * @returns {string}
 */
const cycleTolerantStringify = payload => {
  const seenSet = new Set();
  const replacer = (_, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seenSet.has(val)) {
        return '<**seen**>';
      }
      seenSet.add(val);
    }
    return val;
  };
  return JSON.stringify(payload, replacer);
};
freeze(cycleTolerantStringify);
export { cycleTolerantStringify };

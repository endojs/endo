import { Fail } from './index.js';

// TODO `RejectOptPrefixPair` should be a circular type, which TS, surprisingly
// to me, seems unhappy about. The `any` within it should be another
// `RejectOptPrefixPair`
/**
 * @typedef {string|number|bigint} RejectPrefix
 * @typedef {RejectPrefix|undefined} RejectOptPrefix
 * @typedef {undefined | [any, RejectPrefix]} RejectOptPrefixPair
 */

/**
 * @param {RejectOptPrefixPair} prePre
 * @param {RejectPrefix} postPre
 */
const makeReject = (prePre, postPre) => {
  /**
   * @param {TemplateStringsArray | string[]} template
   * @param {...any} args
   * @returns {never}
   */
  const reject = ([...template], ...args) => {
    let [pre, post] = [prePre, postPre];
    for (;;) {
      switch (typeof post) {
        case 'string': {
          break;
        }
        case 'number':
        case 'bigint': {
          // based on throw-labeled.js
          post = `[${post}]`;
          break;
        }
        default: {
          post = `${post}`;
          break;
        }
      }
      template[0] = `${post}: ${template[0]}`;
      if (pre === undefined) {
        break;
      }
      [pre, post] = pre;
    }
    throw Fail(template, ...args);
  };
  /**
   * @param {RejectPrefix} prefix
   * @returns {typeof reject}
   */
  reject.nestRejectMethod = prefix => makeReject([prePre, postPre], prefix);
  return harden(reject);
};

/**
 * Given a Rejector `reject`, returns a Rejector just like it, except that
 * if the returned Rejector is invoked to create and throw an error,
 * the error message will begin with all the prefixes already accumulated by
 * the paren `reject`, followed by `prefix` and `': '` (colon space),
 * followed by the normal `Fail` formulated error message.
 *
 * This is recursive of course, so it the returned Rejector is used as an
 * argument in another call to `nestReject`, then that prefix
 * (with its own `': '`) would appear between this prefix and `Fail`
 * formulated error message.
 *
 * As a convenience, if the prefix is a number or a bigint, it is first
 * converted to a string within square brackets, to be suggestive of an index.
 * If this is not your intention, then convert it to a string first
 * yourself.
 *
 * @param {RejectOptPrefix} prefix
 * @param {Rejector} reject
 * @returns {Rejector}
 */
export const nestReject = (prefix, reject) => {
  if (reject === false) {
    return false;
  }
  if (prefix === undefined) {
    return reject;
  }
  if (reject === Fail) {
    return makeReject(undefined, prefix);
  }
  // @ts-expect-error purposely omitted nestRejectMethod from type
  return reject.nestRejectMethod(prefix);
};
harden(nestReject);

/**
 * Either
 * - `false`
 * - or an object like `Fail`
 *
 * A `Rejector` should be used as
 * ```js
 * cond || reject && reject`...`
 * ```
 * If `cond` is truthy, that is the value of the expression.
 * Else if `reject` is false, it is the value
 * Otherwise, invoke `reject` just like you would invoke `Fail`, with the
 * same template arguments. This throws the same kind of Error object that
 * `Fail` would throw, except the prefixes accumulated by `nestReject` are
 * preprended to the error message.
 *
 * See rejector.test.js for illustrative examples.
 *
 * @typedef {false | typeof Fail} Rejector
 */

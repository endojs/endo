import { Fail } from './index.js';

const makeReject = (prePre, postPre) => {
  /**
   * @param {TemplateStringsArray | string[]} template
   * @param {...any} args
   * @returns {never}
   */
  const reject = ([...template], ...args) => {
    for (;;) {
      switch (typeof postPre) {
        case 'string': {
          break;
        }
        case 'number':
        case 'bigint': {
          // based on throw-labeled.js
          postPre = `[${postPre}]`;
          break;
        }
        default: {
          postPre = `${postPre}`;
          break;
        }
      }
      template[0] = `${postPre}: ${template[0]}`;
      if (prePre === undefined) {
        break;
      }
      [prePre, postPre] = prePre;
    }
    throw Fail(template, ...args);
  };
  /**
   * @param {string|number|bigint} prefix
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
 * @param {string|number|bigint} prefix
 * @param {Rejector} reject
 * @returns {Rejector}
 */
export const nestReject = (prefix, reject) =>
  reject &&
  (reject === Fail
    ? makeReject(undefined, prefix)
    : // @ts-expect-error purposely omitted nestRejectMethod from type
      reject.nestRejectMethod(prefix));

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

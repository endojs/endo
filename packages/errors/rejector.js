import { Fail } from '@endo/errors';

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
      template[0] = `${postPre}${template[0]}`;
      if (prePre === undefined) {
        break;
      }
      [prePre, postPre] = prePre;
    }
    throw Fail(template, ...args);
  };
  /**
   * @param {string|number} prefix
   * @returns {typeof reject}
   */
  reject.pre = prefix => makeReject([prePre, postPre], prefix);
  return harden(reject);
};

export const nestReject = (prefix, reject) =>
  reject &&
  (reject === Fail ? makeReject(undefined, prefix) : reject.pre(prefix));

/**
 * Either
 * - `false`
 * - or an object like `Fail` but with a `.pre(prefix)` method that returns
 *   another such object.
 *
 * A `Rejector` should be used as
 * ```js
 * cond || reject && reject`...`
 * ```
 * If `cond` is truthy, that is the value of the expression.
 * Else if `reject` is false, it is the value
 * Otherwise, invoke `reject` just like you would invoke `Fail`, with the
 * same template arguments. This throws the same kind of Error object that
 * `Fail` would throw, except the accumulated prefixes are preprended to
 * the error message.
 *
 * Because a `reject` variable of type `Rejector` may be false, the `pre`
 * method is not typically how a `confirm*` function would pass a
 * prefixed rejector to another `confirm*` function. Rather, you'd say
 * ```js
 * confirmFoo(whatever, nestReject('pre: ', reject));
 * ```
 * See rejector.test.js for illustrative examples.
 *
 * @typedef {false | typeof Fail} Rejector
 */

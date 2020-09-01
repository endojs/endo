// Copyright (C) 2019 Agoric, under Apache License 2.0

// @ts-check

import './types.js';

const { freeze, is: isSame, assign } = Object;

// This module assumes the de-facto standard `console` host object.
// To the extent that this `console` is considered a resource,
// this module must be considered a resource module.

// /////////////////////////////////////////////////////////////////////////////

// If this magic symbol occurs as the first argument to a console level method
// and last argument is an error object, then the arguments between
// them are remembered as the cause of the error, to be emitted only when
// the error is. This is designed to fail soft when sent to a normal console
// that doesn't recognize the string. The full cause will be emitted when
// it is logged, rather than being remembered to be logged later.
//
// Aside from tests, nothing else should import care what the
// actual encoding is.
const ERROR_CAUSE = Symbol('ERROR CAUSE:');

/**
 * Encode the `causeRecord` into the returned LogRecord. This encoding
 * must
 *    * be recognized and reversed by `getCauseRecord`.
 *    * be unlikely to collide with LogRecords representing unelated
 *      calls to console.
 *    * If used to invoke a normal console not built to recognize this
 *      encoding, the result is still pleasant and understandable to a
 *      human looking at the log.
 * Aside from tests, nothing else should care what the actual encoding is,
 * as long as `asLogRecord` and `getCauseRecord` preserve this relationship.
 * This lets us revise the encoding over time.
 *
 * @param {CauseRecord} causeRecord
 * @returns {LogRecord}
 */
const asLogRecord = ({ level, cause, error }) => {
  const outerArgs = freeze([ERROR_CAUSE, ...cause, error]);
  return freeze({ level, outerArgs });
};
freeze(asLogRecord);
export { asLogRecord };

/**
 * Recognize if the LogRecord is of the form created by `asLogRecord`. If so
 * then return the CauseRecord that was encoded into this LogRecord.
 * Otherwise return `undefined`.
 *
 * @param { LogRecord } logRecord
 * @returns { CauseRecord | undefined }
 */
const getCauseRecord = ({ level, outerArgs }) => {
  if (outerArgs.length >= 2) {
    const [first, ...cause] = outerArgs;
    const error = cause.pop();
    if (first === ERROR_CAUSE && error instanceof Error) {
      freeze(cause);
      return freeze({ level, cause, error });
    }
  }
  return undefined;
};
freeze(getCauseRecord);
export { getCauseRecord };

/**
 * Log to `aConsole` according to `logRecord`
 *
 * @param {Console} aConsole
 * @param {LogRecord} logRecord
 * @return {void}
 */
const logToConsole = (aConsole, { level, outerArgs }) => {
  aConsole[level](...outerArgs);
};
freeze(logToConsole);
export { logToConsole };

// /////////////////////////////////////////////////////////////////////////////

/**
 * Prepend the correct indefinite article onto a noun, typically a typeof
 * result, e.g., "an Object" vs. "a Number"
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

const declassifiers = new WeakMap();

/**
 * To "declassify" and quote a substitution value used in a
 * details`...` template literal, enclose that substitution expression
 * in a call to `q`. This states that the argument should appear quoted (with
 * `JSON.stringify`), in the error message of the thrown error. The payload
 * itself is still passed unquoted to the console as it would be without q.
 *
 * Starting from the example in the `details` comment, say instead that the
 * color the sky is supposed to be is also computed. Say that we still don't
 * want to reveal the sky's actual color, but we do want the thrown error's
 * message to reveal what color the sky was supposed to be:
 * ```js
 * assert.equal(
 *   sky.color,
 *   color,
 *   details`${sky.color} should be ${q(color)}`,
 * );
 * ```
 *
 * @typedef {Object} StringablePayload
 * @property {() => string} toString How to print the payload
 *
 * @param {*} payload What to declassify
 * @returns {StringablePayload} The declassified payload
 */
const q = payload => {
  // Don't harden the payload
  const result = freeze({
    toString: freeze(() => cycleTolerantStringify(payload)),
  });
  declassifiers.set(result, payload);
  return result;
};
freeze(q);
export { q };

/**
 * Use the `details` function as a template literal tag to create
 * informative error messages. The assertion functions take such messages
 * as optional arguments:
 * ```js
 * assert(sky.isBlue(), details`${sky.color} should be "blue"`);
 * ```
 * The details template tag returns an object that can print itself with the
 * formatted message in two ways. It will report the real details to
 * the console but include only the typeof information in the thrown error
 * to prevent revealing secrets up the exceptional path. In the example
 * above, the thrown error may reveal only that `sky.color` is a string,
 * whereas the same diagnostic printed to the console reveals that the
 * sky was green.
 *
 * WARNING: this function currently returns an unhardened result, as hardening
 * proved to cause significant performance degradation.  Consequently, callers
 * should take care to use it only in contexts where this lack of hardening
 * does not present a hazard.  In current usage, a `details` template literal
 * may only appear either as an argument to `assert`, where we know hardening
 * won't matter, or inside another hardened object graph, where hardening is
 * already ensured.  However, there is currently no means to enfoce these
 * constraints, so users are required to employ this function with caution.
 * Our intent is to eventually have a lint rule that will check for
 * inappropriate uses or find an alternative means of implementing `details`
 * that does not encounter the performance issue.  The final disposition of
 * this is being discussed and tracked in issue #679 in the agoric-sdk
 * repository.
 *
 * @typedef {Object} Complainer An object that has custom assert behaviour
 * @property {() => RangeError} complain Return a RangeError to throw, and
 * print details to the console
 *
 * @typedef {string|Complainer} Details Either a plain string, or made by
 * details``
 *
 * @param {TemplateStringsArray | string[]} template The template to format
 * @param {any[]} args Arguments to the template
 * @returns {Complainer} The complainer for these details
 */
const details = (template, ...args) => {
  // const complainer = harden({  // remove harden per above discussion
  const complainer = {
    complain() {
      const cause = [template[0]];
      const parts = [template[0]];
      for (let i = 0; i < args.length; i += 1) {
        let arg = args[i];
        let argStr;
        if (declassifiers.has(arg)) {
          argStr = `${arg}`;
          arg = declassifiers.get(arg);
        } else if (arg instanceof Error) {
          argStr = `(${an(arg.name)})`;
        } else {
          argStr = `(${an(typeof arg)})`;
        }

        // Remove the extra spaces (since console.error puts them
        // between each cause).
        const priorWithoutSpace = (cause.pop() || '').replace(/ $/, '');
        if (priorWithoutSpace !== '') {
          cause.push(priorWithoutSpace);
        }

        const nextWithoutSpace = template[i + 1].replace(/^ /, '');
        cause.push(arg, nextWithoutSpace);

        parts.push(argStr, template[i + 1]);
      }
      if (cause[cause.length - 1] === '') {
        cause.pop();
      }
      const error = new RangeError(parts.join(''));
      logToConsole(console, asLogRecord({ level: 'log', cause, error }));
      // eslint-disable-next-line no-debugger
      debugger;
      return error;
    },
  };
  // });
  return complainer;
};
freeze(details);
export { details };
/**
 * Fail an assertion, recording details to the console and
 * raising an exception with just type information.
 *
 * The optional `optDetails` can be a string for backwards compatibility
 * with the nodejs assertion library.
 * @param {Details} [optDetails] The details of what was asserted
 * @returns {never}
 */
const fail = (optDetails = details`Assert failed`) => {
  if (typeof optDetails === 'string') {
    // If it is a string, use it as the literal part of the template so
    // it doesn't get quoted.
    optDetails = details([optDetails]);
  }
  throw optDetails.complain();
};
freeze(fail);

// Don't freeze or export `baseAssert` until we add methods.
// TODO If I change this from a `function` function to an arrow
// function, I seem to get type errors from TypeScript. Why?
/**
 * @param {*} flag The truthy/falsy value
 * @param {Details} [optDetails] The details to throw
 * @returns {asserts flag}
 */
function baseAssert(flag, optDetails = details`Check failed`) {
  if (!flag) {
    throw fail(optDetails);
  }
}

/**
 * Assert that two values must be `Object.is`.
 * @param {*} actual The value we received
 * @param {*} expected What we wanted
 * @param {Details} [optDetails] The details to throw
 * @returns {void}
 */
const equal = (
  actual,
  expected,
  optDetails = details`Expected ${actual} is same as ${expected}`,
) => {
  baseAssert(isSame(actual, expected), optDetails);
};
freeze(equal);

/**
 * Assert an expected typeof result.
 * @type {AssertTypeof}
 * @param {any} specimen The value to get the typeof
 * @param {string} typename The expected name
 * @param {Details} [optDetails] The details to throw
 */
const assertTypeof = (specimen, typename, optDetails) => {
  baseAssert(
    typeof typename === 'string',
    details`${q(typename)} must be a string`,
  );
  if (optDetails === undefined) {
    // Like
    // ```js
    // optDetails = details`${specimen} must be ${q(an(typename))}`;
    // ```
    // except it puts the typename into the literal part of the template
    // so it doesn't get quoted.
    optDetails = details(['', ` must be ${an(typename)}`], specimen);
  }
  equal(typeof specimen, typename, optDetails);
};
freeze(assertTypeof);

// Note that "assert === baseAssert"
/**
 * assert that expr is truthy, with an optional details to describe
 * the assertion. It is a tagged template literal like
 * ```js
 * assert(expr, details`....`);`
 * ```
 * If expr is falsy, then the template contents are reported to
 * the console and also in a thrown error.
 *
 * The literal portions of the template are assumed non-sensitive, as
 * are the `typeof` types of the substitution values. These are
 * assembled into the thrown error message. The actual contents of the
 * substitution values are assumed sensitive, to be revealed to
 * the console only. We assume only the virtual platform's owner can read
 * what is written to the console, where the owner is in a privileged
 * position over computation running on that platform.
 *
 * The optional `optDetails` can be a string for backwards compatibility
 * with the nodejs assertion library.
 * @type {typeof baseAssert & { typeof: AssertTypeof, fail: typeof fail, equal: typeof equal }}
 */
const assert = assign(baseAssert, { equal, fail, typeof: assertTypeof });
freeze(assert);
export { assert };

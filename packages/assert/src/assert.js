// Copyright (C) 2019 Agoric, under Apache License 2.0

// @ts-check

import './types.js';

// This module assumes the de-facto standard `console` host object.
// To the extent that this `console` is considered a resource,
// this module must be considered a resource module.

const { freeze, is: isSame, assign } = Object;

// For our internal debugging purposes, uncomment
// const originalConsole = console;

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

// /////////////////////////////////////////////////////////////////////////////

/**
 * @type {ErrorInfo}
 */
const ErrorInfo = {
  NOTE: 'ERROR_NOTE:',
  MESSAGE: 'ERROR_MESSAGE:',
};
freeze(ErrorInfo);
export { ErrorInfo };

/**
 * Tell the `console` to consider the `error` to have an annotation of
 * `errorInfoKind` whose contents are the logArgs returned by calling
 * `getLogArgs()`.
 *
 * This function feature detects whether the console has (non-standard) a
 * `rememberErrorInfo`. The consoles made by the `@agoric/console` package
 * have this custom method.
 * This function then calls this custom method to inform the console. For a
 * normal console without a `rememberErrorInfo` method, this extra error info
 * is ignored.
 */
const logErrorInfoToConsole = (console, error, errorInfoKind, getLogArgs) => {
  /**
   * @type {RememberErrorInfo}
   */
  const rememberErrorInfo = console.rememberErrorInfo;
  if (typeof rememberErrorInfo === 'function') {
    // A console with a custom `rememberErrorInfo` method can avoid even
    // calling `getLogArgs()` until it needs to, which most won't.
    rememberErrorInfo(error, errorInfoKind, getLogArgs);
  }
};

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
 * WARNING: A `details` template literal currently evaluates to an unhardened
 * `Complainer`, as hardening the `Complainer` proved to cause significant
 * performance degradation.
 * Consequently, callers should take care to use the resulting `Complainer`
 * only in contexts where this lack of hardening does not present a hazard.
 * In current usage, a `details` template literal
 * may only appear either as an argument to `assert`, where we know hardening
 * won't matter, or inside another hardened object graph, where hardening is
 * already ensured.  However, there is currently no means to enfoce these
 * constraints, so users are required to employ the `details` template literal
 * with caution.
 * Our intent is to eventually have a lint rule that will check for
 * inappropriate uses; or find an alternative means of implementing `details`
 * that does not encounter the performance issue.  The final disposition of
 * this is being discussed and tracked in issue #679 in the agoric-sdk
 * repository.
 *
 * @typedef {Object} Complainer An object that can associate its contents
 * with an error --- either one passed in via `annotate`, or one the
 * complainer itself should make and return via `complain`.
 * @property {(Error, ErrorInfoKind) => void} annotate Tell the console that
 * this error is associated with this complainer's detailed info.
 * @property {() => Error} complain Return an Error to throw, where that error
 * is annotated with this complainer's detailed info.
 *
 * @typedef {string|Complainer} Details Either a plain string, or made by
 * details``
 *
 * @param {TemplateStringsArray | string[]} template The template to format
 * @param {any[]} args Arguments to the template
 * @returns {Complainer} The complainer for these details
 */
const details = (template, ...args) => {
  const getLogArgs = () => {
    const logArgs = [template[0]];
    for (let i = 0; i < args.length; i += 1) {
      let arg = args[i];
      if (declassifiers.has(arg)) {
        arg = declassifiers.get(arg);
      }
      // Remove the extra spaces (since console.error puts them
      // between each cause).
      const priorWithoutSpace = (logArgs.pop() || '').replace(/ $/, '');
      if (priorWithoutSpace !== '') {
        logArgs.push(priorWithoutSpace);
      }
      const nextWithoutSpace = template[i + 1].replace(/^ /, '');
      logArgs.push(arg, nextWithoutSpace);
    }
    if (logArgs[logArgs.length - 1] === '') {
      logArgs.pop();
    }
    return logArgs;
  };
  const getMessageString = () => {
    const parts = [template[0]];
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      let argStr;
      if (declassifiers.has(arg)) {
        argStr = `${arg}`;
      } else if (arg instanceof Error) {
        argStr = `(${an(arg.name)})`;
      } else {
        argStr = `(${an(typeof arg)})`;
      }
      parts.push(argStr, template[i + 1]);
    }
    return parts.join('');
  };
  /**
   * @param {Error} error
   * @param {ErrorInfoKind} [errorInfoKind=ErrorInfo.NOTE]
   */
  const annotate = (error, errorInfoKind = ErrorInfo.NOTE) => {
    logErrorInfoToConsole(console, error, errorInfoKind, getLogArgs);
  };
  const complain = (ErrorConstructor = RangeError) => {
    const messageString = getMessageString();
    const error = new ErrorConstructor(messageString);
    annotate(error, ErrorInfo.MESSAGE);
    // TODO Having a `debugger` statement in production code is
    // controversial
    // eslint-disable-next-line no-debugger
    debugger;
    // If we get rid of the `debugger` statement above, the next line may be a
    // particularly fruitful place to place a breakpoint.
    return error;
  };
  // remove harden per above discussion
  // const complainer = harden({ annotate, complain });
  const complainer = { annotate, complain };
  return complainer;
};
freeze(details);
export { details };

/**
 * The `assert.fail` method.
 *
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

/**
 * The `assert.note` method.
 *
 * Tell the console to consider this error to be annotated by these
 * details.
 *
 * @param {Error} error
 * @param {Details} detailsNote The details of what was asserted
 * @returns {void}
 */
const assertNote = (error, detailsNote) => {
  if (typeof detailsNote === 'string') {
    // If it is a string, use it as the literal part of the template so
    // it doesn't get quoted.
    detailsNote = details([detailsNote]);
  }
  detailsNote.annotate(error, ErrorInfo.NOTE);
};
freeze(fail);

// Don't freeze or export `baseAssert` until we add methods.
// TODO If I change this from a `function` function to an arrow
// function, I seem to get type errors from TypeScript. Why?
/**
 * The `assert` function itself.
 *
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
 * The `assert.equal` method
 *
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
 * The `assert.typeof` method.
 *
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
 * @type {typeof baseAssert & { typeof: AssertTypeof, fail: typeof fail, equal: typeof equal, note: typeof assertNote }}
 */
const assert = assign(baseAssert, {
  equal,
  fail,
  typeof: assertTypeof,
  note: assertNote,
});
freeze(assert);
export { assert };

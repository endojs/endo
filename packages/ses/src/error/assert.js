// Copyright (C) 2019 Agoric, under Apache License 2.0
// @ts-check

// To ensure that this module operates without special privilege, it should
// not reference the free variable `console` except for its own internal
// debugging purposes in the declaration of `internalDebugConsole`, which is
// normally commented out.

// This module however has top level mutable state which is observable to code
// given access to the `loggedErrorHandler`, such as the causal console
// of `console.js`. However, for code that does not have such access, this
// module should not be observably impure.

import {
  RangeError,
  TypeError,
  WeakMap,
  arrayJoin,
  arrayMap,
  arrayPop,
  arrayPush,
  assign,
  freeze,
  defineProperty,
  globalThis,
  is,
  isError,
  regexpTest,
  stringIndexOf,
  stringReplace,
  stringSlice,
  stringStartsWith,
  weakmapDelete,
  weakmapGet,
  weakmapHas,
  weakmapSet,
  AggregateError,
  getOwnPropertyDescriptors,
  ownKeys,
  create,
  objectPrototype,
  hasOwn,
} from '../commons.js';
import { an, bestEffortStringify } from './stringify-utils.js';
import './types.js';
import './internal-types.js';
import { makeNoteLogArgsArrayKit } from './note-log-args.js';

/**
 * @import {BaseAssert, Assert, AssertionFunctions, AssertionUtilities, DeprecatedAssertionUtilities, Stringable, DetailsToken, MakeAssert} from '../../types.js';
 * @import {LogArgs, NoteCallback, LoggedErrorHandler} from './internal-types.js';
 */

// For internal debugging purposes, uncomment
// const internalDebugConsole = console;

// /////////////////////////////////////////////////////////////////////////////

/**
 * Maps the result of a `quote` or `bare` call back to its input value.
 *
 * @type {WeakMap<Stringable, any>}
 */
const declassifiers = new WeakMap();

/** @type {AssertionUtilities['quote']} */
const quote = (value, spaces = undefined) => {
  const result = freeze({
    toString: freeze(() => bestEffortStringify(value, spaces)),
  });
  weakmapSet(declassifiers, result, value);
  return result;
};
freeze(quote);

const canBeBare = freeze(/^[\w:-]( ?[\w:-])*$/);

/**
 * @type {AssertionUtilities['bare']}
 */
const bare = (text, spaces = undefined) => {
  if (typeof text !== 'string' || !regexpTest(canBeBare, text)) {
    return quote(text, spaces);
  }
  const result = freeze({
    toString: freeze(() => text),
  });
  weakmapSet(declassifiers, result, text);
  return result;
};
freeze(bare);

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {{ template: TemplateStringsArray | string[], args: any[] }} DetailsParts
 *
 * The contents of a `details` template literal tag: literal strings (always at
 * least one) and arbitrary substitution values from in between them.
 *
 * Unquoted substitution values are sensitive (and are redacted in error
 * `message` strings), so a DetailsPart must not leak outside of this file.
 */

/**
 * Maps the result of a `details` tagged template literal back to a record of
 * that template literal's contents.
 *
 * @type {WeakMap<DetailsToken, DetailsParts>}
 */
const hiddenDetailsMap = new WeakMap();

/**
 * Construct an error message string from `details` template literal contents,
 * replacing unquoted substitution values with redactions.
 *
 * @param {DetailsParts} hiddenDetails
 * @returns {string}
 */
const getMessageString = ({ template, args }) => {
  const parts = [template[0]];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    let argStr;
    if (weakmapHas(declassifiers, arg)) {
      argStr = `${arg}`;
    } else if (isError(arg)) {
      argStr = `(${an(arg.name)})`;
    } else {
      argStr = `(${an(typeof arg)})`;
    }
    arrayPush(parts, argStr, template[i + 1]);
  }
  return arrayJoin(parts, '');
};

/**
 * Define `toString` behavior for DetailsToken. To minimize the overhead of
 * creating new instances, we do this with an inherited `this`-sensitive method,
 * even though we normally avoid such sensitivity. To protect the method from
 * inappropriate application, it verifies that `this` is registered in
 * `redactedDetails` before doing interesting work.
 *
 * The behavior must not reveal anything redacted, so we use `getMessageString`
 * to return the same value as the message for a thrown assertion-failure error.
 */
const DetailsTokenProto = freeze({
  toString() {
    const hiddenDetails = weakmapGet(hiddenDetailsMap, this);
    if (hiddenDetails === undefined) {
      return '[Not a DetailsToken]';
    }
    return getMessageString(hiddenDetails);
  },
});
freeze(DetailsTokenProto.toString);

/**
 * Normally this is the function exported as `assert.details` and often
 * spelled `X`. However, if the `{errorTaming: 'unsafe'}` or
 * `{errorTaming: 'unsafe-debug'}` option is
 * given to `lockdown`, then `unredactedDetails` is used instead.
 *
 * There are some unconditional uses of `redactedDetails` in this module. All
 * of them should be uses where the template literal has no redacted (unquoted)
 * substitution values. In those cases, `redactedDetails` is equivalent to
 * `unredactedDetails`.
 *
 * @type {AssertionUtilities['details']}
 */
const redactedDetails = (template, ...args) => {
  // In case the result of this call is never used, perform as little processing
  // as possible here to keep things fast.
  const detailsToken = freeze({ __proto__: DetailsTokenProto });
  weakmapSet(hiddenDetailsMap, detailsToken, { template, args });
  return /** @type {DetailsToken} */ (/** @type {unknown} */ (detailsToken));
};
freeze(redactedDetails);

/**
 * `unredactedDetails` is like `details` except that it does not redact
 * anything. It acts like `details` would act if all substitution values
 * were wrapped with the `quote` function above (the function normally
 * spelled `q`). If the `{errorTaming: 'unsafe'}`
 * or `{errorTaming: 'unsafe-debug'}` option is given to
 * `lockdown`, then the lockdown-shim arranges for the global `assert` to be
 * one whose `details` property is `unredactedDetails`.
 * This setting optimizes the debugging and testing experience at the price
 * of safety. `unredactedDetails` also sacrifices the speed of `details`,
 * which is usually fine in debugging and testing.
 *
 * @type {AssertionUtilities['details']}
 */
const unredactedDetails = (template, ...args) => {
  args = arrayMap(args, arg =>
    weakmapHas(declassifiers, arg) ? arg : quote(arg),
  );
  return redactedDetails(template, ...args);
};
freeze(unredactedDetails);
export { unredactedDetails };

/**
 * Get arguments suitable for a console logger function (e.g., `console.error`)
 * from `details` template literal contents, unquoting quoted substitution
 * values.
 *
 * @param {DetailsParts} hiddenDetails
 * @returns {LogArgs}
 */
const getLogArgs = ({ template, args }) => {
  const logArgs = [template[0]];
  for (let i = 0; i < args.length; i += 1) {
    let arg = args[i];
    if (weakmapHas(declassifiers, arg)) {
      arg = weakmapGet(declassifiers, arg);
    }
    // Remove substitution-adjacent spaces from template fixed-string parts
    // (since console logging inserts its own argument-separating spaces).
    const prevLiteralPart = stringReplace(arrayPop(logArgs) || '', / $/, '');
    if (prevLiteralPart !== '') {
      arrayPush(logArgs, prevLiteralPart);
    }
    const nextLiteralPart = stringReplace(template[i + 1], /^ /, '');
    arrayPush(logArgs, arg, nextLiteralPart);
  }
  if (logArgs[logArgs.length - 1] === '') {
    arrayPop(logArgs);
  }
  return logArgs;
};

/**
 * Maps from an error object to arguments suitable for a privileged console
 * logger function such as `console.error`, including values that may be
 * redacted in the error's `message`.
 *
 * @type {WeakMap<Error, LogArgs>}
 */
const hiddenMessageLogArgs = new WeakMap();

// So each error tag will be unique.
let errorTagNum = 0;

/**
 * @type {WeakMap<Error, string>}
 */
const errorTags = new WeakMap();

/**
 * @param {Error} err
 * @param {string=} optErrorName
 * @returns {string}
 */
const tagError = (err, optErrorName = err.name) => {
  let errorTag = weakmapGet(errorTags, err);
  if (errorTag !== undefined) {
    return errorTag;
  }
  errorTagNum += 1;
  errorTag = `${optErrorName}#${errorTagNum}`;
  weakmapSet(errorTags, err, errorTag);
  return errorTag;
};

/**
 * Make reasonable best efforts to make a `Passable` error.
 *   - `sanitizeError` will remove any "extraneous" own properties already added
 *     by the host,
 *     such as `fileName`,`lineNumber` on FireFox or `line` on Safari.
 *   - If any such "extraneous" properties were removed, `sanitizeError` will
 *     annotate
 *     the error with them, so they still appear on the causal console
 *     log output for diagnostic purposes, but not be otherwise visible.
 *   - `sanitizeError` will ensure that any expected properties already
 *     added by the host are data
 *     properties, converting accessor properties to data properties as needed,
 *     such as `stack` on v8 (Chrome, Brave, Edge?)
 *   - `sanitizeError` will freeze the error, preventing any correct engine from
 *     adding or
 *     altering any of the error's own properties `sanitizeError` is done.
 *
 * However, `sanitizeError` will not, for example, `harden`
 * (i.e., deeply freeze)
 * or ensure that the `cause` or `errors` property satisfy the `Passable`
 * constraints. The purpose of `sanitizeError` is only to protect against
 * mischief the host may have already added to the error as created,
 * not to ensure that the error is actually Passable. For that,
 * see `toPassableError` in `@endo/pass-style`.
 *
 * @param {Error} error
 */
export const sanitizeError = error => {
  const descs = getOwnPropertyDescriptors(error);
  const {
    name: _nameDesc,
    message: _messageDesc,
    errors: _errorsDesc = undefined,
    cause: _causeDesc = undefined,
    stack: _stackDesc = undefined,
    ...restDescs
  } = descs;

  const restNames = ownKeys(restDescs);
  if (restNames.length >= 1) {
    for (const name of restNames) {
      delete error[name];
    }
    const dropped = create(objectPrototype, restDescs);
    const droppedDetails = redactedDetails`originally with properties ${quote(dropped)}`;
    // eslint-disable-next-line no-use-before-define
    note(error, droppedDetails);
  }
  for (const name of ownKeys(error)) {
    // @ts-expect-error TypeScript is still confused by symbols as property keys
    const desc = descs[name];
    if (desc && hasOwn(desc, 'get')) {
      const value = error[name]; // invokes the getter
      defineProperty(error, name, { value });
    }
  }
  freeze(error);
};

/**
 * @type {AssertionUtilities['makeError']}
 */
const makeError = (
  optDetails = redactedDetails`Assert failed`,
  errConstructor = globalThis.Error,
  {
    errorName = undefined,
    cause = undefined,
    errors = undefined,
    sanitize = true,
  } = {},
) => {
  // Promote string-valued `optDetails` into a minimal DetailsParts
  // consisting of that string as the sole literal part with no substitutions.
  if (typeof optDetails === 'string') {
    optDetails = redactedDetails([optDetails]);
  }
  const hiddenDetails = weakmapGet(hiddenDetailsMap, optDetails);
  if (hiddenDetails === undefined) {
    throw TypeError(`unrecognized details ${quote(optDetails)}`);
  }
  const messageString = getMessageString(hiddenDetails);
  const opts = cause && { cause };
  let error;
  if (
    typeof AggregateError !== 'undefined' &&
    errConstructor === AggregateError
  ) {
    error = AggregateError(errors || [], messageString, opts);
  } else {
    const ErrorCtor = /** @type {ErrorConstructor} */ (errConstructor);
    error = ErrorCtor(messageString, opts);
    // Since we need to tolerate `errors` on an AggregateError, we may as well
    // tolerate it on all errors.
    if (errors !== undefined) {
      defineProperty(error, 'errors', {
        value: errors,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  }
  weakmapSet(hiddenMessageLogArgs, error, getLogArgs(hiddenDetails));
  if (errorName !== undefined) {
    tagError(error, errorName);
  }
  if (sanitize) {
    sanitizeError(error);
  }
  // The next line is a particularly fruitful place to put a breakpoint.
  return error;
};
freeze(makeError);

// /////////////////////////////////////////////////////////////////////////////

const { addLogArgs: addNoteLogArgs, takeLogArgsArray: takeAllNoteLogArgs } =
  makeNoteLogArgsArrayKit();

/**
 * An augmented console will normally only take the hidden noteArgs array once,
 * when it logs the error being annotated. Once that happens, further
 * annotations of that error should go to the console immediately. We arrange
 * that by accepting a note-callback function from the console as an optional
 * part of that taking operation. Normally there will only be at most one
 * callback per error, but that depends on console behavior which we should not
 * assume. We make this an array of callbacks so multiple registrations
 * are independent.
 *
 * @type {WeakMap<Error, NoteCallback[]>}
 */
const hiddenNoteCallbacks = new WeakMap();

/** @type {AssertionUtilities['note']} */
const note = (error, detailsNote) => {
  // Promote string-valued `detailsNote` into a minimal DetailsParts consisting
  // of that string as the sole literal part with no substitutions.
  if (typeof detailsNote === 'string') {
    detailsNote = redactedDetails([detailsNote]);
  }
  const hiddenDetails = weakmapGet(hiddenDetailsMap, detailsNote);
  if (hiddenDetails === undefined) {
    throw TypeError(`unrecognized details ${quote(detailsNote)}`);
  }
  const logArgs = getLogArgs(hiddenDetails);
  const callbacks = weakmapGet(hiddenNoteCallbacks, error);
  if (callbacks !== undefined) {
    for (const callback of callbacks) {
      callback(error, logArgs);
    }
  } else {
    addNoteLogArgs(error, logArgs);
  }
};
freeze(note);

/**
 * The unprivileged form that just uses the de facto `error.stack` property.
 * The start compartment normally has a privileged `globalThis.getStackString`
 * which should be preferred if present.
 *
 * @param {Error} error
 * @returns {string}
 */
const defaultGetStackString = error => {
  if (!('stack' in error)) {
    return '';
  }
  const stackString = `${error.stack}`;
  const pos = stringIndexOf(stackString, '\n');
  if (stringStartsWith(stackString, ' ') || pos === -1) {
    return stackString;
  }
  return stringSlice(stackString, pos + 1); // exclude the initial newline
};

/** @type {LoggedErrorHandler} */
const loggedErrorHandler = {
  getStackString: globalThis.getStackString || defaultGetStackString,
  tagError: error => tagError(error),
  resetErrorTagNum: () => {
    errorTagNum = 0;
  },
  getMessageLogArgs: error => weakmapGet(hiddenMessageLogArgs, error),
  takeMessageLogArgs: error => {
    const logArgs = weakmapGet(hiddenMessageLogArgs, error);
    weakmapDelete(hiddenMessageLogArgs, error);
    return logArgs;
  },
  takeNoteLogArgsArray: (error, callback) => {
    const logArgsArray = takeAllNoteLogArgs(error);
    if (callback !== undefined) {
      const callbacks = weakmapGet(hiddenNoteCallbacks, error);
      if (callbacks) {
        arrayPush(callbacks, callback);
      } else {
        weakmapSet(hiddenNoteCallbacks, error, [callback]);
      }
    }
    return logArgsArray || [];
  },
};
freeze(loggedErrorHandler);
export { loggedErrorHandler };

// /////////////////////////////////////////////////////////////////////////////

/**
 * @type {MakeAssert}
 */
export const makeAssert = (optRaise = undefined, unredacted = false) => {
  const details = unredacted ? unredactedDetails : redactedDetails;
  const assertFailedDetails = details`Check failed`;

  /** @type {AssertionFunctions['fail']} */
  const fail = (
    optDetails = assertFailedDetails,
    errConstructor = undefined,
    options = undefined,
  ) => {
    const reason = makeError(optDetails, errConstructor, options);
    if (optRaise !== undefined) {
      optRaise(reason);
    }
    throw reason;
  };
  freeze(fail);

  /** @type {AssertionUtilities['Fail']} */
  const Fail = (template, ...args) => fail(details(template, ...args));

  // Don't freeze or export `assert` until we add methods.
  /** @type {BaseAssert} */
  const assert = (
    condition,
    optDetails = undefined,
    errConstructor = undefined,
    options = undefined,
  ) => {
    condition || fail(optDetails, errConstructor, options);
  };

  /** @type {AssertionFunctions['equal']} */
  const equal = (
    actual,
    expected,
    optDetails = undefined,
    errConstructor = undefined,
    options = undefined,
  ) => {
    is(actual, expected) ||
      fail(
        optDetails || details`Expected ${actual} is same as ${expected}`,
        errConstructor || RangeError,
        options,
      );
  };
  freeze(equal);

  /** @type {AssertionFunctions['typeof']} */
  const assertTypeof = (specimen, typename, optDetails) => {
    // This will safely fall through if typename is not a string,
    // which is what we want.
    // eslint-disable-next-line valid-typeof
    if (typeof specimen === typename) {
      return;
    }
    typeof typename === 'string' || Fail`${quote(typename)} must be a string`;

    if (optDetails === undefined) {
      // Embed the type phrase without quotes.
      const typeWithDeterminer = an(typename);
      optDetails = details`${specimen} must be ${bare(typeWithDeterminer)}`;
    }
    fail(optDetails, TypeError);
  };
  freeze(assertTypeof);

  /** @type {AssertionFunctions['string']} */
  const assertString = (specimen, optDetails = undefined) =>
    assertTypeof(specimen, 'string', optDetails);

  /** @type {Pick<AssertionFunctions, keyof AssertionFunctions>} */
  const assertionFunctions = {
    equal,
    typeof: assertTypeof,
    string: assertString,
    fail,
  };

  /** @type {AssertionUtilities} */
  const assertionUtilities = {
    makeError,
    note,
    details,
    Fail,
    quote,
    bare,
  };

  /** @type {DeprecatedAssertionUtilities} */
  const deprecated = { error: makeError, makeAssert };

  /** @type {Assert} */
  const finishedAssert = assign(assert, {
    ...assertionFunctions,
    ...assertionUtilities,
    ...deprecated,
  });
  return freeze(finishedAssert);
};
freeze(makeAssert);

/** @type {Assert} */
const assert = makeAssert();
export { assert };

// Internal, to obviate polymorphic dispatch, but may become rigorously
// consistent with @endo/error:

/** @type {AssertionFunctions['equal']} */
const assertEqual = assert.equal;

export {
  assertEqual,
  makeError,
  note as annotateError,
  redactedDetails as X,
  quote as q,
  bare as b,
};

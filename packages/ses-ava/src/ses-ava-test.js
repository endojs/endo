/* global globalThis */
import 'ses';
import {
  loggedErrorHandler,
  makeCausalConsole,
  consoleLevelMethods,
  consoleOtherMethods,
} from 'ses/console-tools.js';

/**
 * TODO For some reason, the following declaration (with "at-" as "@")
 * doesn't work well for either TS or typedoc. For TS it seems to type
 * `VirtualConsole` as `any` in a vscode hover. For typedoc it results in
 * errors.
 *
 * at-typedef {import('ses/console-tools.js').VirtualConsole} VirtualConsole
 *
 * so instead, for now, we just declare it as `any`. TODO is to repair this.
 *
 * @typedef {any} VirtualConsole
 */

const { stringify } = JSON;
const { defineProperty, freeze } = Object;
const { apply } = Reflect;

/**
 * @typedef {(...args: unknown[]) => void} Logger
 */

const defaultLogger = (...args) => {
  console.error(...args);
};

/**
 * Determine if the argument is a Promise.
 * (Approximately copied from promiseKit.js)
 *
 * @param {unknown} maybePromise The value to examine
 * @returns {maybePromise is Promise} Whether it is a promise
 */
const isPromise = maybePromise =>
  Promise.resolve(maybePromise) === maybePromise;

/**
 * Calls `func(...args)` passing back approximately its outcome, but first
 * logging any erroneous outcome to the `logger`.
 *
 *    * If `func(...args)` returns a non-promise, silently return it.
 *    * If `func(...args)` throws, log what was thrown and then rethrow it.
 *    * If `func(...args)` returns a promise, immediately return a new
 *      unresolved promise.
 *       * If the first promise fulfills, silently fulfill the returned promise
 *         even if the fulfillment was an error.
 *       * If the first promise rejects, log the rejection reason and then
 *         reject the returned promise with the same reason.
 *
 * The delayed rejection of the returned promise is an observable difference
 * from directly calling `func(...args)` but will be equivalent enough for most
 * purposes.
 *
 * @param {(...unknown) => unknown} func
 * @param {unknown[]} args
 * @param {string} source
 * @param {Logger} logger
 * @param {VirtualConsole} [optConsole]
 */
const logErrorFirst = (func, args, source, logger, optConsole = undefined) => {
  const originalConsole = globalThis.console;
  if (optConsole) {
    globalThis.console = optConsole;
  }
  let result;
  try {
    result = apply(func, undefined, args);
  } catch (err) {
    logger(`THROWN from ${source}:`, err);
    throw err;
  } finally {
    if (optConsole) {
      globalThis.console = originalConsole;
    }
  }
  if (isPromise(result)) {
    return result.then(
      v => v,
      reason => {
        logger(`REJECTED from ${source}:`, reason);
        return result;
      },
    );
  } else {
    return result;
  }
};

const overrideList = [
  'after',
  'afterEach',
  'before',
  'beforeEach',
  'failing',
  'serial',
  'only',
];

/**
 * Implement the VirtualConsole API badly by turning all calls into
 * calls on `tlogger`. We need to do this to have `console` logging
 * turn into calls to Ava's `t.log`, so these console log messages
 * are output in the right place.
 *
 * @param {Logger} tlogger
 * @returns {VirtualConsole}
 */
const makeConsoleFromLogger = tlogger => {
  const baseConsole = {};
  for (const [name1, _] of consoleLevelMethods) {
    baseConsole[name1] = tlogger;
  }
  for (const [name2, _] of [
    ['group', 'log'],
    ['groupCollapsed', 'log'],
    ...consoleOtherMethods,
  ]) {
    baseConsole[name2] = (...args) => tlogger(name2, ...args);
  }
  harden(baseConsole);
  return makeCausalConsole(
    /** @type {VirtualConsole} */ (baseConsole),
    loggedErrorHandler,
  );
};

/**
 * @typedef {object} LoggingOptions
 * @property {boolean} [tlog]
 * @property {boolean} [pushConsole]
 */

/**
 * @param {Logger} tlogger
 * @param {Logger | LoggingOptions} loggerOrOptions
 * @returns {Logger}
 */
const getLogger = (tlogger, loggerOrOptions) => {
  if (typeof loggerOrOptions === 'function') {
    return loggerOrOptions;
  } else if (typeof loggerOrOptions === 'object') {
    const { tlog } = loggerOrOptions;
    if (tlog) {
      const causalConsole = makeConsoleFromLogger(tlogger);
      return causalConsole.error;
    } else {
      // Without causal console wrapper
      return tlogger;
    }
  }
  throw Error(`Unrecognized loggerOrOption ${loggerOrOptions}`);
};

/**
 * @template {import('ava').TestFn} T
 * @param {T} testerFunc
 * @param {Logger | LoggingOptions} loggerOrOption
 * @returns {T} Not yet frozen!
 */
const augmentLogging = (testerFunc, loggerOrOption) => {
  const testerFuncName = `ava ${testerFunc.name || 'test'}`;
  const augmented = (...args) => {
    // Align with ava argument parsing.
    // https://github.com/avajs/ava/blob/c74934853db1d387c46ed1f953970c777feed6a0/lib/parse-test-args.js
    const rawTitle = typeof args[0] === 'string' ? args.shift() : undefined;
    const implFuncOrObj = args.shift();
    const hasRawTitle = typeof rawTitle === 'string';
    let resolvedTitle;
    // Successful test declaration must be possible before `lockdown` allows
    // `harden` to function, but `freeze(arrowFunc)` is a suitable replacement
    // because all objects reachable from the result are intrinsics hardened by
    // lockdown.
    const wrapBuildTitle = (buildTitle, thisObj) => {
      const wrappedBuildTitle = (...titleArgs) => {
        resolvedTitle = apply(buildTitle, thisObj, titleArgs);
        return resolvedTitle;
      };
      return freeze(wrappedBuildTitle);
    };
    const wrapImplFunc = fn => {
      const wrappedFunc = t => {
        // `harden` should be functional by the time a test callback is invoked.
        harden(t);
        // Format source like `test("$rawTitle") "$resolvedTitle"`.
        const quotedRawTitle = hasRawTitle ? stringify(rawTitle) : '';
        const quotedResolvedTitle =
          typeof resolvedTitle === 'string' && resolvedTitle !== rawTitle
            ? ` ${stringify(resolvedTitle)}`
            : '';
        const source = `${testerFuncName}(${quotedRawTitle})${quotedResolvedTitle}`;

        const logger = getLogger(t.log, loggerOrOption);
        let optConsole;
        if (typeof loggerOrOption === 'object' && loggerOrOption.pushConsole) {
          optConsole = makeConsoleFromLogger(t.log);
        }
        return logErrorFirst(fn, [t, ...args], source, logger, optConsole);
      };
      const buildTitle = fn.title;
      if (buildTitle) {
        wrappedFunc.title = wrapBuildTitle(buildTitle, fn);
      }
      return freeze(wrappedFunc);
    };
    let implArg;
    if (typeof implFuncOrObj === 'function') {
      // Handle common cases like `test(title, t => { ... }, ...)`.
      implArg = wrapImplFunc(implFuncOrObj);
    } else if (typeof implFuncOrObj === 'object' && implFuncOrObj) {
      // Handle cases like `test(title, test.macro(...), ...)`.
      // Note that this will need updating if a future version of ava adds an alternative to `exec`.
      implArg = {
        ...implFuncOrObj,
        exec: wrapImplFunc(implFuncOrObj.exec),
      };
      const buildTitle = implArg.title;
      if (buildTitle) {
        implArg.title = wrapBuildTitle(buildTitle, implArg);
      }
      freeze(implArg);
    } else {
      // Let ava handle this bad input.
      implArg = implFuncOrObj;
    }
    // @ts-expect-error these spreads are acceptable
    return testerFunc(...(hasRawTitle ? [rawTitle] : []), implArg, ...args);
  };
  // re-use other properties (e.g. `.always`)
  // https://github.com/endojs/endo/issues/647#issuecomment-809010961
  Object.assign(augmented, testerFunc);
  // @ts-expect-error cast
  return /** @type {import('ava').TestFn} */ augmented;
};

/**
 * The ava `test` function takes a callback argument of the form
 * `t => {...}` or `async t => {...}`.
 * If the outcome of this function indicates an error, either
 * by throwing or by eventually rejecting a returned promise, ava does its
 * own console-like display of this error and its stacktrace.
 * However, it does not use the SES `console` and so misses out on features
 * such as unredaction.
 *
 * To use this package, a test file replaces the line
 * ```js
 * import test from 'ava';
 * ```
 * with
 * ```js
 * import { wrapTest } from '@endo/ses-ava';
 * import rawTest from 'ava';
 *
 * const test = wrapTest(rawTest);
 * ```
 * Then the calls to `test` in the rest of the test file will act like they
 * used to, except that, if a test fails because the test function (the
 * callback argument to `test`) throws or returns a promise
 * that eventually rejects, the error is first sent to the logger
 * (which defaults to using the SES-aware `console.error`)
 * before propagating into `rawTest`.
 *
 * @template {import('ava').TestFn} T ava `test`
 * @param {T} avaTest
 * @param {Logger | LoggingOptions} [loggerOrOption]
 * @returns {T}
 */
const wrapTest = (avaTest, loggerOrOption = defaultLogger) => {
  const sesAvaTest = augmentLogging(avaTest, loggerOrOption);
  for (const methodName of overrideList) {
    defineProperty(sesAvaTest, methodName, {
      value: augmentLogging(avaTest[methodName], loggerOrOption),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  harden(sesAvaTest);
  return sesAvaTest;
};
// Successful instantiation of this module must be possible before `lockdown`
// allows `harden(wrapTest)` to function, but `freeze` is a suitable replacement
// because all objects reachable from the result are intrinsics hardened by
// lockdown.
freeze(wrapTest);
export { wrapTest };

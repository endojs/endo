import 'ses';

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
 * @param {string} name
 * @param {Logger} logger
 */
const logErrorFirst = (func, args, name, logger) => {
  let result;
  try {
    result = apply(func, undefined, args);
  } catch (err) {
    logger(`THROWN from ${name}:`, err);
    throw err;
  }
  if (isPromise(result)) {
    return result.then(
      v => v,
      reason => {
        logger(`REJECTED from ${name}:`, reason);
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
 * @template {import('ava').TestFn} T
 * @param {T} testerFunc
 * @param {Logger} logger
 * @returns {T} Not yet frozen!
 */
const augmentLogging = (testerFunc, logger) => {
  const testerFuncName = `ava ${testerFunc.name || 'test'}`;
  const augmented = (...args) => {
    // Align with ava argument parsing.
    // https://github.com/avajs/ava/blob/c74934853db1d387c46ed1f953970c777feed6a0/lib/parse-test-args.js
    const maybeTitle = typeof args[0] === 'string' ? [args.shift()] : [];
    const implFuncOrObj = args.shift();
    const wrapImplFunc = fn => {
      const wrappedFunc = t => {
        harden(t);
        return logErrorFirst(fn, [t, ...args], testerFuncName, logger);
      };
      if (fn.title) {
        wrappedFunc.title = fn.title;
      }
      return wrappedFunc;
    };
    let implArg;
    if (typeof implFuncOrObj === 'function') {
      // Handle common cases like `test(title, t => { ... }, ...)`.
      implArg = wrapImplFunc(implFuncOrObj);
    } else if (typeof implFuncOrObj === 'object' && implFuncOrObj) {
      // Handle cases like `test(title, test.macro(...), ...)`.
      // Note that this will need updating if a future version of ava adds an alternative to `exec`.
      implArg = freeze({
        ...implFuncOrObj,
        exec: wrapImplFunc(implFuncOrObj.exec),
      });
    } else {
      // Let ava handle this bad input.
      implArg = implFuncOrObj;
    }
    // @ts-expect-error these spreads are acceptable
    return testerFunc(...maybeTitle, implArg, ...args);
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
 * @param {Logger} [logger]
 * @returns {T}
 */
const wrapTest = (avaTest, logger = defaultLogger) => {
  const sesAvaTest = augmentLogging(avaTest, logger);
  for (const methodName of overrideList) {
    defineProperty(sesAvaTest, methodName, {
      value: augmentLogging(avaTest[methodName], logger),
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

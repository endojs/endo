import 'ses';
import './types.js';

const { apply } = Reflect;

/**
 * Just forwards to global `console.error`.
 *
 * @type {Logger}
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
 * @type {LogCallError}
 */
const logErrorFirst = (func, args, name, logger = defaultLogger) => {
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

const testerMethodsWhitelist = [
  'after',
  'afterEach',
  'before',
  'beforeEach',
  'failing',
  'serial',
  'only',
  'skip',
];

/**
 * @param {TesterFunc} testerFunc
 * @param {Logger} [logger]
 * @returns {TesterFunc} Not yet frozen!
 */
const wrapTester = (testerFunc, logger = defaultLogger) => {
  /** @type {TesterFunc} */
  const testerWrapper = (title, implFunc, ...otherArgs) => {
    /** @type {ImplFunc} */
    const testFuncWrapper = t => {
      harden(t);
      return logErrorFirst(implFunc, [t, ...otherArgs], 'ava test', logger);
    };
    if (implFunc && implFunc.title) {
      testFuncWrapper.title = implFunc.title;
    }
    return testerFunc(title, testFuncWrapper, ...otherArgs);
  };
  return testerWrapper;
};

/**
 * The ava `test` function takes a callback argument of the form
 * `t => {...}`. If the outcome of this function indicates an error, either
 * by throwing or by eventually rejecting a returned promise, ava does its
 * own peculiar console-like display of this error and its stacktrace.
 * However, it does not use the ses `console` and so bypasses all the fancy
 * diagnostics provided by the ses `console`.
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
 * that eventually rejects, the error is first sent to the `console` before
 * propagating into `rawTest`.
 *
 * @param {TesterInterface} avaTest
 * @param {Logger} [logger]
 * @returns {TesterInterface}
 */
const wrapTest = (avaTest, logger = defaultLogger) => {
  const testerWrapper = /** @type {TesterInterface} */ (wrapTester(
    avaTest,
    logger,
  ));
  for (const methodName of testerMethodsWhitelist) {
    if (methodName in avaTest) {
      /** @type {TesterFunc} */
      const testerMethod = (title, implFunc, ...otherArgs) =>
        avaTest[methodName](title, implFunc, ...otherArgs);
      testerWrapper[methodName] = wrapTester(testerMethod);
    }
  }
  harden(testerWrapper);
  return testerWrapper;
};
// harden(wrapTest);
export { wrapTest };

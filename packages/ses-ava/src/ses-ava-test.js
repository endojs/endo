// @ts-check
import 'ses';
import './types.js';

const { apply } = Reflect;

/**
 * Just forwards to global `console.error`.
 *
 * @type {import('./types').Logger}
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
 * @type {import('./types').LogCallError}
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
  'cb',
  'failing',
  'serial',
  'only',
  'skip',
];

/**
 * @param { import('./types').TesterFunc } testerFunc
 * @param { import('./types').Logger =} logger
 * @returns { import('./types').TesterFunc } Not yet frozen!
 */
const wrapTester = (testerFunc, logger = defaultLogger) => {
  /** @type {import('./types').TesterFunc} */
  const testerWrapper = (title, implFunc) => {
    /** @type {import('./types').ImplFunc} */
    const testFuncWrapper = t => {
      harden(t);
      return logErrorFirst(implFunc, [t], 'ava test', logger);
    };
    return testerFunc(title, testFuncWrapper);
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
 * import { wrapTest } from '@agoric/ses-ava';
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
 * @param {import('./types').TesterInterface} avaTest
 * @param {import('./types').Logger=} logger
 * @returns {import('./types').TesterInterface}
 */
const wrapTest = (avaTest, logger = defaultLogger) => {
  /** @type {import('./types').TesterInterface} */
  const testerWrapper = wrapTester(avaTest, logger);
  for (const methodName of testerMethodsWhitelist) {
    if (methodName in avaTest) {
      const testerMethod = (title, implFunc) =>
        avaTest[methodName](title, implFunc);
      testerWrapper[methodName] = wrapTester(testerMethod);
    }
  }
  harden(testerWrapper);
  return testerWrapper;
};
// harden(wrapTest);
export { wrapTest };

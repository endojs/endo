import 'ses';

const { apply } = Reflect;

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
 * @typedef {(...args: unknown[]) => void} Logger
 */

/**
 * Calls `func(...args)` passing back approximately its outcome, but first
 * logging any erroneous outcome to the `logger`, which defaults to
 * `console.log`.
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
 * TODO This function is useful independent of Ava, so consider moving it
 * somewhere and exporting it for general reuse.
 *
 * @param {(...unknown) => unknown} func
 * @param {unknown[]} args
 * @param {string} name
 * @param {Logger=} logError
 */
const logErrorFirst = (func, args, name, logError = console.error) => {
  let result;
  try {
    result = apply(func, undefined, args);
  } catch (err) {
    logError(`THROWN from ${name}:`, err);
    throw err;
  }
  if (isPromise(result)) {
    return result.then(
      v => v,
      reason => {
        logError(`REJECTED from ${name}:`, reason);
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
 * @callback BaseImplFunc
 * This is the function that invariably starts `t => {`.
 * Ava's types call this `Implementation`, but that's just too confusing.
 * @param {Assertions} t
 * @returns {unknown}
 *
 * @typedef {BaseImplFunc | Object} ImplFunc
 * @property {(...unknown) => string} [title]
 *
 * @callback TesterFunc
 * @param {string} title
 * @param {ImplFunc} [implFunc]
 * @returns {void}
 */

/**
 * @template {TesterFunc} T
 * @param {T} testerFunc
 * @param {Logger} [logError]
 * @returns {T} Not yet frozen!
 */
const augmentLogging = (testerFunc, logError = console.error) => {
  /** @type {TesterFunc} */
  const augmented = (title, implFunc, ...otherArgs) => {
    const testFuncWrapper = t => {
      harden(t);
      return logErrorFirst(implFunc, [t, ...otherArgs], 'ava test', logError);
    };
    if (implFunc && implFunc.title) {
      testFuncWrapper.title = implFunc.title;
    }
    return testerFunc(title, testFuncWrapper, ...otherArgs);
  };
  // re-use other properties (e.g. `.always`)
  // https://github.com/endojs/endo/issues/647#issuecomment-809010961
  Object.assign(augmented, testerFunc);
  // @ts-expect-error cast
  return augmented;
};

// TODO check whether this is still necessary in Ava 4
/**
 * The Ava 3 `test` function takes a callback argument of the form
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
 * @template {TesterFunc} T Ava `test`
 * @param {T} avaTest
 * @param {Logger} [logError]
 * @returns {T}
 */
const wrapTest = (avaTest, logError = console.error) => {
  const sesAvaTest = augmentLogging(avaTest, logError);
  for (const methodName of overrideList) {
    sesAvaTest[methodName] = augmentLogging(avaTest[methodName]);
  }
  harden(sesAvaTest);
  return sesAvaTest;
};
harden(wrapTest);
export { wrapTest };

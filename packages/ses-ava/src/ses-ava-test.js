/* global globalThis */
import 'ses';

/**
 * Copied from the ses-shim's console-shim.js file, since the idea is that
 * these communicate not by export import, but rather by convention plus
 * feature testing. The following test is from there:
 *
 *`makeCausalConsoleFromLoggerForSesAva` is privileged because it exposes
 * unredacted error info onto the `Logger` provided by the caller. It
 * should not be made available to non-privileged code.
 *
 * Further, we consider this particular API choice to be experimental
 * and may change in the future. It is currently only intended for use by
 * `@endo/ses-ava`, with which it will be co-maintained.
 *
 * Thus, this `console-shim.js` makes `makeCausalConsoleFromLoggerForSesAva` for
 * on `globalThis` which it *assumes* is the global of the start compartment,
 * which is therefore allowed to hold powers that should not be available
 * in constructed compartments. It makes it available as the value of a
 * global property named by a registered symbol named
 * `MAKE_CAUSAL_CONSOLE_FROM_LOGGER_KEY_FOR_SES_AVA`.
 *
 * Anyone accessing this, including `@endo/ses-ava`, should feature test for
 * this and be tolerant of its absence. It may indeed disappear from later
 * versions of the ses-shim.
 */
const MAKE_CAUSAL_CONSOLE_FROM_LOGGER_KEY_FOR_SES_AVA = Symbol.for(
  'MAKE_CAUSAL_CONSOLE_FROM_LOGGER_KEY_FOR_SES_AVA',
);

const optMakeCausalConsoleFromLoggerForSesAva =
  globalThis[MAKE_CAUSAL_CONSOLE_FROM_LOGGER_KEY_FOR_SES_AVA];

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
const {
  defineProperty,
  freeze,
  getPrototypeOf,
  getOwnPropertyDescriptors,
  entries,
} = Object;
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
 * Calls `func(virtualT, ...args)` passing back approximately its outcome,
 * but first logging any erroneous outcome to the `virtualT.log`.
 *
 *    * If `func(...)` returns a non-promise, silently return it.
 *    * If `func(...)` throws, log what was thrown and then rethrow it.
 *    * If `func(...)` returns a promise, immediately return a new
 *      unresolved promise.
 *       * If the first promise fulfills, silently fulfill the returned promise
 *         even if the fulfillment was an error.
 *       * If the first promise rejects, log the rejection reason and then
 *         reject the returned promise with the same reason.
 *
 * The delayed rejection of the returned promise is an observable difference
 * from directly calling `func(...)` but will be equivalent enough for most
 * testing purposes.
 *
 * @param {(
 *   t: import('ava').ExecutionContext,
 *   ...args: unknown[]
 * ) => unknown} func
 * @param {import('ava').ExecutionContext} virtualT
 * @param {unknown[]} args
 * @param {string} source
 */
const logErrorFirst = (func, virtualT, args, source) => {
  let result;
  try {
    result = apply(func, undefined, [virtualT, ...args]);
  } catch (err) {
    virtualT.log(`THROWN from ${source}:`, err);
    throw err;
  }
  if (isPromise(result)) {
    return result.then(
      v => v,
      reason => {
        virtualT.log(`REJECTED from ${source}:`, reason);
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
 * @param {import('ava').ExecutionContext} originalT
 * @returns {import('ava').ExecutionContext}
 */
const makeVirtualExecutionContext = originalT => {
  if (optMakeCausalConsoleFromLoggerForSesAva === undefined) {
    // Must tolerate absence as a failure of the feature test. In this
    // case, we fallback to `originalT` itself.
    return originalT;
  }
  const causalConsole = optMakeCausalConsoleFromLoggerForSesAva(originalT.log);
  const virtualT = {
    log: /** @type {import('ava').LogFn} */ (causalConsole.error),
    console: causalConsole,
    withConsole: thunk => {
      const originalConsole = globalThis.console;
      globalThis.console = /** @type {Console} */ (causalConsole);
      try {
        thunk();
      } finally {
        globalThis.console = originalConsole;
      }
    },
  };
  const originalProto = getPrototypeOf(originalT);
  const descs = {
    ...getOwnPropertyDescriptors(originalProto),
    ...getOwnPropertyDescriptors(originalT),
  };
  for (const [name, desc] of entries(descs)) {
    if (!(name in virtualT)) {
      if ('get' in desc) {
        defineProperty(virtualT, name, {
          ...desc,
          get() {
            return originalT[name];
          },
          set(newVal) {
            originalT[name] = newVal;
          },
        });
      } else if (typeof desc.value === 'function') {
        defineProperty(virtualT, name, {
          ...desc,
          value(...args) {
            return originalT[name](...args);
          },
        });
      } else {
        defineProperty(virtualT, name, desc);
      }
    }
  }

  // `harden` should be functional by the time a test callback is invoked.
  // @ts-ignore has extra properties outside type
  return harden(virtualT);
};

/**
 * @template {import('ava').TestFn} [T=import('ava').TestFn]
 * @param {T} testerFunc
 * @returns {T} Not yet frozen!
 */
const augmentLogging = testerFunc => {
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
      /**
       * @param {import('ava').ExecutionContext} originalT
       */
      const wrappedFunc = originalT => {
        const virtualT = makeVirtualExecutionContext(originalT);
        // Format source like `test("$rawTitle") "$resolvedTitle"`.
        const quotedRawTitle = hasRawTitle ? stringify(rawTitle) : '';
        const quotedResolvedTitle =
          typeof resolvedTitle === 'string' && resolvedTitle !== rawTitle
            ? ` ${stringify(resolvedTitle)}`
            : '';
        const source = `${testerFuncName}(${quotedRawTitle})${quotedResolvedTitle}`;
        return logErrorFirst(fn, virtualT, args, source);
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
 * @template {import('ava').TestFn} [T=import('ava').TestFn] ava `test`
 * @param {T} avaTest
 * @returns {T}
 */
const wrapTest = avaTest => {
  const sesAvaTest = augmentLogging(avaTest);
  for (const methodName of overrideList) {
    defineProperty(sesAvaTest, methodName, {
      value: augmentLogging(avaTest[methodName]),
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

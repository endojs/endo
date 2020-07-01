import { defineProperties, setPrototypeOf } from './commons.js';

// TODO where should this go?
export const NativeErrors = [
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
];

// Whitelist names from https://v8.dev/docs/stack-trace-api
// Whitelisting only the names used by error-stack-shim/src/v8StackFrames
// callSiteToFrame to shim the error stack proposal.
const safeV8CallSiteMethodNames = [
  // suppress 'getThis' definitely
  'getTypeName',
  // suppress 'getFunction' definitely
  'getFunctionName',
  'getMethodName',
  'getFileName',
  'getLineNumber',
  'getColumnNumber',
  'getEvalOrigin',
  // suppress 'isTopLevel' for now
  'isEval',
  // suppress 'isNative' for now
  'isConstructor',
  'isAsync',
  // suppress 'isPromiseAll' for now
  // suppress 'getPromiseIndex' for now

  // Additional names found by experiment, absent from
  // https://v8.dev/docs/stack-trace-api

  // suppress 'getPosition' for now
  // suppress 'getScriptNameOrSourceURL' for now
  'toString', // TODO replace to use only whitelisted info
];

// TODO this is a ridiculously expensive way to attenuate callsites.
// Before that matters, we should switch to a reasonable representation.
const safeV8CallSiteFacet = callSite => {
  const methodEntry = name => [name, () => callSite[name]()];
  return Object.fromEntries(safeV8CallSiteMethodNames.map(methodEntry));
};

const safeV8SST = sst => sst.map(safeV8CallSiteFacet);

export default function tameGlobalErrorObject(errorTaming = 'safe') {
  if (errorTaming !== 'safe' && errorTaming !== 'unsafe') {
    throw new Error(`unrecognized errorTaming ${errorTaming}`);
  }
  const originalError = Error;

  // We never expose the originalError constructor. Rather, tamedError
  // is the one to be installed on the start compartment.
  const tamedError = function Error(...rest) {
    if (new.target === undefined) {
      return originalError(...rest);
    }
    return Reflect.construct(originalError, rest, new.target);
  };

  // TODO uncomment the sharedError occurrences. To do this, we need
  // more intrinsic reform so that the whitelist doesn't get confused
  // between tamedError and sharedError.
  const sharedError = tamedError;
  /*
  const sharedError = function Error(...rest) {
    if (new.target === undefined) {
      return originalError(...rest);
    }
    return Reflect.construct(originalError, rest, new.target);
  };
  */

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods = {
    // The optional `optFn` argument is for cutting off the bottom of
    // the stack --- for capturing the stack only above the topmost
    // call to that function. Since this isn't the "real" captureStackTrace
    // but instead calls the real one, if no other cutoff is provided,
    // we cut this one off.
    captureStackTrace(error, optFn = tamedMethods.captureStackTrace) {
      if (
        errorTaming === 'unsafe' &&
        typeof originalError.captureStackTrace === 'function'
      ) {
        // originalError.captureStackTrace is only on v8
        originalError.captureStackTrace(error, optFn);
        return;
      }
      Reflect.set(error, 'stack', '');
    },
  };

  // A prepareFn is a prepareStackTrace function.
  // An sst is a `structuredStackTrace`, which is an array of
  // callsites.
  // A user prepareFn is a prepareFn defined by a client of this API,
  // and provided by assigning to `Error.prepareStackTrace`.
  // A user prepareFn should only receive an attenuated sst, which
  // is an array of attenuated callsites.
  // A system prepareFn is the prepareFn created by this module to
  // be installed on the real `Error` constructor, to receive
  // an original sst, i.e., an array of unattenuated callsites.
  // An input prepareFn is a function the user assigns to
  // `Error.prepareStackTrace`, which might be a user prepareFn or
  // a system prepareFn previously obtained by reading
  // `Error.prepareStackTrace`.

  // A weakset branding some functions as system prepareFns, all of which
  // must be defined by this module, since they can receive an
  // unattenuated sst.
  const systemPrepareFnSet = new WeakSet();

  const systemPrepareFnFor = inputPrepareFn => {
    if (systemPrepareFnSet.has(inputPrepareFn)) {
      return inputPrepareFn;
    }
    // Use concise methods to obtain named functions without constructors.
    const systemMethods = {
      prepareStackTrace(error, sst) {
        return inputPrepareFn(error, safeV8SST(sst));
      },
    };
    systemPrepareFnSet.add(systemMethods.prepareStackTrace);
    return systemMethods.prepareStackTrace;
  };

  const ErrorPrototype = originalError.prototype;
  if (typeof originalError.captureStackTrace === 'function') {
    // Define captureStackTrace only on v8
    defineProperties(tamedError, {
      captureStackTrace: {
        value: tamedMethods.captureStackTrace,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    });
  }
  defineProperties(tamedError, {
    length: { value: 1 },
    prototype: {
      value: ErrorPrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    stackTraceLimit: {
      get() {
        if (
          errorTaming === 'unsafe' &&
          typeof originalError.stackTraceLimit === 'number'
        ) {
          // originalError.stackTraceLimit is only on v8
          return originalError.stackTraceLimit;
        }
        return undefined;
      },
      // https://v8.dev/docs/stack-trace-api#compatibility advises that
      // programmers can "always" set `Error.stackTraceLimit` and
      // `Error.prepareStackTrace` even on non-v8 platforms. On non-v8
      // it will have no effect, but this advise only makes sense
      // if the assignment itself does not fail, which it would
      // if `Error` were naively frozen. Hence, we add setters that
      // accept but ignore the assignment on non-v8 platforms.
      set(newLimit) {
        if (
          errorTaming === 'unsafe' &&
          typeof originalError.stackTraceLimit === 'number'
        ) {
          // originalError.stackTraceLimit is only on v8
          originalError.stackTraceLimit = newLimit;
          // We place the useless return on the next line to ensure
          // that anything we place after the if in the future only
          // happens if the then-case does not.
          // eslint-disable-next-line no-useless-return
          return;
        }
      },
      // WTF on v8 stackTraceLimit is enumerable
      enumerable: false,
      configurable: true,
    },
    prepareStackTrace: {
      get() {
        if (errorTaming === 'unsafe') {
          return originalError.prepareStackTrace;
        }
        // By returning undefined, hopefully this means the VM will next consult
        // originalError.prepareStackTrace, even on node despite
        // https://bugs.chromium.org/p/v8/issues/detail?id=10551#c3
        // or, if absent, fallback to the default behavior.
        return undefined;
      },
      set(inputPrepareStackTraceFn) {
        if (errorTaming === 'unsafe') {
          if (typeof inputPrepareStackTraceFn === 'function') {
            const systemPrepareFn = systemPrepareFnFor(
              inputPrepareStackTraceFn,
            );
            originalError.prepareStackTrace = systemPrepareFn;
          } else {
            delete originalError.prepareStackTrace;
          }
          // We place the useless return on the next line to ensure
          // that anything we place after the if in the future only
          // happens if the then-case does not.
          // eslint-disable-next-line no-useless-return
          return;
        }
      },
      enumerable: false,
      configurable: true,
    },
  });

  // TODO uncomment. See TODO note above
  /*
  defineProperties(sharedError, {
    length: { value: 1 },
    prototype: {
      value: ErrorPrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    stackTraceLimit: {
      get() {
        return undefined;
      },
      set(_) {
        // ignore
      },
      // WTF on v8 stackTraceLimit is enumerable
      enumerable: false,
      configurable: true,
    },
    prepareStackTrace: {
      get() {
        return undefined;
      },
      set(_) {
        // ignore
      },
      enumerable: false,
      configurable: true,
    },
  });
  */

  defineProperties(ErrorPrototype, {
    constructor: { value: sharedError },
    /* TODO
    stack: {
      get() {
        return '';
      },
      set(_) {
        // ignore
      },
    },
    */
  });

  for (const NativeError of NativeErrors) {
    setPrototypeOf(NativeError, sharedError);
  }

  return {
    start: {
      Error: {
        value: tamedError,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    },
    shared: {
      Error: {
        value: sharedError,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    },
  };
}

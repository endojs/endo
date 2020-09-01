import { defineProperties, fromEntries } from '../commons.js';

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
  'isToplevel',
  'isEval',
  'isNative',
  'isConstructor',
  'isAsync',
  // suppress 'isPromiseAll' for now
  // suppress 'getPromiseIndex' for now

  // Additional names found by experiment, absent from
  // https://v8.dev/docs/stack-trace-api
  'getPosition',
  'getScriptNameOrSourceURL',

  'toString', // TODO replace to use only whitelisted info
];

// TODO this is a ridiculously expensive way to attenuate callsites.
// Before that matters, we should switch to a reasonable representation.
const safeV8CallSiteFacet = callSite => {
  const methodEntry = name => [name, () => callSite[name]()];
  const o = fromEntries(safeV8CallSiteMethodNames.map(methodEntry));
  return Object.create(o, {});
};

const safeV8SST = sst => sst.map(safeV8CallSiteFacet);

const callSiteFilter = _callSite => true;
// const callSiteFilter = callSite =>
//   !callSite.getFileName().includes('/node_modules/');

const callSiteStringifier = callSite => `\n  at ${callSite}`;

const stackStringFromSST = (error, sst) =>
  [...sst.filter(callSiteFilter).map(callSiteStringifier)].join('');

export function tameV8ErrorConstructor(
  OriginalError,
  InitialError,
  errorTaming,
) {
  // Mapping from error instance to the structured stack trace capturing the
  // stack for that instance.
  const ssts = new WeakMap();

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods = {
    // The optional `optFn` argument is for cutting off the bottom of
    // the stack --- for capturing the stack only above the topmost
    // call to that function. Since this isn't the "real" captureStackTrace
    // but instead calls the real one, if no other cutoff is provided,
    // we cut this one off.
    captureStackTrace(error, optFn = tamedMethods.captureStackTrace) {
      if (typeof OriginalError.captureStackTrace === 'function') {
        // OriginalError.captureStackTrace is only on v8
        OriginalError.captureStackTrace(error, optFn);
        return;
      }
      Reflect.set(error, 'stack', '');
    },
    // Shim of proposed special power, to reside by default only
    // in the start compartment, for getting the stack traceback
    // string associated with an error.
    // See https://tc39.es/proposal-error-stacks/
    getStackString(error) {
      if (!ssts.has(error)) {
        // eslint-disable-next-line no-void
        void error.stack;
      }
      const sst = ssts.get(error);
      if (!sst) {
        return '';
      }
      return stackStringFromSST(error, sst);
    },
    prepareStackTrace(error, sst) {
      ssts.set(error, sst);
      if (errorTaming === 'unsafe') {
        const stackString = stackStringFromSST(error, sst);
        return `${error}${stackString}`;
      }
      return '';
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

  const defaultPrepareFn = tamedMethods.prepareStackTrace;

  OriginalError.prepareStackTrace = defaultPrepareFn;

  // A weakset branding some functions as system prepareFns, all of which
  // must be defined by this module, since they can receive an
  // unattenuated sst.
  const systemPrepareFnSet = new WeakSet([defaultPrepareFn]);

  const systemPrepareFnFor = inputPrepareFn => {
    if (systemPrepareFnSet.has(inputPrepareFn)) {
      return inputPrepareFn;
    }
    // Use concise methods to obtain named functions without constructors.
    const systemMethods = {
      prepareStackTrace(error, sst) {
        ssts.set(error, sst);
        return inputPrepareFn(error, safeV8SST(sst));
      },
    };
    systemPrepareFnSet.add(systemMethods.prepareStackTrace);
    return systemMethods.prepareStackTrace;
  };

  defineProperties(InitialError, {
    captureStackTrace: {
      value: tamedMethods.captureStackTrace,
      writable: true,
      enumerable: false,
      configurable: true,
    },
    stackTraceLimit: {
      get() {
        if (typeof OriginalError.stackTraceLimit === 'number') {
          // OriginalError.stackTraceLimit is only on v8
          return OriginalError.stackTraceLimit;
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
        if (typeof OriginalError.stackTraceLimit === 'number') {
          // OriginalError.stackTraceLimit is only on v8
          OriginalError.stackTraceLimit = newLimit;
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
        return OriginalError.prepareStackTrace;
      },
      set(inputPrepareStackTraceFn) {
        if (typeof inputPrepareStackTraceFn === 'function') {
          const systemPrepareFn = systemPrepareFnFor(inputPrepareStackTraceFn);
          OriginalError.prepareStackTrace = systemPrepareFn;
        } else {
          OriginalError.prepareStackTrace = defaultPrepareFn;
        }
      },
      enumerable: false,
      configurable: true,
    },
  });

  return tamedMethods.getStackString;
}

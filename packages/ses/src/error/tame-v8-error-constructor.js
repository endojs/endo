import {
  WeakMap,
  WeakSet,
  apply,
  arrayFilter,
  arrayJoin,
  arrayMap,
  arraySlice,
  create,
  defineProperties,
  fromEntries,
  reflectSet,
  regexpExec,
  regexpTest,
  weakmapGet,
  weakmapSet,
  weaksetAdd,
  weaksetHas,
  TypeError,
} from '../commons.js';

// Permit names from https://v8.dev/docs/stack-trace-api
// Permiting only the names used by error-stack-shim/src/v8StackFrames
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

  'toString', // TODO replace to use only permitted info
];

// TODO this is a ridiculously expensive way to attenuate callsites.
// Before that matters, we should switch to a reasonable representation.
const safeV8CallSiteFacet = callSite => {
  const methodEntry = name => {
    const method = callSite[name];
    return [name, () => apply(method, callSite, [])];
  };
  const o = fromEntries(arrayMap(safeV8CallSiteMethodNames, methodEntry));
  return create(o, {});
};

const safeV8SST = sst => arrayMap(sst, safeV8CallSiteFacet);

// If it has `/node_modules/` anywhere in it, on Node it is likely
// to be a dependent package of the current package, and so to
// be an infrastructure frame to be dropped from concise stack traces.
const FILENAME_NODE_DEPENDENTS_CENSOR = /\/node_modules\//;

// If it begins with `internal/` or `node:internal` then it is likely
// part of the node infrustructre itself, to be dropped from concise
// stack traces.
const FILENAME_NODE_INTERNALS_CENSOR = /^(?:node:)?internal\//;

// Frames within SES `assert.js` should be dropped from concise stack traces, as
// these are just steps towards creating the error object in question.
const FILENAME_ASSERT_CENSOR = /\/packages\/ses\/src\/error\/assert\.js$/;

// Frames within the `eventual-send` shim should be dropped so that concise
// deep stacks omit the internals of the eventual-sending mechanism causing
// asynchronous messages to be sent.
// Note that the eventual-send package will move from agoric-sdk to
// Endo, so this rule will be of general interest.
const FILENAME_EVENTUAL_SEND_CENSOR = /\/packages\/eventual-send\/src\//;

// Frames within the `ses-ava` package should be dropped from concise stack
// traces, as they just support exposing error details to AVA.
const FILENAME_SES_AVA_CENSOR = /\/packages\/ses-ava\/src\/ses-ava-test\.js$/;

// Any stack frame whose `fileName` matches any of these censor patterns
// will be omitted from concise stacks.
// TODO Enable users to configure FILENAME_CENSORS via `lockdown` options.
const FILENAME_CENSORS = [
  FILENAME_NODE_DEPENDENTS_CENSOR,
  FILENAME_NODE_INTERNALS_CENSOR,
  FILENAME_ASSERT_CENSOR,
  FILENAME_EVENTUAL_SEND_CENSOR,
  FILENAME_SES_AVA_CENSOR,
];

// Should a stack frame with this as its fileName be included in a concise
// stack trace?
// Exported only so it can be unit tested.
// TODO Move so that it applies not just to v8.
export const filterFileName = fileName => {
  if (!fileName) {
    // Stack frames with no fileName should appear in concise stack traces.
    return true;
  }
  for (const filter of FILENAME_CENSORS) {
    if (regexpTest(filter, fileName)) {
      return false;
    }
  }
  return true;
};

// The ad-hoc rule of the current pattern is that any likely-file-path or
// likely url-path prefix, ending in a `/.../` should get dropped.
// Anything to the left of the likely path text is kept.
// Everything to the right of `/.../` is kept. Thus
// `'Object.bar (/vat-v1/.../eventual-send/test/deep-send.test.js:13:21)'`
// simplifies to
// `'Object.bar (eventual-send/test/deep-send.test.js:13:21)'`.
//
// See thread starting at
// https://github.com/Agoric/agoric-sdk/issues/2326#issuecomment-773020389
const CALLSITE_ELLIPSIS_PATTERN1 = /^((?:.*[( ])?)[:/\w_-]*\/\.\.\.\/(.+)$/;

// The ad-hoc rule of the current pattern is that any likely-file-path or
// likely url-path prefix consisting of `.../` should get dropped.
// Anything to the left of the likely path text is kept.
// Everything to the right of `.../` is kept. Thus
// `'Object.bar (.../eventual-send/test/deep-send.test.js:13:21)'`
// simplifies to
// `'Object.bar (eventual-send/test/deep-send.test.js:13:21)'`.
//
// See thread starting at
// https://github.com/Agoric/agoric-sdk/issues/2326#issuecomment-773020389
const CALLSITE_ELLIPSIS_PATTERN2 = /^((?:.*[( ])?)\.\.\.\/(.+)$/;

// The ad-hoc rule of the current pattern is that any likely-file-path or
// likely url-path prefix, ending in a `/` and prior to `package/` should get
// dropped.
// Anything to the left of the likely path prefix text is kept. `package/` and
// everything to its right is kept. Thus
// `'Object.bar (/Users/markmiller/src/ongithub/agoric/agoric-sdk/packages/eventual-send/test/deep-send.test.js:13:21)'`
// simplifies to
// `'Object.bar (packages/eventual-send/test/deep-send.test.js:13:21)'`.
// Note that `/packages/` is a convention for monorepos encouraged by
// lerna.
const CALLSITE_PACKAGES_PATTERN = /^((?:.*[( ])?)[:/\w_-]*\/(packages\/.+)$/;

// The ad-hoc rule of the current pattern is that any likely-file-path or
// likely url-path prefix of the form `file://` but not `file:///` gets
// dropped.
// Anything to the left of the likely path prefix text is kept. Everything to
// the right of `file://` is kept. Thus
// `'Object.bar (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/test/deep-send.test.js:13:21)'` is unchanged but
// `'Object.bar (file://test/deep-send.test.js:13:21)'`

// simplifies to
// `'Object.bar (test/deep-send.test.js:13:21)'`.
// The reason is that `file:///` usually precedes an absolute path which is
// clickable without removing the `file:///`, whereas `file://` usually precedes
// a relative path which, for whatever vscode reason, is not clickable until the
// `file://` is removed.
const CALLSITE_FILE_2SLASH_PATTERN = /^((?:.*[( ])?)file:\/\/([^/].*)$/;

// The use of these callSite patterns below assumes that any match will bind
// capture groups containing the parts of the original string we want
// to keep. The parts outside those capture groups will be dropped from concise
// stacks.
// TODO Enable users to configure CALLSITE_PATTERNS via `lockdown` options.
const CALLSITE_PATTERNS = [
  CALLSITE_ELLIPSIS_PATTERN1,
  CALLSITE_ELLIPSIS_PATTERN2,
  CALLSITE_PACKAGES_PATTERN,
  CALLSITE_FILE_2SLASH_PATTERN,
];

// For a stack frame that should be included in a concise stack trace, if
// `callSiteString` is the original stringified stack frame, return the
// possibly-shorter stringified stack frame that should be shown instead.
// Exported only so it can be unit tested.
// TODO Move so that it applies not just to v8.
/**
 * @param {string} callSiteString
 */
export const shortenCallSiteString = callSiteString => {
  for (const filter of CALLSITE_PATTERNS) {
    const match = regexpExec(filter, callSiteString);
    if (match) {
      return arrayJoin(arraySlice(match, 1), '');
    }
  }
  return callSiteString;
};

export const tameV8ErrorConstructor = (
  OriginalError,
  InitialError,
  errorTaming,
  stackFiltering,
) => {
  if (errorTaming === 'unsafe-debug') {
    throw TypeError(
      'internal: v8+unsafe-debug special case should already be done',
    );
  }
  // TODO: Proper CallSite types
  /** @typedef {{}} CallSite */

  const originalCaptureStackTrace = OriginalError.captureStackTrace;

  const omitFrames =
    stackFiltering === 'concise' || stackFiltering === 'omit-frames';

  const shortenPaths =
    stackFiltering === 'concise' || stackFiltering === 'shorten-paths';

  // const callSiteFilter = _callSite => true;
  const callSiteFilter = callSite => {
    if (omitFrames) {
      // eslint-disable-next-line @endo/no-polymorphic-call
      return filterFileName(callSite.getFileName());
    }
    return true;
  };

  const callSiteStringifier = callSite => {
    let callSiteString = `${callSite}`;
    if (shortenPaths) {
      callSiteString = shortenCallSiteString(callSiteString);
    }
    return `\n  at ${callSiteString}`;
  };

  const stackStringFromSST = (_error, sst) =>
    arrayJoin(
      arrayMap(arrayFilter(sst, callSiteFilter), callSiteStringifier),
      '',
    );

  /**
   * @typedef {object} StructuredStackInfo
   * @property {CallSite[]} callSites
   * @property {undefined} [stackString]
   */

  /**
   * @typedef {object} ParsedStackInfo
   * @property {undefined} [callSites]
   * @property {string} stackString
   */

  // Mapping from error instance to the stack for that instance.
  // The stack info is either the structured stack trace
  // or the generated tamed stack string
  /** @type {WeakMap<Error, ParsedStackInfo | StructuredStackInfo>} */
  const stackInfos = new WeakMap();

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods = {
    // The optional `optFn` argument is for cutting off the bottom of
    // the stack --- for capturing the stack only above the topmost
    // call to that function. Since this isn't the "real" captureStackTrace
    // but instead calls the real one, if no other cutoff is provided,
    // we cut this one off.
    captureStackTrace(error, optFn = tamedMethods.captureStackTrace) {
      if (typeof originalCaptureStackTrace === 'function') {
        // OriginalError.captureStackTrace is only on v8
        apply(originalCaptureStackTrace, OriginalError, [error, optFn]);
        return;
      }
      reflectSet(error, 'stack', '');
    },
    // Shim of proposed special power, to reside by default only
    // in the start compartment, for getting the stack traceback
    // string associated with an error.
    // See https://tc39.es/proposal-error-stacks/
    getStackString(error) {
      let stackInfo = weakmapGet(stackInfos, error);

      if (stackInfo === undefined) {
        // The following will call `prepareStackTrace()` synchronously
        // which will populate stackInfos
        // eslint-disable-next-line no-void
        void error.stack;
        stackInfo = weakmapGet(stackInfos, error);
        if (!stackInfo) {
          stackInfo = { stackString: '' };
          weakmapSet(stackInfos, error, stackInfo);
        }
      }

      // prepareStackTrace() may generate the stackString
      // if errorTaming === 'unsafe'

      if (stackInfo.stackString !== undefined) {
        return stackInfo.stackString;
      }

      const stackString = stackStringFromSST(error, stackInfo.callSites);
      weakmapSet(stackInfos, error, { stackString });

      return stackString;
    },
    prepareStackTrace(error, sst) {
      if (errorTaming === 'unsafe') {
        const stackString = stackStringFromSST(error, sst);
        weakmapSet(stackInfos, error, { stackString });
        return `${error}${stackString}`;
      } else {
        weakmapSet(stackInfos, error, { callSites: sst });
        return '';
      }
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
    if (weaksetHas(systemPrepareFnSet, inputPrepareFn)) {
      return inputPrepareFn;
    }
    // Use concise methods to obtain named functions without constructors.
    const systemMethods = {
      prepareStackTrace(error, sst) {
        weakmapSet(stackInfos, error, { callSites: sst });
        return inputPrepareFn(error, safeV8SST(sst));
      },
    };
    weaksetAdd(systemPrepareFnSet, systemMethods.prepareStackTrace);
    return systemMethods.prepareStackTrace;
  };

  // Note `stackTraceLimit` accessor already defined by
  // tame-error-constructor.js
  defineProperties(InitialError, {
    captureStackTrace: {
      value: tamedMethods.captureStackTrace,
      writable: true,
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
};

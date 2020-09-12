// @ts-check

// FIXME: We currently need to deep-link to the ESM version of the module.
// Typescript ignores the package.json exports['.'].import and so uses "main",
// which points to CJS.  That prevents Typescript from loading '@agoric/assert'
// correctly.
import { ErrorInfo } from '@agoric/assert/src/assert';
import '@agoric/assert/exported';
import './types.js';

const { defineProperty, freeze, fromEntries } = Object;

// For our internal debugging purposes, uncomment
// const originalConsole = console;

/**
 * The error info annotations are sent to the baseConsole by calling some level
 * method. The 'info' level seems best, but we keep it symbolic so we can
 * change our mind.
 */
export const BASE_CONSOLE_LEVEL = 'info';

// The whitelist of console methods:
// Organized by whatwg "living standard" at https://console.spec.whatwg.org/
// but with parameters according to Node's
// https://nodejs.org/dist/latest-v14.x/docs/api/console.html
// See MDN https://developer.mozilla.org/en-US/docs/Web/API/Console_API
// See TS https://openstapps.gitlab.io/projectmanagement/interfaces/_node_modules__types_node_globals_d_.console.html

// All console level methods have parameters (data?, ...args)
export const consoleLevelMethods = freeze([
  'debug',
  'error',
  'info',
  'log',
  'warn',
]);

export const consoleOtherMethods = freeze([
  // Logging
  // ...consoleLevels methods are considered logging methods
  'assert', // node: (value, ...message). TS: (value, message?, ...args)
  'clear', // ()

  // 'exception', MDN rare alias for error. not whatwg or node
  'table', // (tabularData, properties?)
  'trace', // (message?, ...args)

  'dir', // (item, options?)
  'dirxml', // (...data)

  // Counting
  'count', // (label?)
  'countReset', // (label?)

  // Grouping
  'group', // (...label)
  'groupCollapsed', // node,TS: (). whatwg: (...data). MDN: (label?)
  'groupEnd', // ()

  // Timing
  'time', // (label?)
  'timeLog', // (label?, ...data)
  'timeEnd', // (label?)

  // Node Inspector only methods. Also MDN,TS but not whatwg
  'profile', // (label?)
  'profileEnd', // (label?)
  'timeStamp', // (label?)

  // Symbols
  '@@toStringTag', // Chrome: "Object", Safari: "Console"
]);

export const consoleWhitelist = freeze([
  ...consoleLevelMethods,
  ...consoleOtherMethods,
]);

export const consoleOmittedProperties = freeze([
  'memory', // Chrome
  'exception', // FF, MDN
  '_ignoreErrors', // Node
  '_stderr', // Node
  '_stderrErrorHandler', // Node
  '_stdout', // Node
  '_stdoutErrorHandler', // Node
  '_times', // Node
  'context', // Chrome, Node
  'record', // Safari
  'recordEnd', // Safari
  'screenshot', // Safari
  // A variety of symbols also seen on Node
]);

/**
 * @typedef {readonly [string, ...any[]]} LogRecord
 *
 * @typedef {Object} LoggingConsoleKit
 * @property {LoggingConsole} loggingConsole
 * @property {() => readonly LogRecord[]} takeLog
 */

/**
 * A mock console that just accumulates the contents of all whitelisted calls,
 * making them available to callers of `takeLog()`. Calling `takeLog()`
 * consumes these, so later calls to `takeLog()` will only provide a log of
 * calls that have happened since then.
 *
 * A logging console also implements the custom `rememberErrorInfo` method,
 * which the `@agoric/assert` module feature tests for, so it captures and
 * reports error annotations as well. Unlike the causalConsole below, the
 * logging console does not delay reporting these annotations. It just
 * immediately adds to the log what it was asked to remember.
 *
 * @returns {LoggingConsoleKit}
 */
const makeLoggingConsoleKit = () => {
  // Not frozen!
  let logArray = [];

  const loggingConsole = fromEntries(
    consoleWhitelist.map(name => {
      // Use an arrow function so that it doesn't come with its own name in
      // its printed form. Instead, we're hoping that tooling uses only
      // the `.name` property set below.
      const method = (...args) => {
        logArray.push([name, ...args]);
      };
      defineProperty(method, 'name', { value: name });
      return [name, freeze(method)];
    }),
  );
  /** @type {RememberErrorInfo} */
  const rememberErrorInfo = (error, errorInfoKind, getLogArgs) => {
    const logArgs = getLogArgs();
    logArray.push([error, errorInfoKind, ...logArgs]);
  };
  loggingConsole.rememberErrorInfo = rememberErrorInfo;
  freeze(loggingConsole);

  const takeLog = () => {
    const result = freeze(logArray);
    logArray = [];
    return result;
  };
  freeze(takeLog);

  const typedLoggingConsole = /** @type {LoggingConsole} */ (loggingConsole);

  return freeze({ loggingConsole: typedLoggingConsole, takeLog });
};
freeze(makeLoggingConsoleKit);
export { makeLoggingConsoleKit };

const defaultGetStackString = error => {
  if (!('stack' in error)) {
    return '';
  }
  const stackString = `${error.stack}`;
  const pos = stackString.indexOf('\n');
  if (stackString.startsWith(' ') || pos === -1) {
    return stackString;
  }
  return stackString.slice(pos + 1); // exclude the initial newline
};

/**
 * Makes a causal console wrapper of a base console, where the causal wrappper
 * uses `decodeConsole` to recognize
 *
 * @param {Console} baseConsole
 * @returns {Console}
 */
const makeCausalConsole = (
  baseConsole,
  getStackString = defaultGetStackString,
) => {
  // by "tagged", we mean first sent to the baseConsole as an argument in a
  // console level method call, in which it is shown with an identifying tag
  // number. We number the errors according to the order in
  // which they were first logged to the baseConsole, starting at 1.
  let numErrorsTagged = 0;
  /** @type WeakMap<Error, number> */
  const errorTagOrder = new WeakMap();

  /**
   * @param {Error} err
   * @returns {string}
   */
  const tagError = err => {
    let errNum;
    if (errorTagOrder.has(err)) {
      errNum = errorTagOrder.get(err);
    } else {
      numErrorsTagged += 1;
      errorTagOrder.set(err, numErrorsTagged);
      errNum = numErrorsTagged;
    }
    return `${err.name}#${errNum}`;
  };

  /**
   * @typedef ErrorInfoRecord
   * @property {ErrorInfoKind} kind
   * @property {GetLogArgs} getLogArgs
   */
  /** @type {WeakMap<Error, ErrorInfoRecord[]>} */
  const errorInfos = new WeakMap();

  /**
   * @param {Error} error
   * @returns {ErrorInfoRecord[]}
   */
  const takeErrorInfos = error => {
    const result = errorInfos.get(error);
    if (result) {
      errorInfos.delete(error);
      return result;
    }
    return [];
  };

  const extractErrorArgs = (logArgs, subErrorsSink) => {
    const argTags = logArgs.map(arg => {
      if (arg instanceof Error) {
        subErrorsSink.push(arg);
        return `(${tagError(arg)})`;
      }
      return arg;
    });
    return argTags;
  };

  /**
   * @param {Error} error
   * @param {ErrorInfoKind} kind
   * @param {readonly any[]} logArgs
   */
  const logErrorInfo = (error, kind, logArgs, subErrorsSink) => {
    const errorTag = tagError(error);
    const errorName =
      kind === ErrorInfo.MESSAGE ? `${errorTag}:` : `${errorTag} ${kind}`;
    const argTags = extractErrorArgs(logArgs, subErrorsSink);
    baseConsole[BASE_CONSOLE_LEVEL](errorName, ...argTags);
  };

  /**
   * Logs the `subErrors` within a group named `label`.
   *
   * @param {string} label
   * @param {Error[]} subErrors
   * @returns {void}
   */
  const logSubErrors = (label, subErrors) => {
    if (subErrors.length >= 1) {
      console.groupCollapsed(label);
      try {
        for (const subError of subErrors) {
          // eslint-disable-next-line no-use-before-define
          logError(subError);
        }
      } finally {
        console.groupEnd();
      }
    }
  };

  const errorsLogged = new WeakSet();

  const logError = error => {
    if (errorsLogged.has(error)) {
      return;
    }
    const errorTag = tagError(error);
    errorsLogged.add(error);
    const infoRecords = takeErrorInfos(error);
    const messageRecords = [];
    const otherInfoRecords = [];
    for (const infoRecord of infoRecords) {
      if (infoRecord.kind === ErrorInfo.MESSAGE) {
        messageRecords.push(infoRecord);
      } else {
        otherInfoRecords.push(infoRecord);
      }
    }
    const subErrors = [];
    if (messageRecords.length === 0) {
      // If there are no message records, then just show the message that
      // the error itself carries.
      baseConsole[BASE_CONSOLE_LEVEL](`${errorTag}: ${error.message}`);
    } else {
      // If there are message records (typically just one), then we take
      // these to be strictly more informative than the message string
      // carried by the error, so show these *instead*.
      for (const { kind, getLogArgs } of messageRecords) {
        logErrorInfo(error, kind, getLogArgs(), subErrors);
      }
    }
    // After the message but before any other annotations, show the stack.
    let stackString = getStackString(error);
    if (
      typeof stackString === 'string' &&
      stackString.length >= 1 &&
      !stackString.endsWith('\n')
    ) {
      stackString += '\n';
    }
    baseConsole[BASE_CONSOLE_LEVEL](stackString);
    // Show the other annotations on error
    for (const { kind, getLogArgs } of otherInfoRecords) {
      logErrorInfo(error, kind, getLogArgs(), subErrors);
    }
    // explain all the errors seen in the messages already emitted.
    logSubErrors(errorTag, subErrors);
  };

  /**
   * @type {RememberErrorInfo}
   */
  const rememberErrorInfo = (error, kind, getLogArgs) => {
    if (errorsLogged.has(error)) {
      const subErrors = [];
      // Annotation arrived after the error has already been logged,
      // so just log the annotation immediately, rather than remembering it.
      logErrorInfo(error, kind, getLogArgs(), subErrors);
      logSubErrors(tagError(error), subErrors);
      return;
    }
    const infoRecord = { kind, getLogArgs };
    const ei = errorInfos.get(error);
    if (ei) {
      ei.push(infoRecord);
    } else {
      errorInfos.set(error, [infoRecord]);
    }
  };
  freeze(rememberErrorInfo);

  const levelMethods = consoleLevelMethods.map(level => {
    const levelMethod = (...logArgs) => {
      const subErrors = [];
      const argTags = extractErrorArgs(logArgs, subErrors);
      baseConsole[level](...argTags);
      logSubErrors('', subErrors);
    };
    defineProperty(levelMethod, 'name', { value: level });
    return [level, freeze(levelMethod)];
  });
  const otherMethodNames = consoleOtherMethods.filter(
    name => name in baseConsole,
  );
  const otherMethods = otherMethodNames.map(name => {
    const otherMethod = (...args) => {
      baseConsole[name](...args);
      return undefined;
    };
    defineProperty(otherMethod, 'name', { value: name });
    return [name, freeze(otherMethod)];
  });

  const causalConsole = fromEntries([...levelMethods, ...otherMethods]);
  causalConsole.rememberErrorInfo = rememberErrorInfo;
  return freeze(causalConsole);
};
freeze(makeCausalConsole);
export { makeCausalConsole };

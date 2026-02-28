// @ts-check

// To ensure that this module operates without special privilege, it should
// not reference the free variable `console` except for its own internal
// debugging purposes in the declaration of `internalDebugConsole`, which is
// normally commented out.

import {
  WeakSet,
  arrayFilter,
  arrayFlatMap,
  arrayMap,
  arrayPop,
  arrayPush,
  defineProperty,
  freeze,
  fromEntries,
  isError,
  stringEndsWith,
  stringIncludes,
  stringSplit,
  weaksetAdd,
  weaksetHas,
} from '../commons.js';

/**
 * @import {FilterConsole, LogSeverity, VirtualConsole} from './types.js'
 * @import {ErrorInfo, ErrorInfoKind, LogRecord, NoteCallback, LoggedErrorHandler, MakeCausalConsole, MakeLoggingConsoleKit} from "./internal-types.js";
 */

/**
 * Explicitly set a function's name, supporting use of arrow functions for which
 * source text doesn't include a name and no initial name is set by
 * NamedEvaluation
 * https://tc39.es/ecma262/multipage/syntax-directed-operations.html#sec-runtime-semantics-namedevaluation
 * Instead, we hope that tooling uses only the explicit `name` property.
 *
 * @template {Function} F
 * @param {string} name
 * @param {F} fn
 * @returns {F}
 */
const defineName = (name, fn) => defineProperty(fn, 'name', { value: name });

// For our internal debugging purposes, uncomment
// const internalDebugConsole = console;

// The permitted console methods, from:
// Whatwg "living standard" https://console.spec.whatwg.org/
// Node https://nodejs.org/dist/latest-v14.x/docs/api/console.html
// MDN https://developer.mozilla.org/en-US/docs/Web/API/Console_API
// TypeScript https://openstapps.gitlab.io/projectmanagement/interfaces/_node_modules__types_node_globals_d_.console.html
// Chrome https://developers.google.com/web/tools/chrome-devtools/console/api

// All console level methods have parameters (fmt?, ...args)
// where the argument sequence `fmt?, ...args` formats args according to
// fmt if fmt is a format string. Otherwise, it just renders them all as values
// separated by spaces.
// https://console.spec.whatwg.org/#formatter
// https://nodejs.org/docs/latest/api/util.html#util_util_format_format_args

// For the causal console, all occurrences of `fmt, ...args` or `...args` by
// itself must check for the presence of an error to ask the
// `loggedErrorHandler` to handle.
// In theory we should do a deep inspection to detect for example an array
// containing an error. We currently do not detect these and may never.

/** @typedef {keyof VirtualConsole | 'profile' | 'profileEnd'} ConsoleProps */

/**
 * Those console methods whose actual parameters are `(fmt?, ...args)`
 * even if their TypeScript types claim otherwise.
 *
 * Each is paired with what we consider to be their log severity level.
 * This is the same as the log severity of these on other
 * platform console implementations when they all agree.
 *
 * @type {readonly [ConsoleProps, LogSeverity | undefined][]}
 */
export const consoleLevelMethods = freeze([
  ['debug', 'debug'], // (fmt?, ...args) verbose level on Chrome
  ['log', 'log'], // (fmt?, ...args) info level on Chrome
  ['info', 'info'], // (fmt?, ...args)
  ['warn', 'warn'], // (fmt?, ...args)
  ['error', 'error'], // (fmt?, ...args)

  ['trace', 'log'], // (fmt?, ...args)
  ['dirxml', 'log'], // (fmt?, ...args)          but TS typed (...data)
  ['group', 'log'], // (fmt?, ...args)           but TS typed (...label)
  ['groupCollapsed', 'log'], // (fmt?, ...args)  but TS typed (...label)
]);

/**
 * Those console methods other than those already enumerated by
 * `consoleLevelMethods`.
 *
 * Each is paired with what we consider to be their log severity level.
 * This is the same as the log severity of these on other
 * platform console implementations when they all agree.
 *
 * @type {readonly [ConsoleProps, LogSeverity | undefined][]}
 */
export const consoleOtherMethods = freeze([
  ['assert', 'error'], // (value, fmt?, ...args)
  ['timeLog', 'log'], // (label?, ...args) no fmt string

  // Insensitive to whether any argument is an error. All arguments can pass
  // thru to baseConsole as is.
  ['clear', undefined], // ()
  ['count', 'info'], // (label?)
  ['countReset', undefined], // (label?)
  ['dir', 'log'], // (item, options?)
  ['groupEnd', 'log'], // ()
  // In theory tabular data may be or contain an error. However, we currently
  // do not detect these and may never.
  ['table', 'log'], // (tabularData, properties?)
  ['time', 'info'], // (label?)
  ['timeEnd', 'info'], // (label?)

  // Node Inspector only, MDN, and TypeScript, but not whatwg
  ['profile', undefined], // (label?)
  ['profileEnd', undefined], // (label?)
  ['timeStamp', undefined], // (label?)
]);

/** @type {readonly [ConsoleProps, LogSeverity | undefined][]} */
const consoleMethodPermits = freeze([
  ...consoleLevelMethods,
  ...consoleOtherMethods,
]);

/**
 * consoleOmittedProperties is currently unused. I record and maintain it here
 * with the intention that it be treated like the `false` entries in the main
 * SES permits: that seeing these on the original console is expected, but
 * seeing anything else that's outside the permits is surprising and should
 * provide a diagnostic.
 *
 * const consoleOmittedProperties = freeze([
 *   'memory', // Chrome
 *   'exception', // FF, MDN
 *   '_ignoreErrors', // Node
 *   '_stderr', // Node
 *   '_stderrErrorHandler', // Node
 *   '_stdout', // Node
 *   '_stdoutErrorHandler', // Node
 *   '_times', // Node
 *   'context', // Chrome, Node
 *   'record', // Safari
 *   'recordEnd', // Safari
 *
 *   'screenshot', // Safari
 *   // Symbols
 *   '@@toStringTag', // Chrome: "Object", Safari: "Console"
 *   // A variety of other symbols also seen on Node
 * ]);
 */

// //////////////////////////// Logging Console ////////////////////////////////

/** @type {MakeLoggingConsoleKit} */
export const makeLoggingConsoleKit = (
  loggedErrorHandler,
  { shouldResetForDebugging = false } = {},
) => {
  if (shouldResetForDebugging) {
    // eslint-disable-next-line @endo/no-polymorphic-call
    loggedErrorHandler.resetErrorTagNum();
  }

  // Not frozen!
  let logArray = [];

  const loggingConsole = fromEntries(
    arrayMap(consoleMethodPermits, ([name, _]) => {
      /**
       * @param {...any} args
       */
      const method = defineName(name, (...args) => {
        arrayPush(logArray, [name, ...args]);
      });
      return [name, freeze(method)];
    }),
  );
  freeze(loggingConsole);

  const takeLog = () => {
    const result = freeze(logArray);
    logArray = [];
    return result;
  };
  freeze(takeLog);

  const typedLoggingConsole = /** @type {VirtualConsole} */ (loggingConsole);

  return freeze({ loggingConsole: typedLoggingConsole, takeLog });
};
freeze(makeLoggingConsoleKit);

/**
 * Makes the same calls on a `baseConsole` that were made on a
 * `loggingConsole` to produce this `log`. In this way, a logging console
 * can be used as a buffer to delay the application of these calls to a
 * `baseConsole`.
 *
 * @param {LogRecord[]} log
 * @param {VirtualConsole} baseConsole
 */
export const pumpLogToConsole = (log, baseConsole) => {
  for (const [name, ...args] of log) {
    // eslint-disable-next-line @endo/no-polymorphic-call
    baseConsole[name](...args);
  }
};
// //////////////////////////// Causal Console /////////////////////////////////

/** @type {ErrorInfo} */
const ErrorInfo = {
  NOTE: 'ERROR_NOTE:',
  MESSAGE: 'ERROR_MESSAGE:',
  CAUSE: 'cause:',
  ERRORS: 'errors:',
};
freeze(ErrorInfo);

/** @type {MakeCausalConsole} */
export const makeCausalConsole = (baseConsole, loggedErrorHandler) => {
  if (!baseConsole) {
    return undefined;
  }

  const { getStackString, tagError, takeMessageLogArgs, takeNoteLogArgsArray } =
    loggedErrorHandler;

  /**
   * @param {ReadonlyArray<any>} logArgs
   * @param {Array<any>} subErrorsSink
   * @returns {any}
   */
  const extractErrorArgs = (logArgs, subErrorsSink) => {
    const argTags = arrayMap(logArgs, arg => {
      if (isError(arg)) {
        arrayPush(subErrorsSink, arg);
        return `(${tagError(arg)})`;
      }
      return arg;
    });
    return argTags;
  };

  /**
   * @param {LogSeverity} severity
   * @param {Error} error
   * @param {ErrorInfoKind} kind
   * @param {readonly any[]} logArgs
   * @param {Array<Error>} subErrorsSink
   */
  const logErrorInfo = (severity, error, kind, logArgs, subErrorsSink) => {
    const errorTag = tagError(error);
    const errorName =
      kind === ErrorInfo.MESSAGE ? `${errorTag}:` : `${errorTag} ${kind}`;
    const argTags = extractErrorArgs(logArgs, subErrorsSink);
    // eslint-disable-next-line @endo/no-polymorphic-call
    baseConsole[severity](errorName, ...argTags);
  };

  /**
   * Logs the `subErrors` within a group name mentioning `optTag`.
   *
   * @param {LogSeverity} severity
   * @param {Error[]} subErrors
   * @param {string | undefined} optTag
   * @returns {void}
   */
  const logSubErrors = (severity, subErrors, optTag = undefined) => {
    if (subErrors.length === 0) {
      return;
    }
    if (subErrors.length === 1 && optTag === undefined) {
      // eslint-disable-next-line no-use-before-define
      logError(severity, subErrors[0]);
      return;
    }
    let label;
    if (subErrors.length === 1) {
      label = `Nested error`;
    } else {
      label = `Nested ${subErrors.length} errors`;
    }
    if (optTag !== undefined) {
      label = `${label} under ${optTag}`;
    }
    // eslint-disable-next-line @endo/no-polymorphic-call
    baseConsole.group(label);
    try {
      for (const subError of subErrors) {
        // eslint-disable-next-line no-use-before-define
        logError(severity, subError);
      }
    } finally {
      if (baseConsole.groupEnd) {
        // eslint-disable-next-line @endo/no-polymorphic-call
        baseConsole.groupEnd();
      }
    }
  };

  const errorsLogged = new WeakSet();

  /** @type {(severity: LogSeverity) => NoteCallback} */
  const makeNoteCallback = severity => (error, noteLogArgs) => {
    const subErrors = [];
    // Annotation arrived after the error has already been logged,
    // so just log the annotation immediately, rather than remembering it.
    logErrorInfo(severity, error, ErrorInfo.NOTE, noteLogArgs, subErrors);
    logSubErrors(severity, subErrors, tagError(error));
  };

  /**
   * @param {LogSeverity} severity
   * @param {Error} error
   */
  const logError = (severity, error) => {
    if (weaksetHas(errorsLogged, error)) {
      return;
    }
    const errorTag = tagError(error);
    weaksetAdd(errorsLogged, error);
    const subErrors = [];
    const messageLogArgs = takeMessageLogArgs(error);
    const noteLogArgsArray = takeNoteLogArgsArray(
      error,
      makeNoteCallback(severity),
    );
    // Show the error's most informative error message
    if (messageLogArgs === undefined) {
      // If there is no message log args, then just show the message that
      // the error itself carries.
      // eslint-disable-next-line @endo/no-polymorphic-call
      baseConsole[severity](`${errorTag}:`, error.message);
    } else {
      // If there is one, we take it to be strictly more informative than the
      // message string carried by the error, so show it *instead*.
      logErrorInfo(
        severity,
        error,
        ErrorInfo.MESSAGE,
        messageLogArgs,
        subErrors,
      );
    }
    // After the message but before any other annotations, show the stack.
    let stackString = getStackString(error);
    if (
      typeof stackString === 'string' &&
      stackString.length >= 1 &&
      !stringEndsWith(stackString, '\n')
    ) {
      stackString += '\n';
    }
    // eslint-disable-next-line @endo/no-polymorphic-call
    baseConsole[severity](stackString);
    // Show the other annotations on error
    if (error.cause) {
      logErrorInfo(severity, error, ErrorInfo.CAUSE, [error.cause], subErrors);
    }
    // @ts-expect-error AggregateError has an `errors` property.
    if (error.errors) {
      // @ts-expect-error AggregateError has an `errors` property.
      logErrorInfo(severity, error, ErrorInfo.ERRORS, error.errors, subErrors);
    }
    for (const noteLogArgs of noteLogArgsArray) {
      logErrorInfo(severity, error, ErrorInfo.NOTE, noteLogArgs, subErrors);
    }
    // explain all the errors seen in the messages already emitted.
    logSubErrors(severity, subErrors, errorTag);
  };

  const levelMethods = arrayMap(consoleLevelMethods, ([level, _]) => {
    /**
     * @param {...any} logArgs
     */
    const levelMethod = defineName(level, (...logArgs) => {
      const subErrors = [];
      const argTags = extractErrorArgs(logArgs, subErrors);
      if (baseConsole[level]) {
        // eslint-disable-next-line @endo/no-polymorphic-call
        baseConsole[level](...argTags);
      }
      // @ts-expect-error ConsoleProp vs LogSeverity mismatch
      logSubErrors(level, subErrors);
    });
    return [level, freeze(levelMethod)];
  });
  const otherMethodNames = arrayFilter(
    consoleOtherMethods,
    ([name, _]) => name in baseConsole,
  );
  const otherMethods = arrayMap(otherMethodNames, ([name, _]) => {
    /**
     * @param {...any} args
     */
    const otherMethod = defineName(name, (...args) => {
      // @ts-ignore
      // eslint-disable-next-line @endo/no-polymorphic-call
      baseConsole[name](...args);
      return undefined;
    });
    return [name, freeze(otherMethod)];
  });

  const causalConsole = fromEntries([...levelMethods, ...otherMethods]);
  return /** @type {VirtualConsole} */ (freeze(causalConsole));
};
freeze(makeCausalConsole);

/**
 * @typedef {(...args: unknown[]) => void} Logger
 */

/**
 * This is a rather horrible kludge to indent the output to a logger in
 * the case where some arguments are strings containing newlines. Part of
 * the problem is that console-like loggers, including the one in ava,
 * join the string arguments of the log message with a space.
 * Because of this, there's an extra space at the beginning of each of
 * the split lines. So this kludge compensated by putting an extra empty
 * string at the beginning, so that the logger will add the same extra
 * joiner.
 * TODO: Fix this horrible kludge, and indent in a sane manner.
 *
 * @param {string} str
 * @param {string} sep
 * @param {string[]} indents
 * @returns {string[]}
 */
const indentAfterAllSeps = (str, sep, indents) => {
  const [firstLine, ...restLines] = stringSplit(str, sep);
  const indentedRest = arrayFlatMap(restLines, line => [sep, ...indents, line]);
  return ['', firstLine, ...indentedRest];
};

/**
 * @param {LoggedErrorHandler} loggedErrorHandler
 */
export const defineCausalConsoleFromLogger = loggedErrorHandler => {
  /**
   * Implement the `VirtualConsole` API badly by turning all calls into
   * calls on `tlogger`. We need to do this to have `console` logging
   * turn into calls to Ava's `t.log`, so these console log messages
   * are output in the right place.
   *
   * @param {Logger} tlogger
   * @returns {VirtualConsole}
   */
  const makeCausalConsoleFromLogger = tlogger => {
    const indents = [];
    const logWithIndent = (...args) => {
      if (indents.length > 0) {
        args = arrayFlatMap(args, arg =>
          typeof arg === 'string' && stringIncludes(arg, '\n')
            ? indentAfterAllSeps(arg, '\n', indents)
            : [arg],
        );
        args = [...indents, ...args];
      }
      return tlogger(...args);
    };

    const baseConsole = fromEntries([
      ...arrayMap(consoleLevelMethods, ([name]) => [
        name,
        defineName(name, (...args) => logWithIndent(...args)),
      ]),
      ...arrayMap(consoleOtherMethods, ([name]) => [
        name,
        defineName(name, (...args) => logWithIndent(name, ...args)),
      ]),
    ]);
    // https://console.spec.whatwg.org/#grouping
    for (const name of ['group', 'groupCollapsed']) {
      if (baseConsole[name]) {
        baseConsole[name] = defineName(name, (...args) => {
          if (args.length >= 1) {
            // Prefix the logged data with "group" or "groupCollapsed".
            logWithIndent(...args);
          }
          // A single space is enough;
          // the host console will separate them with additional spaces.
          arrayPush(indents, ' ');
        });
      } else {
        baseConsole[name] = defineName(name, () => {});
      }
    }
    baseConsole.groupEnd = defineName(
      'groupEnd',
      baseConsole.groupEnd
        ? (...args) => {
            arrayPop(indents);
          }
        : () => {},
    );
    harden(baseConsole);
    const causalConsole = makeCausalConsole(
      /** @type {VirtualConsole} */ (baseConsole),
      loggedErrorHandler,
    );
    return /** @type {VirtualConsole} */ (causalConsole);
  };
  return freeze(makeCausalConsoleFromLogger);
};
freeze(defineCausalConsoleFromLogger);

// ///////////////////////// Filter Console ////////////////////////////////////

/** @type {FilterConsole} */
export const filterConsole = (baseConsole, filter, _topic = undefined) => {
  // TODO do something with optional topic string
  const methodPermits = arrayFilter(
    consoleMethodPermits,
    ([name, _]) => name in baseConsole,
  );
  const methods = arrayMap(methodPermits, ([name, severity]) => {
    /**
     * @param {...any} args
     */
    const method = defineName(name, (...args) => {
      // eslint-disable-next-line @endo/no-polymorphic-call
      if (severity === undefined || filter.canLog(severity)) {
        // @ts-ignore
        // eslint-disable-next-line @endo/no-polymorphic-call
        baseConsole[name](...args);
      }
    });
    return [name, freeze(method)];
  });
  const filteringConsole = fromEntries(methods);
  return /** @type {VirtualConsole} */ (freeze(filteringConsole));
};
freeze(filterConsole);

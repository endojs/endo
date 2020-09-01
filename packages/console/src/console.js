// @ts-check

// TODO How do I import assert/src/types.js ?
// See TODO at top of assert/src/main.js
import { getCauseRecord } from '@agoric/assert';

// @ts-ignore fromEntries missing from Object type
const { defineProperty, freeze, fromEntries } = Object;

// For our internal debugging purposes
// const originalConsole = console;

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
 * @returns {LoggingConsoleKit}
 */
const makeLoggingConsoleKit = () => {
  // Not frozen!
  const logArray = [];

  const loggingConsole = freeze(
    fromEntries(
      consoleWhitelist.map(name => {
        // Use an arrow function so that it doesn't come with its own name in
        // its printed form. Instead, we're hoping that tooling uses only
        // the `.name` property set below.
        const f = (...args) => {
          logArray.push([name, ...args]);
          return undefined;
        };
        defineProperty(f, 'name', { value: name });
        return [name, freeze(f)];
      }),
    ),
  );

  const takeLog = freeze(() => {
    const result = freeze([...logArray]);
    logArray.length = 0;
    return result;
  });

  return freeze({ loggingConsole, takeLog });
};
freeze(makeLoggingConsoleKit);
export { makeLoggingConsoleKit };

/**
 * @param {Console} baseConsole
 * @returns {Console}
 */
const makeCausalConsole = (baseConsole, optGetStackString = undefined) => {
  /** @type WeakMap<Error, CauseRecord[]> */
  const errorCauses = new WeakMap();
  /**
   * @param {CauseRecord} causeRecord
   */
  const rememberCause = causeRecord => {
    const { error } = causeRecord;
    if (errorCauses.has(error)) {
      errorCauses.get(error).push(causeRecord);
    } else {
      errorCauses.set(error, [causeRecord]);
    }
  };

  // by "printed", we mean first sent to the baseConsole as an argument in a
  // console level
  // method call. We number the errors according to the order in which they
  // were first printed, starting at 1.
  let numErrorsPrinted = 0;
  /** @type WeakMap<Error, number> */
  const errorPrintOrder = new WeakMap();

  /**
   * @param {Error} err
   * @returns {number}
   */
  const errorPrinted = err => {
    if (errorPrintOrder.has(err)) {
      return errorPrintOrder.get(err);
    }
    numErrorsPrinted += 1;
    errorPrintOrder.set(err, numErrorsPrinted);
    return numErrorsPrinted;
  };

  /**
   * @param {Error} err
   * @returns {string}
   */
  const errorRef = err => {
    const errNum = errorPrinted(err);
    return `${err.name}#${errNum}`;
  };

  const levelMethods = consoleLevelMethods.map(level => {
    const levelMethod = (...outerArgs) => {
      const logRecord = freeze({ level, outerArgs });
      const causeRecord = getCauseRecord(logRecord);
      if (causeRecord) {
        rememberCause(causeRecord);
      } else {
        const errors = [];
        const newOuterArgs = outerArgs.map(arg => {
          if (arg instanceof Error) {
            errors.push(arg);
            return `(${errorRef(arg)}: ${arg.message})`;
          }
          return arg;
        });
        baseConsole[level](...newOuterArgs);

        for (const err of errors) {
          const arg = optGetStackString ? optGetStackString(err) : err;
          baseConsole[level](`(${errorRef(err)}) ERR:`, arg);
          if (errorCauses.has(err)) {
            const errCauseRecords = errorCauses.get(err);
            errorCauses.delete(err); // prevent cyclic causation
            for (const { level: causingLevel, cause } of errCauseRecords) {
              const label = `(${errorRef(err)}) CAUSE:`;
              // eslint-disable-next-line no-use-before-define
              causalConsole[causingLevel](label, ...cause);
            }
          }
        }
      }
      return undefined;
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
  return freeze(causalConsole);
};
freeze(makeCausalConsole);
export { makeCausalConsole };

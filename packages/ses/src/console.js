import { globalThis, TypeError } from './commons.js';

/**
 * @import {InternalConsole, ExternalConsole} from './console-types.js'
 */

/**
 * Creates a suitable console for internal errors and warnings out of the
 * Node.js console.error to ensure all messages to go stderr, including the
 * group label.
 * Accounts for the extra space introduced by console.error as a delimiter
 * between the indent and subsequent arguments.
 *
 * @param {(...message: Array<any>) => void} log logs to stderr
 */
const adaptConsole = log => {
  let indent = false;
  /** @param {Array<any>} args */
  const indentLog = (...args) => {
    if (indent) {
      log(' ', ...args);
    } else {
      log(...args);
    }
  };
  return /** @type {ExternalConsole} */ ({
    warn(...args) {
      indentLog(...args);
    },
    error(...args) {
      indentLog(...args);
    },
    groupCollapsed(...args) {
      indentLog(...args);
      indent = true;
    },
    groupEnd() {
      indent = false;
    },
  });
};

const mute = () => {};

/**
 * @param {"platform" | "console" | "none"} reporting
 */
export const adaptExternalConsole = reporting => {
  if (reporting === 'none') {
    return adaptConsole(mute);
  }
  if (reporting !== 'platform' && reporting !== 'console') {
    throw new TypeError(`Invalid lockdown reporting option: ${reporting}`);
  }
  if (
    reporting === 'console' ||
    globalThis.window === globalThis ||
    globalThis.importScripts !== undefined
  ) {
    return console;
  }
  if (globalThis.console !== undefined) {
    // On Node.js, we send all feedback to stderr, regardless of purported level.
    return adaptConsole(globalThis.console.error);
  }
  if (globalThis.print !== undefined) {
    return adaptConsole(globalThis.print);
  }
  return adaptConsole(mute);
};

/**
 * @param {string} groupLabel
 * @param {ExternalConsole} console
 * @param {(internalConsole: InternalConsole) => void} callback
 */
export const inConsoleGroup = (groupLabel, console, callback) => {
  const { warn, error, groupCollapsed, groupEnd } = console;
  let groupStarted = false;
  try {
    return callback({
      warn(...args) {
        if (!groupStarted) {
          groupCollapsed(groupLabel);
          groupStarted = true;
        }
        warn(...args);
      },
      error(...args) {
        if (!groupStarted) {
          groupCollapsed(groupLabel);
          groupStarted = true;
        }
        error(...args);
      },
    });
  } finally {
    if (groupStarted) {
      groupEnd();
    }
  }
};

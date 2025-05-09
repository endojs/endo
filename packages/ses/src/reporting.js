import { functionBind, globalThis } from './commons.js';
import { assert } from './error/assert.js';

/**
 * @import {Reporter, GroupReporter} from './reporting-types.js'
 */

/**
 * Creates a suitable reporter for internal errors and warnings out of the
 * Node.js console.error to ensure all messages to go stderr, including the
 * group label.
 * Accounts for the extra space introduced by console.error as a delimiter
 * between the indent and subsequent arguments.
 *
 * @param {(...message: Array<any>) => void} print
 */
const makeReportPrinter = print => {
  let indent = false;
  /** @param {Array<any>} args */
  const printIndent = (...args) => {
    if (indent) {
      print(' ', ...args);
    } else {
      print(...args);
    }
  };
  return /** @type {GroupReporter} */ ({
    warn(...args) {
      printIndent(...args);
    },
    error(...args) {
      printIndent(...args);
    },
    groupCollapsed(...args) {
      assert(!indent);
      print(...args);
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
export const chooseReporter = reporting => {
  if (reporting === 'none') {
    return makeReportPrinter(mute);
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
    const console = globalThis.console;
    const error = functionBind(console.error, console);
    return makeReportPrinter(error);
  }
  if (globalThis.print !== undefined) {
    return makeReportPrinter(globalThis.print);
  }
  return makeReportPrinter(mute);
};

/**
 * @param {string} groupLabel
 * @param {GroupReporter} console
 * @param {(internalConsole: Reporter) => void} callback
 */
export const reportInGroup = (groupLabel, console, callback) => {
  const { warn, error, groupCollapsed, groupEnd } = console;
  const grouping = groupCollapsed && groupEnd;
  let groupStarted = false;
  try {
    return callback({
      warn(...args) {
        if (grouping && !groupStarted) {
          groupCollapsed(groupLabel);
          groupStarted = true;
        }
        warn(...args);
      },
      error(...args) {
        if (grouping && !groupStarted) {
          groupCollapsed(groupLabel);
          groupStarted = true;
        }
        error(...args);
      },
    });
  } finally {
    if (grouping && groupStarted) {
      groupEnd();
      groupStarted = false;
    }
  }
};

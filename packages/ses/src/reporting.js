/* eslint-disable @endo/no-polymorphic-call */
// import { functionBind, globalThis } from './commons.js';
import { globalThis } from './commons.js';
import { assert } from './error/assert.js';

/**
 * @import {Reporter, GroupReporter} from './reporting-types.js'
 */

/**
 * As a workaround of https://github.com/endojs/endo/issues/2908,
 * the `consoleReporter` uses the current `console` rather
 * than the original one.
 *
 * @type {GroupReporter}
 */
const consoleReporter = {
  warn(...args) {
    globalThis.console.warn(...args);
  },
  error(...args) {
    globalThis.console.error(...args);
  },
  ...(globalThis.console?.groupCollapsed
    ? {
        groupCollapsed(...args) {
          globalThis.console.groupCollapsed(...args);
        },
      }
    : undefined),
  ...(globalThis.console?.groupEnd
    ? {
        groupEnd() {
          globalThis.console.groupEnd();
        },
      }
    : undefined),
};

/**
 * Creates a suitable reporter for internal errors and warnings out of the
 * Node.js console.error to ensure all messages go to stderr, including the
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
  if (globalThis.console !== undefined) {
    if (reporting === 'console') {
      return consoleReporter;
    }
    assert(reporting === 'platform');
    // On Node.js, we send all feedback to stderr, regardless of purported level.
    return makeReportPrinter(consoleReporter.error);
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

// @ts-check

import { TypeError, globalThis } from '../commons.js';
import { loggedErrorHandler as defaultHandler } from './assert.js';
import { makeCausalConsole } from './console.js';
import { makeRejectionHandlers } from './unhandled-rejection.js';
import './types.js';
import './internal-types.js';

// eslint-disable-next-line no-restricted-globals
const originalConsole = console;

/**
 * Wrap console unless suppressed.
 * At the moment, the console is considered a host power in the start
 * compartment, and not a primordial. Hence it is absent from the whilelist
 * and bypasses the intrinsicsCollector.
 *
 * @param {"safe" | "unsafe"} consoleTaming
 * @param {"platform" | "exit" | "abort" | "report" | "none"} [errorTrapping]
 * @param {"report" | "none"} [unhandledRejectionTrapping]
 * @param {GetStackString=} optGetStackString
 */
export const tameConsole = (
  consoleTaming = 'safe',
  errorTrapping = 'platform',
  unhandledRejectionTrapping = 'report',
  optGetStackString = undefined,
) => {
  if (consoleTaming !== 'safe' && consoleTaming !== 'unsafe') {
    throw new TypeError(`unrecognized consoleTaming ${consoleTaming}`);
  }

  let loggedErrorHandler;
  if (optGetStackString === undefined) {
    loggedErrorHandler = defaultHandler;
  } else {
    loggedErrorHandler = {
      ...defaultHandler,
      getStackString: optGetStackString,
    };
  }
  const ourConsole =
    consoleTaming === 'unsafe'
      ? originalConsole
      : makeCausalConsole(originalConsole, loggedErrorHandler);

  // Attach platform-specific error traps such that any error that gets thrown
  // at top-of-turn (the bottom of stack) will get logged by our causal
  // console, revealing the diagnostic information associated with the error,
  // including the stack from when the error was created.

  // In the following Node.js and web browser cases, `process` and `window` are
  // spelled as `globalThis` properties to avoid the overweaning gaze of
  // Parcel, which dutifully installs an unnecessary `process` shim if we ever
  // utter that. That unnecessary shim forces the whole bundle into sloppy mode,
  // which in turn breaks SES's strict mode invariant.

  // Disable the polymorphic check for the rest of this file.  It's too noisy
  // when dealing with platform APIs.
  /* eslint-disable @endo/no-polymorphic-call */

  // Node.js
  if (errorTrapping !== 'none' && globalThis.process !== undefined) {
    globalThis.process.on('uncaughtException', error => {
      // causalConsole is born frozen so not vulnerable to method tampering.
      ourConsole.error(error);
      if (errorTrapping === 'platform' || errorTrapping === 'exit') {
        globalThis.process.exit(globalThis.process.exitCode || -1);
      } else if (errorTrapping === 'abort') {
        globalThis.process.abort();
      }
    });
  }

  if (
    unhandledRejectionTrapping !== 'none' &&
    globalThis.process !== undefined
  ) {
    const handleRejection = reason => {
      // 'platform' and 'report' just log the reason.
      ourConsole.error('SES_UNHANDLED_REJECTION:', reason);
    };
    // Maybe track unhandled promise rejections.
    const h = makeRejectionHandlers(handleRejection);
    if (h) {
      // Rejection handlers are supported.
      globalThis.process.on('unhandledRejection', h.unhandledRejectionHandler);
      globalThis.process.on('rejectionHandled', h.rejectionHandledHandler);
      globalThis.process.on('exit', h.processTerminationHandler);
    }
  }

  // Browser
  if (
    errorTrapping !== 'none' &&
    globalThis.window !== undefined &&
    globalThis.window.addEventListener !== undefined
  ) {
    globalThis.window.addEventListener('error', event => {
      event.preventDefault();
      // 'platform' and 'report' just log the reason.
      ourConsole.error(event.error);
      if (errorTrapping === 'exit' || errorTrapping === 'abort') {
        globalThis.window.location.href = `about:blank`;
      }
    });
  }

  if (
    unhandledRejectionTrapping !== 'none' &&
    globalThis.window !== undefined &&
    globalThis.window.addEventListener !== undefined
  ) {
    const handleRejection = reason => {
      ourConsole.error('SES_UNHANDLED_REJECTION:', reason);
    };

    const h = makeRejectionHandlers(handleRejection);
    if (h) {
      // Rejection handlers are supported.
      globalThis.window.addEventListener('unhandledrejection', event => {
        event.preventDefault();
        h.unhandledRejectionHandler(event.reason, event.promise);
      });

      globalThis.window.addEventListener('rejectionhandled', event => {
        event.preventDefault();
        h.rejectionHandledHandler(event.promise);
      });

      globalThis.window.addEventListener('beforeunload', _event => {
        h.processTerminationHandler();
      });
    }
  }
  /* eslint-enable @endo/no-polymorphic-call */

  return { console: ourConsole };
};

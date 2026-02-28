// @ts-check

import {
  // Using TypeError minimizes risk of exposing the feral Error constructor
  TypeError,
  apply,
  defineProperty,
  freeze,
  globalThis,
} from '../commons.js';
import { loggedErrorHandler as defaultHandler } from './assert.js';
import { makeCausalConsole } from './console.js';
import { makeRejectionHandlers } from './unhandled-rejection.js';

/**
 * @import {VirtualConsole} from './types.js'
 * @import {GetStackString} from './internal-types.js';
 */

const failFast = message => {
  throw TypeError(message);
};

const wrapLogger = (logger, thisArg) =>
  freeze((...args) => apply(logger, thisArg, args));

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
  let loggedErrorHandler;
  if (optGetStackString === undefined) {
    loggedErrorHandler = defaultHandler;
  } else {
    loggedErrorHandler = {
      ...defaultHandler,
      getStackString: optGetStackString,
    };
  }

  // eslint-disable-next-line no-restricted-globals
  const originalConsole = /** @type {VirtualConsole} */ (
    // eslint-disable-next-line no-nested-ternary
    typeof globalThis.console !== 'undefined'
      ? globalThis.console
      : typeof globalThis.print === 'function'
        ? // Make a good-enough console for eshost (including only functions that
          // log at a specific level with no special argument interpretation).
          // https://console.spec.whatwg.org/#logging
          (p => freeze({ debug: p, log: p, info: p, warn: p, error: p }))(
            // eslint-disable-next-line no-undef
            wrapLogger(globalThis.print),
          )
        : undefined
  );

  // Upgrade a log-only console (as in `eshost -h SpiderMonkey`).
  if (originalConsole && originalConsole.log) {
    for (const methodName of ['warn', 'error']) {
      if (!originalConsole[methodName]) {
        defineProperty(originalConsole, methodName, {
          value: wrapLogger(originalConsole.log, originalConsole),
        });
      }
    }
  }

  const ourConsole = /** @type {VirtualConsole} */ (
    consoleTaming === 'unsafe'
      ? originalConsole
      : makeCausalConsole(originalConsole, loggedErrorHandler)
  );

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
  const globalProcess = globalThis.process || undefined;
  if (
    errorTrapping !== 'none' &&
    typeof globalProcess === 'object' &&
    typeof globalProcess.on === 'function'
  ) {
    let terminate;
    if (errorTrapping === 'platform' || errorTrapping === 'exit') {
      const { exit } = globalProcess;
      // If there is a function-valued process.on but no function-valued process.exit,
      // fail early without caring whether errorTrapping is "platform" only by default.
      typeof exit === 'function' || failFast('missing process.exit');
      terminate = () => exit(globalProcess.exitCode || -1);
    } else if (errorTrapping === 'abort') {
      terminate = globalProcess.abort;
      typeof terminate === 'function' || failFast('missing process.abort');
    }

    globalProcess.on('uncaughtException', error => {
      // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_UNCAUGHT_EXCEPTION.md
      ourConsole.error('SES_UNCAUGHT_EXCEPTION:', error);
      if (terminate) {
        terminate();
      }
    });
  }
  if (
    unhandledRejectionTrapping !== 'none' &&
    typeof globalProcess === 'object' &&
    typeof globalProcess.on === 'function'
  ) {
    const handleRejection = reason => {
      // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_UNHANDLED_REJECTION.md
      ourConsole.error('SES_UNHANDLED_REJECTION:', reason);
      // 'platform' and 'report' just log the reason.
    };
    // Maybe track unhandled promise rejections.
    const h = makeRejectionHandlers(handleRejection);
    if (h) {
      // Rejection handlers are supported.
      globalProcess.on('unhandledRejection', h.unhandledRejectionHandler);
      globalProcess.on('rejectionHandled', h.rejectionHandledHandler);
      globalProcess.on('exit', h.processTerminationHandler);
    }
  }

  // Browser
  const globalWindow = globalThis.window || undefined;
  if (
    errorTrapping !== 'none' &&
    typeof globalWindow === 'object' &&
    typeof globalWindow.addEventListener === 'function'
  ) {
    globalWindow.addEventListener('error', event => {
      event.preventDefault();
      // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_UNCAUGHT_EXCEPTION.md
      ourConsole.error('SES_UNCAUGHT_EXCEPTION:', event.error);
      // 'platform' and 'report' just log the reason.
      if (errorTrapping === 'exit' || errorTrapping === 'abort') {
        globalWindow.location.href = `about:blank`;
      }
    });
  }
  if (
    unhandledRejectionTrapping !== 'none' &&
    typeof globalWindow === 'object' &&
    typeof globalWindow.addEventListener === 'function'
  ) {
    const handleRejection = reason => {
      // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_UNHANDLED_REJECTION.md
      ourConsole.error('SES_UNHANDLED_REJECTION:', reason);
    };

    const h = makeRejectionHandlers(handleRejection);
    if (h) {
      // Rejection handlers are supported.
      globalWindow.addEventListener('unhandledrejection', event => {
        event.preventDefault();
        h.unhandledRejectionHandler(event.reason, event.promise);
      });

      globalWindow.addEventListener('rejectionhandled', event => {
        event.preventDefault();
        h.rejectionHandledHandler(event.promise);
      });

      globalWindow.addEventListener('beforeunload', _event => {
        h.processTerminationHandler();
      });
    }
  }
  /* eslint-enable @endo/no-polymorphic-call */

  return { console: ourConsole };
};

// @ts-check

import { Error, globalThis } from '../commons.js';
import { loggedErrorHandler as defaultHandler } from './assert.js';
import { makeCausalConsole } from './console.js';
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
 * @param {GetStackString=} optGetStackString
 */
export const tameConsole = (
  consoleTaming = 'safe',
  errorTrapping = 'platform',
  optGetStackString = undefined,
) => {
  if (consoleTaming !== 'safe' && consoleTaming !== 'unsafe') {
    throw new Error(`unrecognized consoleTaming ${consoleTaming}`);
  }

  if (consoleTaming === 'unsafe') {
    return { console: originalConsole };
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
  const causalConsole = makeCausalConsole(originalConsole, loggedErrorHandler);

  // Attach platform-specific error traps such that any error that gets thrown
  // at top-of-turn (the bottom of stack) will get logged by our causal
  // console, revealing the diagnostic information associated with the error,
  // including the stack from when the error was created.

  // In the following Node.js and web browser cases, `process` and `window` are
  // spelled as `globalThis` properties to avoid the overweaning gaze of
  // Parcel, which dutifully installs an unnecessary `process` shim if we ever
  // utter that. That unnecessary shim forces the whole bundle into sloppy mode,
  // which in turn breaks SES's strict mode invariant.

  // Node.js
  if (errorTrapping !== 'none' && globalThis.process !== undefined) {
    // eslint-disable-next-line @endo/no-polymorphic-call
    globalThis.process.on('uncaughtException', error => {
      // causalConsole is born frozen so not vulnerable to method tampering.
      // eslint-disable-next-line @endo/no-polymorphic-call
      causalConsole.error(error);
      if (errorTrapping === 'platform' || errorTrapping === 'exit') {
        // eslint-disable-next-line @endo/no-polymorphic-call
        globalThis.process.exit(globalThis.process.exitCode || -1);
      } else if (errorTrapping === 'abort') {
        // eslint-disable-next-line @endo/no-polymorphic-call
        globalThis.process.abort();
      }
    });
  }

  // Browser
  if (errorTrapping !== 'none' && globalThis.window !== undefined) {
    // eslint-disable-next-line @endo/no-polymorphic-call
    globalThis.window.addEventListener('error', event => {
      // eslint-disable-next-line @endo/no-polymorphic-call
      event.preventDefault();
      // eslint-disable-next-line @endo/no-polymorphic-call
      const stackString = loggedErrorHandler.getStackString(event.error);
      // eslint-disable-next-line @endo/no-polymorphic-call
      causalConsole.error(stackString);
      if (errorTrapping === 'exit' || errorTrapping === 'abort') {
        globalThis.window.location.href = `about:blank`;
      }
    });
  }

  return { console: causalConsole };
};

// @ts-check

import { loggedErrorHandler as defaultHandler } from './assert.js';
import { makeCausalConsole } from './console.js';
import './types.js';
import './internal-types.js';

const originalConsole = console;

/**
 * Wrap console unless suppressed.
 * At the moment, the console is considered a host power in the start
 * compartment, and not a primordial. Hence it is absent from the whilelist
 * and bypasses the intrinsicsCollector.
 *
 * @param {"safe" | "unsafe"} consoleTaming
 * @param {GetStackString=} optGetStackString
 */
export const tameConsole = (
  consoleTaming = 'safe',
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
  return { console: causalConsole };
};

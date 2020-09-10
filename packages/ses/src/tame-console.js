import { makeCausalConsole } from '@agoric/console';

const originalConsole = console;

/**
 * Wrap console unless suppressed.
 * At the moment, the console is considered a host power in the start
 * compartment, and not a primordial. Hence it is absent from the whilelist
 * and bypasses the intrinsicsCollector.
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
  const causalConsole = makeCausalConsole(originalConsole, optGetStackString);
  return { console: causalConsole };
};

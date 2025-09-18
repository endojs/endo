import {
  isFrozen,
  isNonTrapping as optIsNonTrapping,
  freeze,
  suppressTrapping as optSuppressTrapping,
} from './src/commons.js';

/**
 * Local alias of `isFrozen` to eventually be switched to whatever tests
 * the non-trapping integrity trait.
 */
export const isFrozenOrIsNonTrapping = optIsNonTrapping || isFrozen;

/**
 * Local alias of `harden` to eventually be switched to whatever applies
 * the suppress-trapping integrity trait.
 */
export const hardenOrSuppressTrapping = optSuppressTrapping || harden;

/**
 * Local alias of `freeze` to eventually be switched to whatever applies
 * the suppress-trapping integrity trait.
 */
export const freezeOrSuppressTrapping = optSuppressTrapping || freeze;

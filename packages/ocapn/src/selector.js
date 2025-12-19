import { nameForPassableSymbol, passableSymbolForName } from '@endo/pass-style';

/**
 * @param {string} name
 * @returns {symbol}
 * Creates a selector symbol.
 */
export const makeSelector = name => {
  if (name.startsWith('@@')) {
    throw new Error(
      `Selector name must not start with "@@" (reserved for well-known symbols), got: ${name}`,
    );
  }
  return harden(passableSymbolForName(name));
};

/**
 * @param {symbol} selector
 * @returns {string}
 * Gets the name from a selector.
 */
export const getSelectorName = selector => {
  if (typeof selector !== 'symbol') {
    throw new Error(
      `Expected symbol, got ${typeof selector}: ${String(selector)}`,
    );
  }
  const name = nameForPassableSymbol(selector);
  if (name === undefined) {
    throw new Error(
      `Selector ${String(selector)} is not a passable symbol (must be registered or well-known)`,
    );
  }
  if (name.startsWith('@@')) {
    throw new Error(
      `Selector name must not start with "@@" (reserved for well-known symbols), got: ${name}`,
    );
  }
  return name;
};

/**
 * @param {string} tagName
 * @returns {symbol}
 * TODO: to be replaced by makeSelector from @endo/pass-style when implemented.
 */
export const makeSelector = tagName => {
  return Symbol.for(tagName);
};

/**
 * @param {symbol} selector
 * @returns {string}
 */
export const getSelectorName = selector => {
  const name = Symbol.keyFor(selector);
  if (name === undefined) {
    throw new Error(`Selector ${String(selector)} has no name`);
  }
  return name;
};

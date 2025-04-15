export const SYRUP_SELECTOR_PREFIX = 'syrup:';

// To be used as keys, syrup selectors must be javascript symbols.
// To avoid an otherwise meaningful symbol name, we prefix it with 'syrup:'.
export const SyrupSelectorFor = name =>
  Symbol.for(`${SYRUP_SELECTOR_PREFIX}${name}`);

/**
 * @param {symbol} selectorSymbol
 * @returns {string}
 */
export const getSyrupSelectorName = selectorSymbol => {
  const description = selectorSymbol.description;
  if (!description) {
    throw TypeError(`Symbol ${String(selectorSymbol)} has no description`);
  }
  if (!description.startsWith(SYRUP_SELECTOR_PREFIX)) {
    throw TypeError(
      `Symbol ${String(selectorSymbol)} has a description that does not start with "${SYRUP_SELECTOR_PREFIX}", got "${description}"`,
    );
  }
  return description.slice(SYRUP_SELECTOR_PREFIX.length);
};

export const SYRUP_SYMBOL_PREFIX = 'syrup:';

// To be used as keys, syrup symbols must be javascript symbols.
// To avoid an otherwise meaningful symbol name, we prefix it with 'syrup:'.
export const SyrupSymbolFor = (name) => Symbol.for(`${SYRUP_SYMBOL_PREFIX}${name}`);

/**
 * @param {symbol} symbol
 * @returns {string}
 */
export const getSyrupSymbolName = (symbol) => {
  const description = symbol.description;
  if (!description) {
    throw TypeError(`Symbol ${String(symbol)} has no description`);
  }
  if (!description.startsWith(SYRUP_SYMBOL_PREFIX)) {
    throw TypeError(`Symbol ${String(symbol)} has a description that does not start with "${SYRUP_SYMBOL_PREFIX}", got "${description}"`);
  }
  return description.slice(SYRUP_SYMBOL_PREFIX.length);
}

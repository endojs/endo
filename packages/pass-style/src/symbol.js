import { Fail, q } from '@endo/errors';

const { ownKeys } = Reflect;

/**
 * The well known symbols are static symbol values on the `Symbol` constructor.
 */
const wellKnownSymbolNames = new Map(
  ownKeys(Symbol)
    .filter(
      name => typeof name === 'string' && typeof Symbol[name] === 'symbol',
    )
    .filter(name => {
      // TODO either delete or at-ts-expect-error
      // @ts-ignore It doesn't know name cannot be a symbol
      !name.startsWith('@@') ||
        Fail`Did not expect Symbol to have a symbol-valued property name starting with "@@" ${q(
          name,
        )}`;
      return true;
    })
    // @ts-ignore It doesn't know name cannot be a symbol
    .map(name => [Symbol[name], `@@${name}`]),
);

/**
 * The passable symbols are the well known symbols (the symbol values
 * of static properties of the `Symbol` constructor) and the registered
 * symbols.
 *
 * @param {any} sym
 * @returns {boolean}
 */
export const isPassableSymbol = sym =>
  typeof sym === 'symbol' &&
  (typeof Symbol.keyFor(sym) === 'string' || wellKnownSymbolNames.has(sym));
harden(isPassableSymbol);

export const assertPassableSymbol = sym =>
  isPassableSymbol(sym) ||
  Fail`Only registered symbols or well-known symbols are passable: ${q(sym)}`;
harden(assertPassableSymbol);

/**
 * If `sym` is a passable symbol, return a string that uniquely identifies this
 * symbol. If `sym` is a non-passable symbol, return `undefined`.
 *
 * The passable symbols are the well known symbols (the symbol values
 * of static properties of the `Symbol` constructor) and the registered
 * symbols. Since the registration string of a registered symbol can be any
 * string, if we simply used that to identify those symbols, there would not
 * be any remaining strings left over to identify the well-known symbols.
 * Instead, we reserve strings beginning with `"@@"` for purposes of this
 * encoding. We identify a well known symbol such as `Symbol.iterator`
 * by prefixing the property name with `"@@"`, such as `"@@iterator"`.
 * For registered symbols whose name happens to begin with `"@@"`, such
 * as `Symbol.for('@@iterator')` or `Symbol.for('@@foo')`, we identify
 * them by prefixing them with an extra `"@@"`, such as
 * `"@@@@iterator"` or `"@@@@foo"`. (This is the Hilbert Hotel encoding
 * technique.)
 *
 * @param {symbol} sym
 * @returns {string=}
 */
export const nameForPassableSymbol = sym => {
  const name = Symbol.keyFor(sym);
  if (name === undefined) {
    return wellKnownSymbolNames.get(sym);
  }
  if (name.startsWith('@@')) {
    return `@@${name}`;
  }
  return name;
};
harden(nameForPassableSymbol);

const AtAtPrefixPattern = /^@@(.*)$/;
harden(AtAtPrefixPattern);

/**
 * If `name` is a string that could have been produced by
 * `nameForPassableSymbol`, return the symbol argument it was produced to
 * represent.
 *
 *    If `name` does not begin with `"@@"`, then just the corresponding
 *      registered symbol, `Symbol.for(name)`.
 *    If `name` is `"@@"` followed by a well known symbol's property name on
 *      `Symbol` such `"@@iterator", return that well known symbol such as
 *      `Symbol.iterator`
 *    If `name` begins with `"@@@@"` it encodes the registered symbol whose
 *      name begins with `"@@"` instead.
 *    Otherwise, if name begins with `"@@"` it may encode a registered symbol
 *      from a future version of JavaScript, but it is not one we can decode
 *      yet, so throw.
 *
 * @param {string} name
 * @returns {symbol=}
 */
export const passableSymbolForName = name => {
  if (typeof name !== 'string') {
    return undefined;
  }
  const match = AtAtPrefixPattern.exec(name);
  if (match) {
    const suffix = match[1];
    if (suffix.startsWith('@@')) {
      return Symbol.for(suffix);
    } else {
      const sym = Symbol[suffix];
      if (typeof sym === 'symbol') {
        return sym;
      }
      Fail`Reserved for well known symbol ${q(suffix)}: ${q(name)}`;
    }
  }
  return Symbol.for(name);
};
harden(passableSymbolForName);

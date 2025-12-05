import {
  PASS_STYLE,
  nameForPassableSymbol,
  passableSymbolForName,
} from '@endo/pass-style';

const { freeze, prototype: ObjectPrototype, create } = Object;

/**
 * @param {string} tagName
 * @param {any} payload
 * @returns {any}
 * TODO: to be replaced by makeTagged from @endo/pass-style when it supports
 * OCapN selectors in the payload.
 */
export const makeTagged = (tagName, payload) => {
  const result = create(ObjectPrototype, {
    [PASS_STYLE]: { value: 'tagged' },
    [Symbol.toStringTag]: { value: tagName },
    payload: { value: payload, enumerable: true },
  });
  return freeze(result);
};

export const isTagged = value => {
  return value && value[PASS_STYLE] === 'tagged';
};

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
  return passableSymbolForName(name);
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

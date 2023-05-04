import {
  Symbol,
  entries,
  fromEntries,
  getOwnPropertyDescriptors,
  defineProperties,
  arrayMap,
} from './commons.js';

/**
 * This taming replaces the original `Symbol` constructor with one that seems
 * identical, except that all its properties are "temporarily" configurable.
 * This assumes two succeeding phases of processing: A whitelisting phase, that
 * removes all properties not on the whitelist (which requires them to be
 * configurable) and a global hardening step that freezes all primordials,
 * returning these properties to their non-configurable status.
 *
 * However, the ses shim is constructed to enable vetter shims to run between
 * repair and global hardening. Such vetter shims will see the replacement
 * `Symbol` constructor with any "extra" properties that the whitelisting will
 * remove, and with the well-known-symbol properties being configurable, in
 * violation of the JavaScript spec.
 *
 * Note that the spec refers to the global `Symbol` function as the
 * ["Symbol Constructor"](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-symbol-constructor)
 * even though it has a call behavior (can be called as a function) and does not
 * not have a construct behavior (cannot be called with `new`). Accordingly,
 * to tame it, we must replace it with a function without a construct
 * behavior.
 *
 * @returns {SymbolConstructor}
 */
export const tameSymbolConstructor = () => {
  const OriginalSymbol = Symbol;
  const SymbolPrototype = OriginalSymbol.prototype;

  const SharedSymbol = {
    Symbol(description) {
      return OriginalSymbol(description);
    },
  }.Symbol;

  defineProperties(SymbolPrototype, {
    constructor: {
      value: SharedSymbol,
      // leave other `constructor` attributes as is
    },
  });

  const originalDescsEntries = entries(
    getOwnPropertyDescriptors(OriginalSymbol),
  );
  const descs = fromEntries(
    arrayMap(originalDescsEntries, ([name, desc]) => [
      name,
      { ...desc, configurable: true },
    ]),
  );
  defineProperties(SharedSymbol, descs);

  return /** @type {SymbolConstructor} */ (SharedSymbol);
};

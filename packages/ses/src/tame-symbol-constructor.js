import {
  Symbol,
  entries,
  fromEntries,
  getOwnPropertyDescriptors,
  defineProperties,
  arrayMap,
  functionBind,
} from './commons.js';

/**
 * This taming provides a tamed alternative to the original `Symbol` constructor
 * that starts off identical, except that all its properties are "temporarily"
 * configurable. The original `Symbol` constructor remains unmodified on
 * the start compartment's global. The tamed alternative is used as the shared
 * `Symbol` constructor on constructed compartments.
 *
 * Starting these properties as configurable assumes two succeeding phases of
 * processing: A permit enforcement phase, that
 * removes all properties not on the permits (which requires them to be
 * configurable) and a global hardening step that freezes all primordials,
 * returning these properties to their expected non-configurable status.
 *
 * The ses shim is constructed to eventually enable vetted shims to run between
 * repair and global hardening. However, such vetted shims would normally
 * run in the start compartment, which continues to use the original unmodified
 * `Symbol`, so they should not normally be affected by the temporary
 * configurability of these properties.
 *
 * Note that the spec refers to the global `Symbol` function as the
 * ["Symbol Constructor"](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-symbol-constructor)
 * even though it has a call behavior (can be called as a function) and does not
 * not have a construct behavior (cannot be called with `new`). Accordingly,
 * to tame it, we must replace it with a function without a construct
 * behavior.
 */
export const tameSymbolConstructor = () => {
  const OriginalSymbol = Symbol;
  const SymbolPrototype = OriginalSymbol.prototype;

  // Bypass Hermes bug, fixed in: https://github.com/facebook/hermes/commit/00f18c89c720e1c34592bb85a1a8d311e6e99599
  // Make a "copy" of the primordial [Symbol "constructor"](https://tc39.es/ecma262/#sec-symbol-description) which maintains all observable behavior. The primordial explicitly throws on `[[Construct]]` and has a `[[Call]]` which ignores the receiver. Binding also maintains the `toString` source as a native function. The `name` is restored below when copying own properties.
  const SharedSymbol = functionBind(Symbol, undefined);

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

  return { '%SharedSymbol%': SharedSymbol };
};

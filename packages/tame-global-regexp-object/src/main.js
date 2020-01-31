/* globals globalThis */
const {
  defineProperties,
  defineProperty,
  getOwnPropertyDescriptors,
  getOwnPropertyDescriptor,
} = Object;

const { ownkeys } = Reflect;

export default function tameGlobalRegExpObject() {
  // Capture the original constructor.
  const unsafeRegExp = RegExp; // TODO freeze

  // RegExp has non-writable static properties we need to remove.

  // Tame RegExp constructor.
  const safeRegExp = function RegExp() {
    // eslint-disable-next-line prefer-rest-params
    return Reflect.construct(unsafeRegExp, arguments, new.target);
  };

  // Whitelist static properties.
  const desc = getOwnPropertyDescriptor(unsafeRegExp, Symbol.species);
  defineProperties(safeRegExp, Symbol.species, desc);

  // Copy prototype properties.
  const prototypeDescs = getOwnPropertyDescriptors(unsafeRegExp.prototype);
  prototypeDescs.constructor.value = safeRegExp;
  defineProperties(safeRegExp.prototype, prototypeDescs);

  globalThis.RegExp = safeRegExp;

  delete safeRegExp.prototype.compile;
  delete unsafeRegExp.prototype.compile;
}

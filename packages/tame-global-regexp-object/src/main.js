/* globals globalThis */
const {
  defineProperties,
  defineProperty,
  getOwnPropertyDescriptors,
  getOwnPropertyDescriptor,
} = Object;

export default function tameGlobalRegExpObject() {
  // Capture the original constructor.
  const unsafeRegExp = RegExp; // TODO freeze

  // RegExp has non-writable static properties we need to remove.

  // Tame RegExp constructor.
  const safeRegExp = function RegExp() {
    // eslint-disable-next-line prefer-rest-params
    return Reflect.construct(unsafeRegExp, arguments, new.target);
  };

  // Copy prototype properties.
  const descs = getOwnPropertyDescriptors(unsafeRegExp.prototype);
  descs.constructor.value = safeRegExp;
  defineProperties(safeRegExp.prototype, descs);

  globalThis.RegExp = safeRegExp;

  delete safeRegExp.prototype.compile;
  delete unsafeRegExp.prototype.compile;
}

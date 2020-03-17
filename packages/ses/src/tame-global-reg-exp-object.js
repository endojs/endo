const {
  defineProperties,
  getOwnPropertyDescriptors,
  getOwnPropertyDescriptor,
} = Object;

export default function tameGlobalRegExpObject() {
  // Tame the %RegExp% intrinsic.

  delete RegExp.prototype.compile;

  // Capture the original constructor.
  const unsafeRegExp = RegExp; // TODO freeze

  // RegExp has non-writable static properties we need to remove.
  // Tame RegExp constructor.
  const tamedRegExp = function RegExp(...rest) {
    if (new.target) {
      return Reflect.construct(unsafeRegExp, rest, new.target);
    }
    return unsafeRegExp(...rest);
  };

  // Whitelist static properties.
  const desc = getOwnPropertyDescriptor(unsafeRegExp, Symbol.species);
  defineProperties(tamedRegExp, Symbol.species, desc);

  // Copy prototype properties.
  const prototypeDescs = getOwnPropertyDescriptors(unsafeRegExp.prototype);
  prototypeDescs.constructor.value = tamedRegExp;
  defineProperties(tamedRegExp.prototype, prototypeDescs);

  // Done with RegExp constructor.
  globalThis.RegExp = tamedRegExp;
}

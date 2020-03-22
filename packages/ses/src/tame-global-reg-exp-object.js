const { defineProperties, getOwnPropertyDescriptors } = Object;

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

  // Copy prototype properties.
  const prototypeDescs = getOwnPropertyDescriptors(unsafeRegExp.prototype);
  prototypeDescs.constructor.value = tamedRegExp;
  defineProperties(tamedRegExp.prototype, prototypeDescs);

  // Done with RegExp constructor.
  globalThis.RegExp = tamedRegExp;
}

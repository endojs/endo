const { defineProperties } = Object;

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

  const RegExpPrototype = unsafeRegExp.prototype;
  defineProperties(tamedRegExp, {
    prototype: { value: RegExpPrototype },
  });
  defineProperties(RegExpPrototype, {
    constructor: { value: tamedRegExp },
  });

  // Done with RegExp constructor.
  globalThis.RegExp = tamedRegExp;
}

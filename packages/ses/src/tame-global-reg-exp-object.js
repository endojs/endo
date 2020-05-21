const { defineProperties, getOwnPropertyDescriptor } = Object;

export default function tameGlobalRegExpObject(regExpTaming = 'safe') {
  if (regExpTaming === 'unsafe') {
    return;
  }
  if (regExpTaming !== 'safe') {
    throw new Error(`unrecognized regExpTaming ${regExpTaming}`);
  }

  const unsafeRegExp = RegExp;

  // RegExp has non-writable static properties we need to omit.
  const tamedRegExp = function RegExp(...rest) {
    if (new.target === undefined) {
      return unsafeRegExp(...rest);
    }
    return Reflect.construct(unsafeRegExp, rest, new.target);
  };

  const RegExpPrototype = unsafeRegExp.prototype;
  defineProperties(tamedRegExp, {
    length: { value: 2 },
    prototype: {
      value: RegExpPrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    [Symbol.species]: getOwnPropertyDescriptor(unsafeRegExp, Symbol.species),
  });

  delete RegExpPrototype.compile;
  defineProperties(RegExpPrototype, {
    constructor: { value: tamedRegExp },
  });

  globalThis.RegExp = tamedRegExp;
}

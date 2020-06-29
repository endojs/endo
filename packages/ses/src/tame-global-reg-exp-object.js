import { defineProperties, getOwnPropertyDescriptor } from './commons.js';

export default function tameGlobalRegExpObject(regExpTaming = 'safe') {
  if (regExpTaming !== 'safe' && regExpTaming !== 'unsafe') {
    throw new Error(`unrecognized regExpTaming ${regExpTaming}`);
  }
  const originalRegExp = RegExp;

  // RegExp has non-writable static properties we need to omit.
  const sharedRegExp = function RegExp(...rest) {
    if (new.target === undefined) {
      return originalRegExp(...rest);
    }
    return Reflect.construct(originalRegExp, rest, new.target);
  };

  const RegExpPrototype = originalRegExp.prototype;
  defineProperties(sharedRegExp, {
    length: { value: 2 },
    prototype: {
      value: RegExpPrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    [Symbol.species]: getOwnPropertyDescriptor(originalRegExp, Symbol.species),
  });

  delete RegExpPrototype.compile;
  defineProperties(RegExpPrototype, {
    constructor: { value: sharedRegExp },
  });

  return {
    start: {
      // TODO do we ever really want to expose the original RegExp constructor,
      // even just in the start compartment?
      RegExp: {
        value: regExpTaming === 'unsafe' ? originalRegExp : sharedRegExp,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    },
    shared: {
      RegExp: {
        value: sharedRegExp,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    },
  };
}

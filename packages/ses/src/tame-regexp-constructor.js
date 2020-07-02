import { defineProperties, getOwnPropertyDescriptor } from './commons.js';

export default function tameRegExpConstructor(regExpTaming = 'safe') {
  if (regExpTaming !== 'safe' && regExpTaming !== 'unsafe') {
    throw new Error(`unrecognized regExpTaming ${regExpTaming}`);
  }
  const OriginalRegExp = RegExp;
  const RegExpPrototype = OriginalRegExp.prototype;

  const makeRegExpConstructor = (_ = {}) => {
    // RegExp has non-writable static properties we need to omit.
    const ResultRegExp = function RegExp(...rest) {
      if (new.target === undefined) {
        return OriginalRegExp(...rest);
      }
      return Reflect.construct(OriginalRegExp, rest, new.target);
    };

    defineProperties(ResultRegExp, {
      length: { value: 2 },
      prototype: {
        value: RegExpPrototype,
        writable: false,
        enumerable: false,
        configurable: false,
      },
      [Symbol.species]: getOwnPropertyDescriptor(
        OriginalRegExp,
        Symbol.species,
      ),
    });
    return ResultRegExp;
  };

  const InitialRegExp = makeRegExpConstructor();
  const SharedRegExp = makeRegExpConstructor();

  if (regExpTaming !== 'unsafe') {
    delete RegExpPrototype.compile;
  }
  defineProperties(RegExpPrototype, {
    constructor: { value: SharedRegExp },
  });

  return {
    '%InitialRegExp%': InitialRegExp,
    '%SharedRegExp%': SharedRegExp,
  };
}

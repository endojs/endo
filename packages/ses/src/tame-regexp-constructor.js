import {
  FERAL_REG_EXP,
  TypeError,
  construct,
  defineProperties,
  getOwnPropertyDescriptor,
  speciesSymbol,
} from './commons.js';

export default function tameRegExpConstructor(regExpTaming = 'safe') {
  if (regExpTaming !== 'safe' && regExpTaming !== 'unsafe') {
    throw TypeError(`unrecognized regExpTaming ${regExpTaming}`);
  }
  const RegExpPrototype = FERAL_REG_EXP.prototype;

  const makeRegExpConstructor = (_ = {}) => {
    // RegExp has non-writable static properties we need to omit.
    /**
     * @param  {Parameters<typeof FERAL_REG_EXP>} rest
     */
    const ResultRegExp = function RegExp(...rest) {
      if (new.target === undefined) {
        return FERAL_REG_EXP(...rest);
      }
      return construct(FERAL_REG_EXP, rest, new.target);
    };

    const speciesDesc = getOwnPropertyDescriptor(FERAL_REG_EXP, speciesSymbol);
    if (!speciesDesc) {
      throw TypeError('no RegExp[Symbol.species] descriptor');
    }

    defineProperties(ResultRegExp, {
      length: { value: 2 },
      prototype: {
        value: RegExpPrototype,
        writable: false,
        enumerable: false,
        configurable: false,
      },
      [speciesSymbol]: speciesDesc,
    });
    return ResultRegExp;
  };

  const InitialRegExp = makeRegExpConstructor();
  const SharedRegExp = makeRegExpConstructor();

  if (regExpTaming !== 'unsafe') {
    // @ts-expect-error Deleted properties must be optional
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

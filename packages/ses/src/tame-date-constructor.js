import { defineProperties } from './commons.js';

export default function tameDateConstructor(dateTaming = 'safe') {
  if (dateTaming !== 'safe' && dateTaming !== 'unsafe') {
    throw new Error(`unrecognized dateTaming ${dateTaming}`);
  }
  const OriginalDate = Date;
  const DatePrototype = OriginalDate.prototype;

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods = {
    now() {
      return NaN;
    },
  };

  // Tame the Date constructor.
  // Common behavior
  //   * new Date(x) coerces x into a number and then returns a Date
  //     for that number of millis since the epoch
  //   * new Date(NaN) returns a Date object which stringifies to
  //     'Invalid Date'
  //   * new Date(undefined) returns a Date object which stringifies to
  //     'Invalid Date'
  // OriginalDate (normal standard) behavior
  //   * Date(anything) gives a string with the current time
  //   * new Date() returns the current time, as a Date object
  // SharedDate behavior
  //   * Date(anything) returned 'Invalid Date'
  //   * new Date() returns a Date object which stringifies to
  //     'Invalid Date'
  const makeDateConstructor = ({ powers = 'none' } = {}) => {
    let ResultDate;
    if (powers === 'original') {
      ResultDate = function Date(...rest) {
        if (new.target === undefined) {
          return Reflect.apply(OriginalDate, undefined, rest);
        }
        return Reflect.construct(OriginalDate, rest, new.target);
      };
    } else {
      ResultDate = function Date(...rest) {
        if (new.target === undefined) {
          return 'Invalid Date';
        }
        if (rest.length === 0) {
          rest = [NaN];
        }
        return Reflect.construct(OriginalDate, rest, new.target);
      };
    }

    defineProperties(ResultDate, {
      length: { value: 7 },
      prototype: {
        value: DatePrototype,
        writable: false,
        enumerable: false,
        configurable: false,
      },
      parse: {
        value: Date.parse,
        writable: true,
        enumerable: false,
        configurable: true,
      },
      UTC: {
        value: Date.UTC,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    });
    return ResultDate;
  };
  const InitialDate = makeDateConstructor({ powers: 'original' });
  const SharedDate = makeDateConstructor({ power: 'none' });

  defineProperties(InitialDate, {
    now: {
      value: Date.now,
      writable: true,
      enumerable: false,
      configurable: true,
    },
  });
  defineProperties(SharedDate, {
    now: {
      value: tamedMethods.now,
      writable: true,
      enumerable: false,
      configurable: true,
    },
  });

  defineProperties(DatePrototype, {
    constructor: { value: SharedDate },
  });

  return {
    '%InitialDate%': InitialDate,
    '%SharedDate%': SharedDate,
  };
}

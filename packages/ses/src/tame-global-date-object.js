const { defineProperties } = Object;

export default function tameGlobalDateObject(noTameDate = false) {
  if (noTameDate) {
    return;
  }

  const unsafeDate = Date;

  // Tame the Date constructor.
  // Common behavior
  //   * new Date(x) coerces x into a number and then returns a Date
  //     for that number of millis since the epoch
  //   * new Date(NaN) returns a Date object which stringifies to
  //     'Invalid Date'
  //   * new Date(undefined) returns a Date object which stringifies to
  //     'Invalid Date'
  // unsafeDate (normal standard) behavior
  //   * Date(anything) gives a string with the current time
  //   * new Date() returns the current time, as a Date object
  // tamedDate behavior
  //   * Date(anything) returned 'Invalid Date'
  //   * new Date() returns a Date object which stringifies to
  //     'Invalid Date'
  const tamedDate = function Date(...rest) {
    if (new.target === undefined) {
      return 'Invalid Date';
    }
    if (rest.length === 0) {
      rest = [NaN];
    }
    // todo: test that our constructor can still be subclassed
    return Reflect.construct(unsafeDate, rest, new.target);
  };

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods = {
    now() {
      return NaN;
    },
    toLocaleString() {
      throw new TypeError('Object.prototype.toLocaleString is disabled');
    },
  };

  const DatePrototype = unsafeDate.prototype;
  defineProperties(tamedDate, {
    length: { value: 7 },
    prototype: {
      value: DatePrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    now: {
      value: tamedMethods.now,
      writable: true,
      enumerable: false,
      configurable: true,
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
  defineProperties(DatePrototype, {
    constructor: { value: tamedDate },
    toLocaleString: { value: tamedMethods.toLocaleString },
  });

  globalThis.Date = tamedDate;

  // Why is this repair here?
  defineProperties(Object.prototype, {
    toLocaleString: { value: tamedMethods.toLocaleString },
  });
}

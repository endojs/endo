/* globals globalThis */
const {
  defineProperties,
  defineProperty,
  getOwnPropertyDescriptors,
  getOwnPropertyDescriptor,
} = Object;

export default function tameGlobalDateObject() {
  // Capture the original constructor.
  const unsafeDate = Date;

  // Date(anything) gives a string with the current time
  // new Date(x) coerces x into a number and then returns a Date
  // new Date() returns the current time, as a Date object
  // new Date(undefined) returns a Date object which stringifies to 'Invalid Date'

  // Tame Date constructor.
  const safeDate = function Date() {
    if (new.target === undefined) {
      // We were not called as a constructor
      // this would normally return a string with the current time
      return 'Invalid Date';
    }
    // constructor behavior: if we get arguments, we can safely pass them through
    if (arguments.length > 0) {
      // eslint-disable-next-line prefer-rest-params
      return Reflect.construct(unsafeDate, arguments, new.target);
      // todo: test that our constructor can still be subclassed
    }
    // SES fix: no arguments: return a Date object, but invalid value.
    return Reflect.construct(unsafeDate, [NaN], new.target);
  };

  // Copy static properties.
  const descs = getOwnPropertyDescriptors(unsafeDate);
  defineProperties(safeDate, descs);

  // Set the prototype constructor.
  const desc = getOwnPropertyDescriptor(unsafeDate.prototype, 'constructor');
  desc.value = safeDate;
  defineProperty(safeDate.prototype, 'constructor', desc);

  // Tame specific properties.
  const tamedNow = {
    now() {
      return NaN;
    },
  }.now;

  // eslint-disable-next-line no-extend-native
  defineProperties(Date, {
    now: {
      value: tamedNow,
      enumerable: false,
      configurable: true,
      writable: true,
    },
  });

  const tamedToLocaleString = {
    toLocaleString() {
      return NaN;
    },
  }.toLocaleString;

  defineProperties(Date.prototype, {
    toLocaleString: {
      value: tamedToLocaleString,
      enumerable: false,
      configurable: true,
      writable: true,
    },
  });

  // Done with Date
  globalThis.Date = safeDate;

  // eslint-disable-next-line no-extend-native
  const throwingToLocaleString = {
    toLocaleString() {
      throw new Error('suppressed');
    },
  }.toLocaleString;

  defineProperties(Object.prototype, {
    toLocaleString: {
      value: throwingToLocaleString,
      enumerable: false,
      configurable: true,
      writable: true,
    },
  });
}

/* globals globalThis */
const {
  defineProperties,
  defineProperty,
  getOwnPropertyDescriptors,
  getOwnPropertyDescriptor,
} = Object;

export default function tameGlobalDateObject() {
  // Capture the original constructor.
  const unsafeDate = Date; // TODO freeze

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

  // Tame specific properties.
  const safeDatePrototypeDescs = getOwnPropertyDescriptors({
    now() {
      return NaN;
    },
    toLocaleString() {
      return NaN;
    },
  });

  // Copy static properties.
  const staticDescs = getOwnPropertyDescriptors(unsafeDate);
  staticDescs.now.value = safeDatePrototypeDescs.now.value;
  defineProperties(safeDate, staticDescs);

  // Copy prototype properties.
  const prototypeDescs = getOwnPropertyDescriptors(unsafeDate.prototype);
  prototypeDescs.constructor.value = safeDate;
  prototypeDescs.toLocaleString.value = safeDatePrototypeDescs.toLocaleString.value;
  defineProperties(safeDate.prototype, prototypeDescs);

  // Done with Date
  globalThis.Date = safeDate;

  // eslint-disable-next-line no-extend-native
  const safeObjectPrototypeDescs = getOwnPropertyDescriptors({
    toLocaleString() {
      throw new Error('suppressed');
    },
  });

  defineProperties(Object.prototype, {
    toLocaleString: {
      value: safeObjectPrototypeDescs.toLocaleString.value,
      enumerable: false,
      configurable: true,
      writable: true,
    },
  });
}

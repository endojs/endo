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

  // Copy static properties.
  const safeDateDescs = getOwnPropertyDescriptors({
    now() {
      return NaN;
    },
  });

  const dateDescs = getOwnPropertyDescriptors(unsafeDate);
  dateDescs.now = safeDateDescs.now;
  defineProperties(safeDate, dateDescs);

  // Copy prototype properties.
  const safeDatePrototypeDescs = getOwnPropertyDescriptors({
    toLocaleString() {
      return NaN;
    },
  });
  const datePrototypeDescs = getOwnPropertyDescriptors(
    unsafeDate.prototype,
  );
  datePrototypeDescs.constructor.value = safeDate;
  datePrototypeDescs.toLocaleString = safeDatePrototypeDescs.toLocaleString;
  defineProperties(safeDate.prototype, datePrototypeDescs);

  // Done with Date
  globalThis.Date = safeDate;

  // eslint-disable-next-line no-extend-native
  const safeObjectPrototypeDescs = getOwnPropertyDescriptors({
    toLocaleString() {
      throw new Error('suppressed');
    },
  });

  defineProperties(Object.prototype, safeObjectPrototypeDescs);
}

/* globals globalThis */
const { defineProperties, getOwnPropertyDescriptors } = Object;

export default function tameGlobalDateObject() {
  // Capture the original constructor.
  const unsafeDate = Date; // TODO freeze

  // Tame the %Date% and %DatePrototype% intrinsic.
  const { now } = {
    now() {
      return NaN;
    },
  };
  unsafeDate.now = now;

  const { toLocaleString: toLocaleString1 } = {
    toLocaleString() {
      return NaN;
    },
  };
  unsafeDate.prototype.toLocaleString = toLocaleString1;

  // Date(anything) gives a string with the current time
  // new Date(x) coerces x into a number and then returns a Date
  // new Date() returns the current time, as a Date object
  // new Date(undefined) returns a Date object which stringifies to 'Invalid Date'

  // Tame the Date constructor.
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
  const dateDescs = getOwnPropertyDescriptors(unsafeDate);
  defineProperties(safeDate, dateDescs);

  // Copy prototype properties.
  const datePrototypeDescs = getOwnPropertyDescriptors(unsafeDate.prototype);
  datePrototypeDescs.constructor.value = safeDate;
  defineProperties(safeDate.prototype, datePrototypeDescs);

  // Done with Date
  globalThis.Date = safeDate;

  // Tame the %ObjectPrototype% intrinsic.
  const { toLocaleString: toLocaleString2 } = {
    toLocaleString() {
      throw new Error('Object.prototype.toLocaleString is suppressed');
    },
  };

  // eslint-disable-next-line no-extend-native
  Object.prototype.toLocaleString = toLocaleString2;
}

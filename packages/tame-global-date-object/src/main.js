/* globals globalThis */
const { defineProperties, getOwnPropertyDescriptors } = Object;

export default function tameGlobalDateObject() {
  // Tame the %Date% and %DatePrototype% intrinsic.

  // Use a concise method to obtain a named function without constructor.
  const DateStatic = {
    now() {
      return NaN;
    },
  };
  Date.now = DateStatic.now;

  // Use a concise method to obtain a named function without constructor.
  const DatePrototype = {
    toLocaleString() {
      return NaN;
    },
  };
  // eslint-disable-next-line no-extend-native
  Date.prototype.toLocaleString = DatePrototype.toLocaleString;

  // Date(anything) gives a string with the current time
  // new Date(x) coerces x into a number and then returns a Date
  // new Date() returns the current time, as a Date object
  // new Date(undefined) returns a Date object which stringifies to 'Invalid Date'

  // Capture the original constructor.
  const unsafeDate = Date; // TODO freeze

  // Tame the Date constructor.
  const tamedDate = function Date() {
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
  defineProperties(tamedDate, dateDescs);

  // Copy prototype properties.
  const datePrototypeDescs = getOwnPropertyDescriptors(unsafeDate.prototype);
  datePrototypeDescs.constructor.value = tamedDate;
  defineProperties(tamedDate.prototype, datePrototypeDescs);

  // Done with Date constructor
  globalThis.Date = tamedDate;

  // Tame the %ObjectPrototype% intrinsic.

  // Use a concise method to obtain a named function without constructor.
  const ObjectPrototype = {
    toLocaleString() {
      throw new TypeError('Object.prototype.toLocaleString is disabled');
    },
  };

  // eslint-disable-next-line no-extend-native
  Object.prototype.toLocaleString = ObjectPrototype.toLocaleString;
}

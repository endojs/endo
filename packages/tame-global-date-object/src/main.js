/* globals globalThis */
const {
  defineProperties,
  defineProperty,
  getOwnPropertyDescriptors,
  getOwnPropertyDescriptor,
} = Object;

export default function tameGlobalDateObject() {
  // Verify that Date has been tamed adequately.
  if (Number.isNaN(Date.now()) && Number.isNaN(new Date().getTime())) {
    return;
  }

  // Capture the original constructor.
  const unsafeDate = globalThis.Date;
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
  // Tame Date.now().
  descs.now.value = function now() {
    return NaN;
  };
  defineProperties(safeDate, descs);

  // Set the prototype constructor.
  const desc = getOwnPropertyDescriptor(unsafeDate.prototype, 'constructor');
  desc.value = safeDate;
  defineProperty(safeDate.prototype, 'constructor', desc);

  globalThis.Date = safeDate; // eslint-disable-line no-global-assign
}

export default function tameDate() {
  const unsafeDate = Date;
  // Date(anything) gives a string with the current time
  // new Date(x) coerces x into a number and then returns a Date
  // new Date() returns the current time, as a Date object
  // new Date(undefined) returns a Date object which stringifies to 'Invalid Date'

  const newDateConstructor = function Date(...args) {
    if (new.target === undefined) {
      // we were not called as a constructor
      // this would normally return a string with the current time
      return 'Invalid Date';
    }
    // constructor behavior: if we get arguments, we can safely pass them through
    if (args.length > 0) {
      return Reflect.construct(unsafeDate, args, new.target);
      // todo: test that our constructor can still be subclassed
    }
    // no arguments: return a Date object, but invalid
    return Reflect.construct(unsafeDate, [NaN], new.target);
  };

  Object.defineProperties(
    newDateConstructor,
    Object.getOwnPropertyDescriptors(unsafeDate),
  );
  // that will copy the .prototype too, so this next line is unnecessary
  // newDateConstructor.prototype = unsafeDate.prototype;
  unsafeDate.prototype.constructor = newDateConstructor;
  // disable Date.now
  newDateConstructor.now = () => NaN;

  Date = newDateConstructor;
}

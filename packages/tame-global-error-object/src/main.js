/* globals globalThis */
const { defineProperty, getOwnPropertyDescriptor } = Object;

export default function tameGlobalErrorObject() {
  if (Error.prototype.stack === 'stack suppressed' || !getOwnPropertyDescriptor(Error, 'captureStackTrace')) {
    return;
  }

  // Tame stack prototype property.
  defineProperty(Error.prototype, 'stack', { get() { return 'stack suppressed'; }, configurable: true });

  if (Error.prototype.stack === '') {
    throw Error('Cannot remove Error.prototype.stack');
  }
  
  // Tame captureStackTrace static property.
  delete Error.captureStackTrace;

  if (getOwnPropertyDescriptor(Error, 'captureStackTrace')) {
    throw Error('Cannot remove Error.captureStackTrace');
  }

  // we might do this in the future
  /*
  const unsafeError = Error;
  const newErrorConstructor = function Error(...args) {
    return Reflect.construct(unsafeError, args, new.target);
  };

  newErrorConstructor.prototype = unsafeError.prototype;
  newErrorConstructor.prototype.construct = newErrorConstructor;

  Error = newErrorConstructor;

  EvalError.__proto__ = newErrorConstructor;
  RangeError.__proto__ = newErrorConstructor;
  ReferenceError.__proto__ = newErrorConstructor;
  SyntaxError.__proto__ = newErrorConstructor;
  TypeError.__proto__ = newErrorConstructor;
  URIError.__proto__ = newErrorConstructor;
  */
}

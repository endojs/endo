const { defineProperties, getOwnPropertyDescriptor } = Object;

export default function tameGlobalErrorObject() {
  // Tame stack prototype property.
  defineProperties(Error.prototype, {
    stack: {
      get() {
        return 'stack suppressed';
      },
      configurable: true,
    },
  });

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

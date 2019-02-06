
export default function tameError() {
  if (!(Object.isExtensible(Error))) {
    throw Error('huh Error is not extensible');
  }
  /* this worked back when we were running it on a global, but stopped
  working when we turned it into a shim */
  /*
  Object.defineProperty(Error.prototype, "stack",
                        { get() { return 'stack suppressed'; } });
  */
  delete Error.captureStackTrace;
  if ('captureStackTrace' in Error) {
    throw Error('hey we could not remove Error.captureStackTrace');
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

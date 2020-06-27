const { defineProperties, setPrototypeOf } = Object;

// TODO where should this go?
export const NativeErrors = [
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
];

export default function tameGlobalErrorObject(errorTaming = 'safe') {
  if (errorTaming !== 'safe' && errorTaming !== 'unsafe') {
    throw new Error(`unrecognized errorTaming ${errorTaming}`);
  }
  const originalError = Error;

  // We never expose the originalError constructor. Rather, tamedError
  // is the one to be installed on the start compartment.
  const tamedError = function Error(...rest) {
    if (new.target === undefined) {
      return originalError(...rest);
    }
    return Reflect.construct(originalError, rest, new.target);
  };

  // TODO uncomment the sharedError occurrences. To do this, we need
  // more intrinsic reform so that the whitelist doesn't get confused
  // between tamedError and sharedError.
  const sharedError = tamedError;
  /*
  const sharedError = function Error(...rest) {
    if (new.target === undefined) {
      return originalError(...rest);
    }
    return Reflect.construct(originalError, rest, new.target);
  };
  */

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods = {
    captureStackTrace(error, optFn = undefined) {
      if (
        errorTaming === 'unsafe' &&
        typeof originalError.captureStackTrace === 'function'
      ) {
        // originalError.captureStackTrace is only on v8
        originalError.captureStackTrace(error, optFn);
        return;
      }
      Reflect.set(error, 'stack', '');
    },
  };

  const ErrorPrototype = originalError.prototype;
  defineProperties(tamedError, {
    length: { value: 1 },
    prototype: {
      value: ErrorPrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    captureStackTrace: {
      value: tamedMethods.captureStackTrace,
      writable: true,
      enumerable: false,
      configurable: true,
    },
    stackTraceLimit: {
      get() {
        if (
          errorTaming === 'unsafe' &&
          typeof originalError.stackTraceLimit === 'number'
        ) {
          // originalError.stackTraceLimit is only on v8
          return originalError.stackTraceLimit;
        }
        return 0;
      },
      set(newLimit) {
        if (
          errorTaming === 'unsafe' &&
          typeof originalError.stackTraceLimit === 'number'
        ) {
          // originalError.stackTraceLimit is only on v8
          originalError.stackTraceLimit = newLimit;
          // We place the useless return on the next line to ensure
          // that anything we place after the if in the future only
          // happens if the then-case does not.
          // eslint-disable-next-line no-useless-return
          return;
        }
      },
      // WTF on v8 stackTraceLimit is enumerable
      enumerable: false,
      configurable: true,
    },
  });

  // TODO uncomment. See TODO note above
  /*
  defineProperties(sharedError, {
    length: { value: 1 },
    prototype: {
      value: ErrorPrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    stackTraceLimit: {
      get() {
        return 0;
      },
      set(_) {
        // ignore
      },
      // WTF on v8 stackTraceLimit is enumerable
      enumerable: false,
      configurable: true,
    },
  });
  */

  defineProperties(ErrorPrototype, {
    constructor: { value: sharedError },
    /* TODO
    stack: {
      get() {
        return '';
      },
      set(_) {
        // ignore
      },
    },
    */
  });

  for (const NativeError of NativeErrors) {
    setPrototypeOf(NativeError, sharedError);
  }

  return {
    start: {
      Error: {
        value: tamedError,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    },
    shared: {
      Error: {
        value: sharedError,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    },
  };
}

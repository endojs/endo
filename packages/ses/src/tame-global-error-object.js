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

export default function tameGlobalErrorObject(noTameError = false) {
  const unsafeError = Error;

  const tamedError = function Error(...rest) {
    if (new.target === undefined) {
      return unsafeError(...rest);
    }
    return Reflect.construct(unsafeError, rest, new.target);
  };

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods = {
    captureStackTrace(error, optFn = undefined) {
      if (noTameError && unsafeError.captureStackTrace) {
        // unsafeError.captureStackTrace is only on v8
        unsafeError.captureStackTrace(error, optFn);
        return;
      }
      Reflect.set(error, 'stack', '');
    },
  };

  const ErrorPrototype = unsafeError.prototype;
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
        if (noTameError && unsafeError.stackTraceLimit) {
          // unsafeError.stackTraceLimit is only on v8
          return unsafeError.stackTraceLimit;
        }
        return 0;
      },
      set(newLimit) {
        if (noTameError && unsafeError.stackTraceLimit) {
          // unsafeError.stackTraceLimit is only on v8
          unsafeError.stackTraceLimit = newLimit;
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

  defineProperties(ErrorPrototype, {
    constructor: { value: tamedError },
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
    setPrototypeOf(NativeError, tamedError);
  }

  globalThis.Error = tamedError;
}

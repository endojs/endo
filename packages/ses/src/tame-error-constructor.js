import { defineProperties, setPrototypeOf } from './commons.js';
import { tameV8ErrorConstructor } from './tame-v8-error-constructor.js';

// TODO where should this go?
export const NativeErrors = [
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
];

// Use concise methods to obtain named functions without constructors.
const tamedMethods = {
  getStackString(_error) {
    return '';
  },
};

export default function tameErrorConstructor(errorTaming = 'safe') {
  if (errorTaming !== 'safe' && errorTaming !== 'unsafe') {
    throw new Error(`unrecognized errorTaming ${errorTaming}`);
  }
  const OriginalError = Error;
  const ErrorPrototype = OriginalError.prototype;

  const makeErrorConstructor = (_ = {}) => {
    const ResultError = function Error(...rest) {
      if (new.target === undefined) {
        return OriginalError(...rest);
      }
      return Reflect.construct(OriginalError, rest, new.target);
    };
    defineProperties(ResultError, {
      length: { value: 1 },
      prototype: {
        value: ErrorPrototype,
        writable: false,
        enumerable: false,
        configurable: false,
      },
    });
    return ResultError;
  };
  const InitialError = makeErrorConstructor({ powers: 'original' });
  const SharedError = makeErrorConstructor({ powers: 'none' });
  defineProperties(ErrorPrototype, {
    constructor: { value: SharedError },
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
    setPrototypeOf(NativeError, SharedError);
  }

  let initialGetStackString = tamedMethods.getStackString;
  if (typeof OriginalError.captureStackTrace === 'function') {
    // Assume we're on v8
    initialGetStackString = tameV8ErrorConstructor(
      OriginalError,
      InitialError,
      errorTaming,
    );
  }
  return {
    '%InitialGetStackString%': initialGetStackString,
    '%InitialError%': InitialError,
    '%SharedError%': SharedError,
  };
}

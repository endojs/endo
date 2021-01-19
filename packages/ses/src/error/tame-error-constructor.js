import {
  apply,
  construct,
  defineProperties,
  setPrototypeOf,
} from '../commons.js';
import { NativeErrors } from '../whitelist.js';
import { tameV8ErrorConstructor } from './tame-v8-error-constructor.js';

// Use concise methods to obtain named functions without constructors.
const tamedMethods = {
  getStackString(_error) {
    return '';
  },
};

export default function tameErrorConstructor(
  errorTaming = 'safe',
  stackFiltering = 'strong',
) {
  if (errorTaming !== 'safe' && errorTaming !== 'unsafe') {
    throw new Error(`unrecognized errorTaming ${errorTaming}`);
  }
  if (stackFiltering !== 'strong' && stackFiltering !== 'none') {
    throw new Error(`unrecognized stackFiltering ${stackFiltering}`);
  }
  const OriginalError = Error;
  const ErrorPrototype = OriginalError.prototype;

  const platform =
    typeof OriginalError.captureStackTrace === 'function' ? 'v8' : 'unknown';

  const makeErrorConstructor = (_ = {}) => {
    const ResultError = function Error(...rest) {
      let error;
      if (new.target === undefined) {
        error = apply(OriginalError, this, rest);
      } else {
        error = construct(OriginalError, rest, new.target);
      }
      if (platform === 'v8') {
        OriginalError.captureStackTrace(error, ResultError);
      }
      return error;
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
  if (platform === 'v8') {
    initialGetStackString = tameV8ErrorConstructor(
      OriginalError,
      InitialError,
      errorTaming,
      stackFiltering,
    );
  }
  return {
    '%InitialGetStackString%': initialGetStackString,
    '%InitialError%': InitialError,
    '%SharedError%': SharedError,
  };
}

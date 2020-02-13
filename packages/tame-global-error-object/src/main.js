const {
  getOwnPropertyDescriptor,
  defineProperty,
  getPrototypeOf,
  setPrototypeOf,
} = Object;

const { construct, apply } = Reflect;

/**
 * hasOwnProperty()
 * Mimics Object.prototype.hasOwnProperty which uses internally
 * GetOwnProperty: see https://tc39.es/ecma262/#sec-hasownproperty
 */
function hasOwnProperty(obj, prop) {
  return getOwnPropertyDescriptor(obj, prop) !== undefined;
}

function assert(condition, message) {
  if (!condition) {
    throw new TypeError(message);
  }
}

export function tameGlobalErrorObject() {
  // Tame static methods

  if (hasOwnProperty(Error, 'captureStackTrace')) {
    // Use a concise method to obtain a named function without constructor.
    const ErrorStatic = {
      captureStackTrace(targetObject, _constructorOpt) {
        // Creates a .stack property on targetObject,
        // which when accessed returns a string.
        Reflect.set(targetObject, 'stack', '');
      },
    };

    Error.captureStackTrace = ErrorStatic.captureStackTrace;

    // Validate that the value property has been replaced.
    const desc = getOwnPropertyDescriptor(Error, 'captureStackTrace');
    assert(
      desc.value === ErrorStatic.captureStackTrace,
      'Cannot tame Error.captureStackTrace',
    );
  }

  if (hasOwnProperty(Error, 'stackTraceLimit')) {
    defineProperty(Error, 'stackTraceLimit', {
      get() {
        return 0;
      },
      set() {
        /* ignored silently */
      },
      enumerable: false,
      configurable: true,
    });

    // Validate that the value property has been converted.
    const desc = getOwnPropertyDescriptor(Error, 'stackTraceLimit');
    assert(
      hasOwnProperty(desc, 'get') && hasOwnProperty(desc, 'set'),
      'Cannot tame Error.stackTraceLimit',
    );
  }
}

// Return the original unsafe Error constructor after installing an
// initially-safe replacement.
// Borrowed from
// https://github.com/Agoric/error-stack-shim/blob/master/src/getStack.js#L15
function replaceOriginalUnsafeError() {
  const UnsafeError = Error;
  function FakeError(...args) {
    if (new.target) {
      return construct(UnsafeError, args, new.target);
    }
    return apply(UnsafeError, this, args);
  }
  FakeError.prototype = UnsafeError.prototype;
  FakeError.prototype.constructor = FakeError;
  // eslint-disable-next-line no-global-assign
  Error = FakeError;

  [
    EvalError,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    URIError,
  ].forEach(err => {
    if (getPrototypeOf(err) === UnsafeError) {
      setPrototypeOf(err, FakeError);
    }
  });
  return UnsafeError;
}

// We eventually need three cases:
//    a. SES standard tamed, without these non-standard properties. This
//      should be the defautt, and so these properties should start out
//      absent from the whitelist.
//    b. SES kludge-tamed (needs a different name). This is what
//      tameGlobalErrorObject() currently does, where if the properties
//      are there, they are replaced with same replacements that
//      don't cause the observed errors under node.
//    c. unsafe-winterize, in order to preserve all its current support for
//      debugging under its v8-specific API, which is necessarily unsafe.
//      Because the Error constructor will be frozen, we need to do
//      "winterize" it, i.e., make sure that freezing doesn't break it.
// Currently we support only #b and #c, with #b being the default.
// Both #b and #c require the same adjustment of the whitelist. Thus
// we also omit them from the whitelist.
export function unsafeWinterizeGlobalErrorObject() {
  const UnsafeError = replaceOriginalUnsafeError();

  // Tame static methods

  if (hasOwnProperty(UnsafeError, 'captureStackTrace')) {
    // Use a concise method to obtain a named function without constructor.
    const ErrorStatic = {
      captureStackTrace(targetObject, constructorOpt) {
        UnsafeError.captureStackTrace(targetObject, constructorOpt);
      },
    };

    Error.captureStackTrace = ErrorStatic.captureStackTrace;

    // Validate that the value property has been replaced.
    const desc = getOwnPropertyDescriptor(Error, 'captureStackTrace');
    assert(
      desc.value === ErrorStatic.captureStackTrace,
      'Cannot tame Error.captureStackTrace',
    );
  }

  if (hasOwnProperty(UnsafeError, 'stackTraceLimit')) {
    defineProperty(Error, 'stackTraceLimit', {
      get() {
        return UnsafeError.stackTraceLimit;
      },
      set(newValue) {
        UnsafeError.stackTraceLimit = newValue;
      },
      enumerable: false,
      configurable: true,
    });

    // Validate that the value property has been converted.
    const desc = getOwnPropertyDescriptor(Error, 'stackTraceLimit');
    assert(
      hasOwnProperty(desc, 'get') && hasOwnProperty(desc, 'set'),
      'Cannot tame Error.stackTraceLimit',
    );
  }
}

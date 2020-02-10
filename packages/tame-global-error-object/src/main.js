const { freeze, getOwnPropertyDescriptor, defineProperty } = Object;

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

export default function tameGlobalErrorObject() {
  // Tame static methods

  if (hasOwnProperty(Error, 'captureStackTrace')) {
    const { captureStackTrace } = {
      captureStackTrace(targetObject, _constructorOpt) {
        // Creates a .stack property on targetObject,
        // which when accessed returns a string.
        Reflect.set(targetObject, 'stack', '');
      },
    };

    Error.captureStackTrace = captureStackTrace;

    // Validate that the value property has been replaced.
    const desc = getOwnPropertyDescriptor(Error, 'captureStackTrace');
    assert(
      desc.value === captureStackTrace,
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

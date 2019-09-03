
export default function getNamedIntrinsics(unsafeGlobal) {
  const { defineProperty, getOwnPropertyDescriptor } = Reflect;

  const globalPropertyNames = [
    // *** 18.1 Value Properties of the Global Object

    'Infinity',
    'NaN',
    'undefined',

    // *** 18.2 Function Properties of the Global Object

    'eval',
    'isFinite',
    'isNaN',
    'parseFloat',
    'parseInt',

    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',

    // *** 18.3 Constructor Properties of the Global Object

    'Array',
    'ArrayBuffer',
    'Boolean',
    'DataView',
    'Date',
    'Error',
    'EvalError',
    'Float32Array',
    'Float64Array',
    'Function',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Map',
    'Number',
    'Object',
    'Promise',
    'Proxy',
    'RangeError',
    'ReferenceError',
    'RegExp',
    'Set',
    // 'SharedArrayBuffer',  // removed on Jan 5, 2018
    'String',
    'Symbol',
    'SyntaxError',
    'TypeError',
    'Uint8Array',
    'Uint8ClampedArray',
    'Uint16Array',
    'Uint32Array',
    'URIError',
    'WeakMap',
    'WeakSet',

    // *** 18.4 Other Properties of the Global Object

    // 'Atomics', // removed on Jan 5, 2018
    'JSON',
    'Math',
    'Reflect',

    // *** Annex B

    'escape',
    'unescape',

    // *** ECMA-402

    'Intl',

    // *** ESNext

    // 'Realm' // Comes from createRealmGlobalObject()
  ];

  const namedIntrinsics = {};

  for (const name of globalPropertyNames) {
    const desc = getOwnPropertyDescriptor(unsafeGlobal, name);
    if (desc) {
      // Abort if an accessor is found on the unsafe global object
      // instead of a data property. We should never get into this
      // non standard situation.
      if ('get' in desc || 'set' in desc) {
        throw new TypeError(`unexpected accessor on global property: ${name}`);
      }

      defineProperty(namedIntrinsics, name, desc);
    }
  }

  return namedIntrinsics;
}

module.exports = {
  extends: ['plugin:@jessie.js/recommended'],
  plugins: ['@endo'],
  processor: '@jessie.js/use-jessie',
  env: {
    es6: true,
    node: false,
    commonjs: false,
  },
  // Allow what the SES-shim makes powerless. Co-maintain with
  // `universalPropertyNames` from `ses/src/permits.js`.
  // TODO align better with `universalPropertyNames` to make
  // co-maintenance easier.
  globals: {
    assert: 'readonly',
    console: 'readonly',
    Compartment: 'readonly',
    ModuleSource: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',

    // *** Constructor Properties of the Global Object
    Array: 'readonly',
    ArrayBuffer: 'readonly',
    BigInt: 'readonly',
    BigInt64Array: 'readonly',
    BigUint64Array: 'readonly',
    Boolean: 'readonly',
    DataView: 'readonly',
    EvalError: 'readonly',
    Float32Array: 'readonly',
    Float64Array: 'readonly',
    Int8Array: 'readonly',
    Int16Array: 'readonly',
    Int32Array: 'readonly',
    Map: 'readonly',
    Number: 'readonly',
    Object: 'readonly',
    Promise: 'readonly',
    Proxy: 'readonly',
    RangeError: 'readonly',
    ReferenceError: 'readonly',
    Set: 'readonly',
    String: 'readonly',
    Symbol: 'readonly',
    SyntaxError: 'readonly',
    TypeError: 'readonly',
    Uint8Array: 'readonly',
    Uint8ClampedArray: 'readonly',
    Uint16Array: 'readonly',
    Uint32Array: 'readonly',
    URIError: 'readonly',
    WeakMap: 'readonly',
    WeakSet: 'readonly',
    // *** Other Properties of the Global Object
    JSON: 'readonly',
    Reflect: 'readonly',
    // *** Annex B
    escape: 'readonly',
    unescape: 'readonly',
    // ESNext
    lockdown: 'readonly',
    harden: 'readonly',
    HandledPromise: 'readonly',
    // https://github.com/endojs/endo/issues/550
    AggregateError: 'readonly',
    // https://github.com/tc39/proposal-explicit-resource-management
    AsyncDisposableStack: 'readonly',
    DisposableStack: 'readonly',
    SuppressedError: 'readonly',

  },
  rules: {
    '@endo/assert-fail-as-throw': 'error',
    'guard-for-in': 'error',
    'no-self-compare': 'error',
  },
};

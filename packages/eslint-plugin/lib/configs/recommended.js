module.exports = {
  extends: ['plugin:@jessie.js/recommended'],
  plugins: ['@endo'],
  processor: '@jessie.js/use-jessie',
  env: {
    es6: true,
    node: false,
    commonjs: false,
  },
  globals: {
    assert: 'readonly',
    console: 'readonly',
    Compartment: 'readonly',
    StaticModuleRecord: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',

    // Allow what SES makes powerless, copied from its whitelist
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
  },
  rules: {
    '@endo/assert-fail-as-throw': 'error',
    'guard-for-in': 'error',
    // Agoric still uses Endo dependencies under an emulation of ESM we call RESM
    // because it is invoked with `node -r esm`.
    // RESM does not support ?? nor ?. operators, so we must avoid them expressly.
    '@endo/no-optional-chaining': 'error',
    '@endo/no-nullish-coalescing': 'error',
  },
};

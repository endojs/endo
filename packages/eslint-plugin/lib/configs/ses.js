// Some additional rules to ensure that SES and its dependencies are less
// vulnerable to corruption due to misbehavior of so-called vetted dependencies
// between initialization and lockdown.
// We forbid consulting globalThis after initialization, to the extent that is
// possible with a list of disallowed globals.
// We would much prefer to forbid accessing any free variables if we found a
// mechanism to do that in eslint.
// We also forbid method invocation on intrinsics, since these can be
// overridden between initialization and lockdown.
// We would forbid invoking any method or using syntax that has an internal
// polymorphic protocol if we practically could.
module.exports = {
  extends: ['plugin:@endo/internal'],
  rules: {
    'no-restricted-globals': [
      'error',
      'AggregateError',
      'Array',
      'ArrayBuffer',
      'Atomics',
      'BigInt',
      'BigInt64Array',
      'BigUint64Array',
      'Boolean',
      'Compartment',
      'DataView',
      'Date',
      'Error',
      'EvalError',
      'Float32Array',
      'Float64Array',
      'Function',
      'HandledPromise',
      'Int16Array',
      'Int32Array',
      'Int8Array',
      'JSON',
      'Map',
      'Math',
      'Number',
      'Object',
      'Promise',
      'Proxy',
      'RangeError',
      'ReferenceError',
      'Reflect',
      'RegExp',
      'Set',
      'SharedArrayBuffer',
      'String',
      'Symbol',
      'SyntaxError',
      'TypeError',
      'URIError',
      'Uint16Array',
      'Uint32Array',
      'Uint8Array',
      'Uint8ClampedArray',
      'WeakMap',
      'WeakSet',
      'assert',
      'decodeURI',
      'decodeURIComponent',
      'encodeURI',
      'encodeURIComponent',
      'escape',
      'eval',
      'globalThis',
      'isFinite',
      'isNaN',
      'lockdown',
      'parseFloat',
      'parseInt',
      'unescape',
    ],
    '@endo/no-polymorphic-call': 'error',
  },
  overrides: [
    {
      files: ['test/**/*.js', 'demos/**/*.js', 'scripts/**/*.js'],
      rules: {
        'no-restricted-globals': 'off',
        '@endo/no-polymorphic-call': 'off',
      },
    },
  ],
};

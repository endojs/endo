import test from 'tape';
import getRootNamedIntrinsics from '..';

// We need a duplicate of what is used in production
// as an independent refrerence.
const globalNames = [
  // *** 18.1 Value Properties of the Global Object

  // Ignore: those value properties are not intrinsics.

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
  // 'SharedArrayBuffer'  // removed on Jan 5, 2018
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

  // ESNext

  'globalThis',
  'Realm',
  'Evaluator',
];

test('namedIntrinsics', t => {
  const namedIntrinsics = getRootNamedIntrinsics();

  // eslint-disable-next-line no-new-func
  const global = Function('return this')();

  for (const name of globalNames) {
    // Assert when both are defined or undefined.
    t.equal(namedIntrinsics[name], global[name]);
  }

  t.end();
});

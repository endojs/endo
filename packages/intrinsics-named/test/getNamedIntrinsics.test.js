import tap from 'tap';
import sinon from 'sinon';
import getNamedIntrinsics from '../src/main.js';

const { test } = tap;

test('namedIntrinsics', t => {
  // We to duplicate this structure here as an
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
  ];

  // eslint-disable-next-line no-new-func
  const global = Function('return this')();
  const intrinsics = getNamedIntrinsics();

  for (const name of globalNames) {
    // Assert when both are defined or undefined.
    t.equal(intrinsics[name], global[name]);
  }

  t.end();
});

test('Intrinsics - values', t => {
  t.plan(6);

  // eslint-disable-next-line no-new-func
  const global = Function('return this;')();
  const intrinsics = getNamedIntrinsics();

  t.equal(intrinsics.Date, global.Date);
  t.equal(intrinsics.eval, global.eval);
  t.equal(intrinsics.Error, global.Error);
  t.equal(intrinsics.Function, global.Function);
  t.equal(intrinsics.JSON, global.JSON);
  t.equal(intrinsics.Math, global.Math);
});

test('Intrinsics - shims', t => {
  t.plan(2);

  // eslint-disable-next-line no-new-func
  const global = Function('return this;')();
  const mockDate = sinon.stub(global, 'Date').callsFake();
  const intrinsics = getNamedIntrinsics();

  t.equal(intrinsics.Date, mockDate); // Ensure shims are picked up
  t.equal(intrinsics.Date, global.Date);

  sinon.restore();
});

test('Intrinsics - global accessor throws', t => {
  t.plan(1);

  // eslint-disable-next-line no-new-func
  const global = Function('return this;')();
  const { JSON } = global;
  sinon.stub(global, 'JSON').get(() => JSON);

  t.throws(
    () => getNamedIntrinsics(),
    /Unexpected accessor on global property: JSON/,
  );

  sinon.restore();
});

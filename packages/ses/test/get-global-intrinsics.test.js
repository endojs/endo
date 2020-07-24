import tap from 'tap';
// import sinon from 'sinon';
// import { getGlobalIntrinsics } from '../src/intrinsics.js';

const { test } = tap;

test('getGlobalIntrinsics', t => {
  /* TODO
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

  const intrinsics = getGlobalIntrinsics();

  for (const name of globalNames) {
    // Assert when both are defined or undefined.
    t.equal(intrinsics[name], globalThis[name]);
  }

  t.end();
});

test('Intrinsics - values', t => {
  t.plan(6);

  const intrinsics = getGlobalIntrinsics();

  t.equal(intrinsics.Date, globalThis.Date);
  t.equal(intrinsics.eval, globalThis.eval);
  t.equal(intrinsics.Error, globalThis.Error);
  t.equal(intrinsics.Function, globalThis.Function);
  t.equal(intrinsics.JSON, globalThis.JSON);
  t.equal(intrinsics.Math, globalThis.Math);
});

test('Intrinsics - shims', t => {
  t.plan(2);

  const mockDate = sinon.stub(globalThis, 'Date').callsFake();
  const intrinsics = getGlobalIntrinsics();

  t.equal(intrinsics.Date, mockDate); // Ensure shims are picked up
  t.equal(intrinsics.Date, globalThis.Date);

  sinon.restore();
});

test('Intrinsics - global accessor throws', t => {
  t.plan(1);

  const { JSON } = globalThis;
  sinon.stub(globalThis, 'JSON').get(() => JSON);

  t.throws(
    () => getGlobalIntrinsics(),
    /Unexpected accessor on global property: JSON/,
  );

  sinon.restore();
});
*/
  t.end();
});

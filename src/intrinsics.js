// TODO this should be provided by the realm.
import { assert } from './assertions';
import { getOwnPropertyDescriptor, objectHasOwnProperty } from './commons';

/**
 * namedIntrinsics
 * The following subset of the named intrinsics are own properties of the global
 * object. The remaining named intrinsics (from table 7) are reacheable from the
 * globalIntrinsics by simple property traversal.
 */
const namedIntrinsics = [
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

  'Realm',
  'Evaluator',
];

/**
 * getGlobalObject()
 * Produce a reliable global object.
 * see https://github.com/tc39/test262/blob/master/harness/fnGlobalObject.js
 */
function getGlobalObject() {
  // eslint-disable-next-line no-new-func
  return Function('return this;')();
}

/**
 * createIntrinsics()
 * Return a record-like object similar to the [[intrinsics]] slot of the
 * realmRec in the ES specifications except that for simpification:
 * - we only return the intrinsics that are own properties of the global object.
 * - we use the name of the associated global object property
 *   (usually, the intrinsic name is '%' + global property name + '%').
 */
export function createIntrinsics() {
  const intrinsics = { __proto__: null };

  const globalObject = getGlobalObject(); // Used as the source of intrinsics.

  for (const name of namedIntrinsics) {
    const desc = getOwnPropertyDescriptor(globalObject, name);
    if (desc) {
      // Abort if an accessor is found on the unsafe global object
      // instead of a regular data property. We should never get into this
      // non standard situation.
      assert(
        objectHasOwnProperty(desc, 'value'),
        `unexpected accessor on global property: ${name}`,
      );
      intrinsics[name] = desc.value;
    }
  }

  return intrinsics;
}

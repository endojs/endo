// The global intrinsics are the root named intrinsics (intrinsics that are
// direct properties of the global object).
//
// getGlobalIntrinsics(): Object
//
//  Return a record-like object similar to the [[intrinsics]] slot of the
//  realmRec in the ES specifications except for the following simpifications:
//
//  - we only returns the intrinsics that correspond to the global object
//    properties listed in 18.2, 18.3, or 18.4 of ES specifications.
//
//  - we use the name of the associated global object property instead of the
//    intrinsic name (usually, `<intrinsic name> === '%' + <global property
//    name>+ '%'`).
//
// Assumptions
//
// The intrinsic names correspond to the object names with "%" added as prefix and suffix, i.e. the intrinsic "%Object%" is equal to the global object property "Object".
const { getOwnPropertyDescriptor } = Object;

/**
 * globalIntrinsicNames
 * The following subset contains only the intrinsics that correspond to the
 * global object properties listed in 18.2, 18.3, or 18.4 on ES specifications.
 */
const globalIntrinsicNames = [
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
  'Compartment',
  'harden',
];

/**
 * getGlobalIntrinsics()
 * Return a record-like object similar to the [[intrinsics]] slot of the
 * realmRec in the ES specifications except for this simpification:
 * - we only return the intrinsics that are own properties of the global object.
 * - we use the name of the associated global object property
 *   (usually, the intrinsic name is '%' + global property name + '%').
 */
export function getGlobalIntrinsics() {
  const result = { __proto__: null };

  for (const name of globalIntrinsicNames) {
    const desc = getOwnPropertyDescriptor(globalThis, name);
    if (desc) {
      // Abort if an accessor is found on the unsafe global object
      // instead of a data property. We should never get into this
      // non standard situation.
      if ('get' in desc || 'set' in desc) {
        throw new TypeError(`Unexpected accessor on global property: ${name}`);
      }

      result[name] = desc.value;
    }
  }

  return result;
}

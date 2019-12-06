import { assert } from './assertions';
import { defineProperties, objectHasOwnProperty } from './commons';
import { createEvalFunction } from './evalFunction';
import { createFunctionConstructor } from './functionConstructor';

/**
 * globalPropertyNames
 * Properties of the global object.
 */
const globalPropertyNames = [
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

/**
 * createGlobalObject()
 * Create new global object using a process similar to ECMA specifications
 * (portions of SetRealmGlobalObject and SetDefaultGlobalBindings). The new
 * global object is not part of the realm record.
 */
export function createGlobalObject(realmRec, { globalTransforms }) {
  const globalObject = {};

  // Immutable properties. Those values are shared between all realms.
  // *** 18.1 Value Properties of the Global Object
  const descs = {
    Infinity: {
      value: Infinity,
      enumerable: false,
    },
    NaN: {
      value: NaN,
      enumerable: false,
    },
    undefined: {
      value: undefined,
      enumerable: false,
    },
  };

  // *** 18.2, 18.3, 18.4 etc.
  for (const name of globalPropertyNames) {
    if (!objectHasOwnProperty(realmRec.intrinsics, name)) {
      // only create the global is the intrinsic exists.
      // eslint-disable-next-line no-continue
      continue;
    }

    let value;
    switch (name) {
      case 'eval':
        // Use an evaluator-specific instance of eval.
        value = createEvalFunction(realmRec, globalObject, {
          globalTransforms,
        });
        break;

      case 'Function':
        // Use an evaluator-specific instance of Function.
        value = createFunctionConstructor(realmRec, globalObject, {
          globalTransforms,
        });
        break;

      case 'globalThis':
        // Use an evaluator-specific circular reference.
        value = globalObject;
        break;

      default:
        value = realmRec.intrinsics[name];
    }

    descs[name] = {
      value,
      configurable: true,
      writable: true,
      enumerable: false,
    };
  }

  // Define properties all at once.
  defineProperties(globalObject, descs);

  assert(
    globalObject.eval !== realmRec.intrinsics.eval,
    'eval on global object',
  );
  assert(
    globalObject.Function !== realmRec.intrinsics.Function,
    'Function on global object',
  );

  return globalObject;
}

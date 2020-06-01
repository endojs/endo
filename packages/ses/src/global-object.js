import { assert } from './assertions.js';
import { defineProperties, objectHasOwnProperty } from './commons.js';
import { makeEvalFunction } from './make-eval-function.js';
import { makeFunctionConstructor } from './make-function-constructor.js';
import { globalNames } from './whitelist.js';

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
  for (const name of globalNames) {
    if (!objectHasOwnProperty(realmRec.intrinsics, name)) {
      // only create the global if the intrinsic exists.
      // eslint-disable-next-line no-continue
      continue;
    }

    let value;
    switch (name) {
      case 'eval':
        // Use an evaluator-specific instance of eval.
        value = makeEvalFunction(realmRec, globalObject, {
          globalTransforms,
        });
        break;

      case 'Function':
        // Use an evaluator-specific instance of Function.
        value = makeFunctionConstructor(realmRec, globalObject, {
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

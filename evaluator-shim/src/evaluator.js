import { defineProperties } from './commons';
import { getPrivateFields, setPrivateFields } from './privateFields';
import { createGlobalObject } from './globalObject';
import { performEval } from './evaluate';
import { getCurrentRealmRec } from './realmRec';

// TODO this should be provided by the realm.
// Capture the current realm record before anything gets modified.
const realmRec = getCurrentRealmRec();

/**
 * Evaluator()
 * The Evaluator constructor is a global. A host that wants to execute
 * code in a context bound to a new global creates a new evaluator.
 */
export default class Evaluator {
  constructor(options = {}) {
    // Extract options, and shallow-clone transforms.
    const { transforms = [] } = options;
    const globalTransforms = [...transforms];

    const globalObject = createGlobalObject(realmRec, { globalTransforms });

    setPrivateFields(this, {
      globalObject,
      globalTransforms,
    });
  }

  get global() {
    const { globalObject } = getPrivateFields(this);
    return globalObject;
  }

  /**
   * The options are:
   * "x": the source text of a program to execute.
   * "endowments": a dictionary of globals to make available in the evaluator.
   */
  evaluateScript(x, endowments = {}, options = {}) {
    // Perform this check first to avoid unecessary sanitizing.
    if (typeof x !== 'string') {
      throw new TypeError(
        'first argument of evaluateScript() must be a string',
      );
    }

    // Extract options, and shallow-clone transforms.
    const { transforms = [], sloppyGlobalsMode = false } = options;
    const localTransforms = [...transforms];

    const { globalTransforms, globalObject } = getPrivateFields(this);
    return performEval(realmRec, x, globalObject, endowments, {
      globalTransforms,
      localTransforms,
      sloppyGlobalsMode,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  toString() {
    return '[object Evaluator]';
  }

  static toString() {
    return 'function Evaluator() { [shim code] }';
  }
}

// Add the Evaluator to the other intrinsics so it can be handled by
// the general case.
defineProperties(realmRec.intrinsics, {
  Evaluator: {
    value: Evaluator,
    configurable: true,
    writable: true,
    enumerable: false,
  },
});

import { defineProperties } from './commons.js';
import { createGlobalObject } from './globalObject.js';
import { performEval } from './evaluate.js';
import { getCurrentRealmRec } from './realmRec.js';

// TODO this should be provided by the realm.
// Capture the current realm record before anything gets modified.
const realmRec = getCurrentRealmRec();

/**
 * Evaluator()
 * The Evaluator constructor is a global. A host that wants to execute
 * code in a context bound to a new global creates a new evaluator.
 */
export default class Evaluator {
  #globalTransforms;

  #globalObject;

  constructor(options = {}) {
    // Extract options, and shallow-clone transforms.
    const { transforms = [] } = options;
    this.#globalTransforms = [...transforms];

    this.#globalObject = createGlobalObject(realmRec, {
      globalTransforms: this.#globalTransforms,
    });
  }

  get global() {
    return this.#globalObject;
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

    return performEval(realmRec, x, this.#globalObject, endowments, {
      globalTransforms: this.#globalTransforms,
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

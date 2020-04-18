import { assign } from './commons.js';
import { createGlobalObject } from './global-object.js';
import { performEval } from './evaluate.js';
import { getCurrentRealmRec } from './realm-rec.js';

/**
 * Compartment()
 * The Compartment constructor is a global. A host that wants to execute
 * code in a context bound to a new global creates a new compartment.
 */
const privateFields = new WeakMap();

export class Compartment {
  constructor(endowments, modules, options = {}) {
    // Extract options, and shallow-clone transforms.
    const { transforms = [] } = options;
    const globalTransforms = [...transforms];

    const realmRec = getCurrentRealmRec();
    const globalObject = createGlobalObject(realmRec, {
      globalTransforms,
    });

    assign(globalObject, endowments);

    privateFields.set(this, {
      globalTransforms,
      globalObject,
    });
  }

  get global() {
    return privateFields.get(this).globalObject;
  }

  /**
   * The options are:
   * "x": the source text of a program to execute.
   */
  evaluate(x, options = {}) {
    // Perform this check first to avoid unecessary sanitizing.
    if (typeof x !== 'string') {
      throw new TypeError('first argument of evaluate() must be a string');
    }

    // Extract options, and shallow-clone transforms.
    const {
      endowments = {},
      transforms = [],
      sloppyGlobalsMode = false,
    } = options;
    const localTransforms = [...transforms];

    const { globalTransforms, globalObject } = privateFields.get(this);
    const realmRec = getCurrentRealmRec();
    return performEval(realmRec, x, globalObject, endowments, {
      globalTransforms,
      localTransforms,
      sloppyGlobalsMode,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  toString() {
    return '[object Compartment]';
  }

  static toString() {
    return 'function Compartment() { [shim code] }';
  }
}

// @ts-check

// This module exports both Compartment and StaticModuleRecord because they
// communicate through the moduleAnalyses private side-table.
import {
  assign,
  create,
  defineProperties,
  freeze,
  getOwnPropertyNames,
  getOwnPropertyDescriptors,
} from './commons.js';
import { initGlobalObject } from './global-object.js';
import { performEval } from './evaluate.js';
import { isValidIdentifierName } from './scope-constants.js';
import { sharedGlobalPropertyNames } from './whitelist.js';
import { InertCompartment } from './inert.js';
import {
  evadeHtmlCommentTest,
  evadeImportExpressionTest,
  rejectSomeDirectEvalExpressions,
} from './transforms.js';

// privateFields captures the private state for each compartment.
const privateFields = new WeakMap();

/**
 * @typedef {(source: string) => string} Transform
 */

export const CompartmentPrototype = {
  constructor: InertCompartment,

  get globalThis() {
    return privateFields.get(this).globalObject;
  },

  get name() {
    return privateFields.get(this).name;
  },

  /**
   * @param {string} source is a JavaScript program grammar construction.
   * @param {Object} [options]
   * @param {Array<Transform>} [options.transforms]
   * @param {boolean} [options.sloppyGlobalsMode]
   * @param {Object} [options.__moduleShimLexicals__]
   * @param {boolean} [options.__evadeHtmlCommentTest__]
   * @param {boolean} [options.__evadeImportExpressionTest__]
   * @param {boolean} [options.__rejectSomeDirectEvalExpressions__]
   */
  evaluate(source, options = {}) {
    // Perform this check first to avoid unecessary sanitizing.
    // TODO Maybe relax string check and coerce instead:
    // https://github.com/tc39/proposal-dynamic-code-brand-checks
    if (typeof source !== 'string') {
      throw new TypeError('first argument of evaluate() must be a string');
    }

    // Extract options, and shallow-clone transforms.
    const {
      transforms = [],
      sloppyGlobalsMode = false,
      __moduleShimLexicals__ = undefined,
      __evadeHtmlCommentTest__ = false,
      __evadeImportExpressionTest__ = false,
      __rejectSomeDirectEvalExpressions__ = true, // Note default on
    } = options;
    const localTransforms = [...transforms];
    if (__evadeHtmlCommentTest__ === true) {
      localTransforms.push(evadeHtmlCommentTest);
    }
    if (__evadeImportExpressionTest__ === true) {
      localTransforms.push(evadeImportExpressionTest);
    }
    if (__rejectSomeDirectEvalExpressions__ === true) {
      localTransforms.push(rejectSomeDirectEvalExpressions);
    }

    const compartmentFields = privateFields.get(this);
    let { globalTransforms } = compartmentFields;
    const {
      globalObject,
      globalLexicals,
      knownScopeProxies,
    } = compartmentFields;

    let localObject = globalLexicals;
    if (__moduleShimLexicals__ !== undefined) {
      // When using `evaluate` for ESM modules, as should only occur from the
      // module-shim's module-instance.js, we do not reveal the SES-shim's
      // module-to-program translation, as this is not standardizable behavior.
      // However, the `localTransforms` will come from the `__shimTransforms__`
      // Compartment option in this case, which is a non-standardizable escape
      // hatch so programs designed specifically for the SES-shim
      // implementation may opt-in to use the same transforms for `evaluate`
      // and `import`, at the expense of being tightly coupled to SES-shim.
      globalTransforms = undefined;

      localObject = create(null, getOwnPropertyDescriptors(globalLexicals));
      defineProperties(
        localObject,
        getOwnPropertyDescriptors(__moduleShimLexicals__),
      );
    }

    return performEval(source, globalObject, localObject, {
      globalTransforms,
      localTransforms,
      sloppyGlobalsMode,
      knownScopeProxies,
    });
  },

  toString() {
    return '[object Compartment]';
  },

  /* eslint-disable-next-line no-underscore-dangle */
  __isKnownScopeProxy__(value) {
    return privateFields.get(this).knownScopeProxies.has(value);
  },
};

defineProperties(InertCompartment, {
  prototype: { value: CompartmentPrototype },
});

/**
 * @callback CompartmentConstructor
 * Each Compartment constructor is a global. A host that wants to execute
 * code in a context bound to a new global creates a new compartment.
 *
 * @param {Object} endowments
 * @param {Object} _moduleMap
 * @param {Object} [options]
 * @param {string} [options.name]
 * @param {Array<Transform>} [options.transforms]
 * @param {Array<Transform>} [options.__shimTransforms__]
 * @param {Object} [options.globalLexicals]
 */

/**
 * @callback MakeCompartmentConstructor
 * @param {MakeCompartmentConstructor} targetMakeCompartmentConstructor
 * @param {Object} intrinsics
 * @param {(object: Object) => void} nativeBrander
 * @returns {CompartmentConstructor}
 */

/** @type {MakeCompartmentConstructor} */
export const makeCompartmentConstructor = (
  targetMakeCompartmentConstructor,
  intrinsics,
  nativeBrander,
) => {
  /** @type {CompartmentConstructor} */
  function Compartment(endowments = {}, _moduleMap = {}, options = {}) {
    if (new.target === undefined) {
      throw new TypeError(
        "Class constructor Compartment cannot be invoked without 'new'",
      );
    }

    // Extract options, and shallow-clone transforms.
    const {
      name = '<unknown>',
      transforms = [],
      __shimTransforms__ = [],
      globalLexicals = {},
    } = options;
    const globalTransforms = [...transforms, ...__shimTransforms__];

    const globalObject = {};
    initGlobalObject(
      globalObject,
      intrinsics,
      sharedGlobalPropertyNames,
      targetMakeCompartmentConstructor,
      this.constructor.prototype,
      {
        globalTransforms,
        nativeBrander,
      },
    );

    assign(globalObject, endowments);

    const invalidNames = getOwnPropertyNames(globalLexicals).filter(
      identifier => !isValidIdentifierName(identifier),
    );
    if (invalidNames.length) {
      throw new Error(
        `Cannot create compartment with invalid names for global lexicals: ${invalidNames.join(
          ', ',
        )}; these names would not be lexically mentionable`,
      );
    }

    const knownScopeProxies = new WeakSet();
    privateFields.set(this, {
      name,
      globalTransforms,
      globalObject,
      knownScopeProxies,
      // The caller continues to own the globalLexicals object they passed to
      // the compartment constructor, but the compartment only respects the
      // original values and they are constants in the scope of evaluated
      // programs and executed modules.
      // This shallow copy captures only the values of enumerable own
      // properties, erasing accessors.
      // The snapshot is frozen to ensure that the properties are immutable
      // when transferred-by-property-descriptor onto local scope objects.
      globalLexicals: freeze({ ...globalLexicals }),
    });
  }

  Compartment.prototype = CompartmentPrototype;

  return Compartment;
};

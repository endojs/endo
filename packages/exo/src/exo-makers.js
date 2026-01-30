import harden from '@endo/harden';
import { objectMap } from '@endo/common/object-map.js';
import { environmentOptionsListHas } from '@endo/env-options';

import { Fail, q } from '@endo/errors';
import {
  getMethodGuardPayload,
  getNamedMethodGuards,
  keyEQ,
} from '@endo/patterns';
import { defendPrototype, defendPrototypeKit } from './exo-tools.js';
import { GET_INTERFACE_GUARD } from './get-interface.js';

/**
 * @import {LooseProseTemplate, ProseTemplateTag} from '@endo/patterns';
 * @import {Amplify, ExoClassKitMethods, ExoClassMethods, FarClassOptions, Guarded, GuardedKit, ExoClassInterfaceGuardKit, IsInstance, KitContext, ExoClassInterfaceGuard, Methods, FacetName} from './types.js';
 */

const { create, seal, freeze, defineProperty, values } = Object;

// Turn on to give each exo instance its own toStringTag value.
const LABEL_INSTANCES = environmentOptionsListHas('DEBUG', 'label-instances');

/**
 * @template {{}} T
 * @param {T} proto
 * @param {number} instanceCount
 * @returns {T}
 */
const makeSelf = (proto, instanceCount) => {
  const self = create(proto);
  if (LABEL_INSTANCES) {
    defineProperty(self, Symbol.toStringTag, {
      value: `${proto[Symbol.toStringTag]}#${instanceCount}`,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
  return harden(self);
};

/** @type {Record<PropertyKey, never>} */
const emptyRecord = harden({});

/**
 * When calling `defineDurableKind` and
 * its siblings, used as the `init` function argument to indicate that the
 * state record of the (virtual/durable) instances of the kind/exoClass
 * should be empty, and that the returned maker function should have zero
 * parameters.
 */
export const initEmpty = () => emptyRecord;

/**
 * @template {(...args: any[]) => any} I init function
 * @template {Methods} M methods
 * @param {string} tag
 * @param {ExoClassInterfaceGuard<M> | undefined} interfaceGuard
 * @param {I} init
 * @param {ExoClassMethods<M, I>} methods
 * @param {FarClassOptions<import('./types.js').ClassContext<ReturnType<I>, M>>} [options]
 * @returns {(...args: Parameters<I>) => Guarded<M>}
 */
export const defineExoClass = (
  tag,
  interfaceGuard,
  init,
  methods,
  options = {},
) => {
  harden(methods);
  const {
    finish = undefined,
    receiveAmplifier = undefined,
    receiveInstanceTester = undefined,
  } = options;
  receiveAmplifier === undefined ||
    Fail`Only facets of an exo class kit can be amplified ${q(tag)}`;

  /** @type {WeakMap<M, import('./types.js').ClassContext<ReturnType<I>, M>>} */
  const contextMap = new WeakMap();
  const proto = defendPrototype(
    tag,
    self => /** @type {any} */ (contextMap.get(self)),
    methods,
    true,
    interfaceGuard,
  );
  let instanceCount = 0;
  /**
   * @param  {Parameters<I>} args
   */
  const makeInstance = (...args) => {
    // Be careful not to freeze the state record
    const state = seal(init(...args));
    instanceCount += 1;
    const self = makeSelf(proto, instanceCount);

    // Be careful not to freeze the state record
    /** @type {import('./types.js').ClassContext<ReturnType<I>,M>} */
    const context = freeze({ state, self });
    contextMap.set(self, context);
    if (finish) {
      finish(context);
    }
    return self;
  };

  if (receiveInstanceTester) {
    /** @type {IsInstance} */
    const isInstance = (exo, facetName = undefined) => {
      facetName === undefined ||
        Fail`facetName can only be used with an exo class kit: ${q(
          tag,
        )} has no facet ${q(facetName)}`;
      return contextMap.has(exo);
    };
    harden(isInstance);
    receiveInstanceTester(isInstance);
  }

  return harden(makeInstance);
};
harden(defineExoClass);

/**
 * @template {(...args: any[]) => any} I init function
 * @template {Record<FacetName, Methods>} F facet methods
 * @param {string} tag
 * @param {ExoClassInterfaceGuardKit<F> | undefined } interfaceGuardKit
 * @param {I} init
 * @param {ExoClassKitMethods<F, I>} methodsKit
 * @param {FarClassOptions<
 *   KitContext<ReturnType<I>, GuardedKit<F>>,
 *   GuardedKit<F>
 * >} [options]
 * @returns {(...args: Parameters<I>) => GuardedKit<F>}
 */
export const defineExoClassKit = (
  tag,
  interfaceGuardKit,
  init,
  methodsKit,
  options = {},
) => {
  harden(methodsKit);
  const {
    finish = undefined,
    receiveAmplifier = undefined,
    receiveInstanceTester = undefined,
  } = options;
  const contextMapKit = objectMap(methodsKit, () => new WeakMap());
  const getContextKit = objectMap(
    contextMapKit,
    contextMap => facet => contextMap.get(facet),
  );
  const prototypeKit = defendPrototypeKit(
    tag,
    getContextKit,
    methodsKit,
    true,
    interfaceGuardKit,
  );
  let instanceCount = 0;
  /**
   * @param {Parameters<I>} args
   */
  const makeInstanceKit = (...args) => {
    // Be careful not to freeze the state record
    const state = seal(init(...args));
    // Don't freeze context until we add facets
    /** @type {{ state: ReturnType<I>, facets: any }} */
    const context = { state, facets: null };
    instanceCount += 1;
    const facets = objectMap(prototypeKit, (proto, facetName) => {
      const self = makeSelf(proto, instanceCount);
      contextMapKit[facetName].set(self, context);
      return self;
    });
    context.facets = facets;
    // Be careful not to freeze the state record
    freeze(context);
    if (finish) {
      finish(context);
    }
    return /** @type {GuardedKit<F>} */ (context.facets);
  };

  if (receiveAmplifier) {
    /** @type {Amplify} */
    const amplify = exoFacet => {
      for (const contextMap of values(contextMapKit)) {
        if (contextMap.has(exoFacet)) {
          const { facets } = contextMap.get(exoFacet);
          return facets;
        }
      }
      throw Fail`Must be a facet of ${q(tag)}: ${exoFacet}`;
    };
    harden(amplify);
    receiveAmplifier(amplify);
  }

  if (receiveInstanceTester) {
    /** @type {IsInstance} */
    const isInstance = (exoFacet, facetName = undefined) => {
      if (facetName === undefined) {
        return values(contextMapKit).some(contextMap =>
          contextMap.has(exoFacet),
        );
      }
      assert.typeof(facetName, 'string');
      const contextMap = contextMapKit[facetName];
      contextMap !== undefined ||
        Fail`exo class kit ${q(tag)} has no facet named ${q(facetName)}`;
      return contextMap.has(exoFacet);
    };
    harden(isInstance);
    receiveInstanceTester(isInstance);
  }

  return harden(makeInstanceKit);
};
harden(defineExoClassKit);

/**
 * Return a singleton instance of an internal ExoClass with no state fields.
 *
 * @template {Methods} M
 * @param {string} tag
 * @param {import('@endo/patterns').InterfaceGuard<{
 *   [K in keyof M]: import('@endo/patterns').MethodGuard
 * }> | undefined} interfaceGuard CAVEAT: static typing does not yet support `callWhen` transformation
 * @param {ExoClassMethods<M, typeof initEmpty>} methods
 * @param {FarClassOptions<import('./types.js').ClassContext<{}, M>>} [options]
 * @returns {Guarded<M>}
 */
export const makeExo = (tag, interfaceGuard, methods, options = undefined) => {
  const makeInstance = defineExoClass(
    tag,
    interfaceGuard,
    initEmpty,
    methods,
    options,
  );
  return makeInstance();
};
harden(makeExo);

/**
 * A call template is like an args template except that the initial segment
 * starts with a "verb", which are the initial block of non-whitespace
 * characters terminated by that first whitespace break, if present. This is
 * used as the method name (aka "selector").
 * Then, everything in that first segment after the first whitespace break is
 * taken to be the first segment of the args template.
 *
 * This regexp is exported only for testing.
 * The `s` modifier on the end of the regexp causes `.` to match anything,
 * including newlines.
 * The `u` modifier say to operate at the level of abstraction of unicode
 * characters, i.e., unicode code points rather tha UTF-16 code units.
 */
export const callStartPattern = /^([^\s]+)(?:\s+(.*))?$/s;
harden(callStartPattern);

/**
 * @param {object} target
 * @param {ProseTemplateTag} [optResultTag]
 * @param {(complaint: string) => void} [warn]
 * TODO `warn`, like `Rejectors`, should probably be an optional template
 * literal tag function rather than just a function of a string.
 */
export const proseCall =
  (target, optResultTag = undefined, warn = _ => {}) =>
  /**
   * @param {LooseProseTemplate} callTemplate
   *   Like an argsTemplate except the characters preceding the first space
   *   are peeled off and used as the method name.
   * @param {...any[]} args
   */
  (callTemplate, ...args) => {
    const [callTemplateSegment, ...restArgsTemplate] = callTemplate;
    const matches = callStartPattern.exec(callTemplateSegment);
    if (matches === null) {
      throw Fail`first segment does not match expected pattern`;
    }
    const [_, verb, argsTemplateSegment] = matches;
    let optResultTemplate;

    // This whole conditional is only for advisory diagnostics,
    // and to capture `optResultTemplate` if there is one.
    const targetGuard = target[GET_INTERFACE_GUARD]?.();
    if (targetGuard === undefined) {
      warn('no target guard');
    } else {
      const methodGuard = getNamedMethodGuards(targetGuard)[verb];
      if (!methodGuard) {
        warn('no method guard of that name');
      } else {
        const {
          argsTemplate: paramsTemplate = undefined,
          resultTemplate = undefined,
        } = getMethodGuardPayload(methodGuard);
        optResultTemplate = resultTemplate;
        if (!paramsTemplate) {
          warn('method guard has no prose argsTemplate');
        } else {
          const argsTemplate = harden([
            argsTemplateSegment,
            ...restArgsTemplate,
          ]);
          if (!keyEQ(argsTemplate, paramsTemplate)) {
            warn('args template differs from method guard expectation');
          }
        }
      }
    }

    // Whether any of those advisory diagnostic conditions occurrered on not
    const result = target[verb](...args);
    if (optResultTag && optResultTemplate) {
      return optResultTag(optResultTemplate, result);
    } else {
      return result;
    }
  };
harden(proseCall);

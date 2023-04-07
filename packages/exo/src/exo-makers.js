import { objectMap } from '@endo/patterns';

import { defendPrototype, defendPrototypeKit } from './exo-tools.js';

const { seal, freeze } = Object;

const emptyRecord = harden({});

/**
 * When calling `defineDurableKind` and
 * its siblings, used as the `init` function argument to indicate that the
 * state record of the (virtual/durable) instances of the kind/exoClass
 * should be empty, and that the returned maker function should have zero
 * parameters.
 *
 * @returns {{}}
 */
export const initEmpty = () => emptyRecord;

/**
 * @typedef {import('./exo-tools.js').FacetName} FacetName
 * @typedef {import('./exo-tools.js').Methods} Methods
 */

/**
 * @template [S = any]
 * @template {Methods} [M = any]
 * @typedef {import('./exo-tools.js').ClassContext} ClassContext
 */

/**
 * @template [S = any]
 * @template {Record<FacetName, Methods>} [F = any]
 * @typedef {import('./exo-tools.js').KitContext} KitContext
 */

/**
 * @typedef {{[name: string]: Pattern}} StateShape
 * It looks like a copyRecord pattern, but the interpretation is different.
 * Each property is distinct, is checked and changed separately.
 */

/**
 * @template C
 * @typedef {object} FarClassOptions
 * @property {(context: C) => void} [finish]
 * @property {StateShape} [stateShape]
 */

/**
 * @template {(...args: any[]) => any} I init function
 * @template {Methods} M methods
 * @param {string} tag
 * @param {any} interfaceGuard
 * @param {I} init
 * @param {M & ThisType<{ self: M, state: ReturnType<I> }>} methods
 * @param {FarClassOptions<ClassContext<ReturnType<I>, M>>} [options]
 * @returns {(...args: Parameters<I>) => (M & import('@endo/eventual-send').RemotableBrand<{}, M>)}
 */
export const defineExoClass = (
  tag,
  interfaceGuard,
  init,
  methods,
  { finish = undefined } = {},
) => {
  /** @type {WeakMap<M,ClassContext<ReturnType<I>, M>>} */
  const contextMap = new WeakMap();
  const prototype = defendPrototype(
    tag,
    self => /** @type {any} */ (contextMap.get(self)),
    methods,
    true,
    interfaceGuard,
  );
  /**
   * @param  {Parameters<I>} args
   */
  const makeInstance = (...args) => {
    // Be careful not to freeze the state record
    const state = seal(init(...args));
    /** @type {M} */
    // @ts-expect-error could be instantiated with different subtype
    const self = harden({ __proto__: prototype });
    // Be careful not to freeze the state record
    /** @type {ClassContext<ReturnType<I>,M>} */
    const context = freeze({ state, self });
    contextMap.set(self, context);
    if (finish) {
      finish(context);
    }
    return self;
  };
  // @ts-expect-error could be instantiated with different subtype
  return harden(makeInstance);
};
harden(defineExoClass);

/**
 * @template {(...args: any[]) => any} I init function
 * @template {Record<FacetName, Methods>} F facet methods
 * @param {string} tag
 * @param {any} interfaceGuardKit
 * @param {I} init
 * @param {F & ThisType<{ facets: F, state: ReturnType<I> }> } methodsKit
 * @param {FarClassOptions<KitContext<ReturnType<I>,F>>} [options]
 * @returns {(...args: Parameters<I>) => F}
 */
export const defineExoClassKit = (
  tag,
  interfaceGuardKit,
  init,
  methodsKit,
  { finish = undefined } = {},
) => {
  const contextMapKit = objectMap(methodsKit, () => new WeakMap());
  const getContextKit = objectMap(
    methodsKit,
    (_v, name) => facet => contextMapKit[name].get(facet),
  );
  const prototypeKit = defendPrototypeKit(
    tag,
    getContextKit,
    methodsKit,
    true,
    interfaceGuardKit,
  );
  /**
   * @param {Parameters<I>} args
   */
  const makeInstanceKit = (...args) => {
    // Be careful not to freeze the state record
    const state = seal(init(...args));
    // Don't freeze context until we add facets
    const context = { state };
    const facets = objectMap(prototypeKit, (prototype, facetName) => {
      const self = harden({ __proto__: prototype });
      contextMapKit[facetName].set(self, context);
      return self;
    });
    context.facets = facets;
    // Be careful not to freeze the state record
    freeze(context);
    if (finish) {
      // @ts-expect-error `facets` was added
      finish(context);
    }
    return facets;
  };
  return harden(makeInstanceKit);
};
harden(defineExoClassKit);

/**
 * @template {Methods} T
 * @param {string} tag
 * @param {InterfaceGuard | undefined} interfaceGuard CAVEAT: static typing does not yet support `callWhen` transformation
 * @param {T} methods
 * @param {FarClassOptions<ClassContext<{},T>>} [options]
 * @returns {T & import('@endo/eventual-send').RemotableBrand<{}, T>}
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

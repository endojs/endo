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
 * @template [S = any]
 * @template [T = any]
 * @typedef {object} Context
 * @property {S} state
 * @property {T} self
 */

/**
 * @template A args to init
 * @template S state from init
 * @template {Record<string | symbol, CallableFunction>} T methods
 * @param {string} tag
 * @param {any} interfaceGuard
 * @param {(...args: A[]) => S} init
 * @param {T & ThisType<{ self: T, state: S }>} methods
 * @param {object} [options]
 * @returns {(...args: A[]) => (T & import('@endo/eventual-send').RemotableBrand<{}, T>)}
 */
export const defineExoClass = (
  tag,
  interfaceGuard,
  init,
  methods,
  options = undefined,
) => {
  /** @type {WeakMap<T,Context<S, T>>} */
  const contextMap = new WeakMap();
  const prototype = defendPrototype(
    tag,
    self => contextMap.get(self),
    methods,
    true,
    interfaceGuard,
  );
  const makeInstance = (...args) => {
    // Be careful not to freeze the state record
    const state = seal(init(...args));
    /** @type {T} */
    // @ts-expect-error could be instantiated with different subtype
    const self = harden({ __proto__: prototype });
    // Be careful not to freeze the state record
    /** @type {Context<S,T>} */
    const context = freeze({ state, self });
    contextMap.set(self, context);
    if (options) {
      const { finish = undefined } = options;
      if (finish) {
        finish(context);
      }
    }
    return self;
  };
  // @ts-expect-error could be instantiated with different subtype
  return harden(makeInstance);
};
harden(defineExoClass);

/**
 * @template A args to init
 * @template S state from init
 * @template {Record<string, Record<string | symbol, CallableFunction>>} F methods
 * @param {string} tag
 * @param {any} interfaceGuardKit
 * @param {(...args: A[]) => S} init
 * @param {F & ThisType<{ facets: F, state: S }> } methodsKit
 * @param {object} [options]
 * @returns {(...args: A[]) => F}
 */
export const defineExoClassKit = (
  tag,
  interfaceGuardKit,
  init,
  methodsKit,
  options = undefined,
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
    if (options) {
      const { finish = undefined } = options;
      if (finish) {
        finish(context);
      }
    }
    return facets;
  };
  return harden(makeInstanceKit);
};
harden(defineExoClassKit);

/**
 * @template {Record<string, Method>} T
 * @param {string} tag
 * @param {InterfaceGuard | undefined} interfaceGuard CAVEAT: static typing does not yet support `callWhen` transformation
 * @param {T} methods
 * @param {object} [options]
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

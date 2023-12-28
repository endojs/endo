/* global globalThis */
/// <reference types="ses"/>
import { makeEnvironmentCaptor } from '@endo/env-options';
import { objectMap } from '@endo/patterns';

import { defendPrototype, defendPrototypeKit } from './exo-tools.js';

const { create, seal, freeze, defineProperty, values } = Object;

const { getEnvironmentOption } = makeEnvironmentCaptor(globalThis);
const DEBUG = getEnvironmentOption('DEBUG', '');

// Turn on to give each exo instance its own toStringTag value.
const LABEL_INSTANCES = DEBUG.split(',').includes('label-instances');

/**
 * @template {{}} T
 * @param {T} proto
 * @param {number} instanceCount
 * @returns {T}
 */
export const makeSelf = (proto, instanceCount) => {
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
 * @typedef {{[name: string]: import('@endo/patterns').Pattern}} StateShape
 * It looks like a copyRecord pattern, but the interpretation is different.
 * Each property is distinct, is checked and changed separately.
 */

/**
 * @callback Revoker
 * @param {any} exo
 * @returns {boolean}
 */

/**
 * @callback ReceiveRevoker
 * @param {Revoker} revoke
 * @returns {void}
 */

/**
 * @template C
 * @typedef {object} FarClassOptions
 * @property {(context: C) => void} [finish]
 * @property {StateShape} [stateShape]
 * @property {ReceiveRevoker} [receiveRevoker]
 */

/**
 * @template {Methods} M
 * @typedef {M & import('@endo/eventual-send').RemotableBrand<{}, M>} Farable
 */

/**
 * @template {Methods} M
 * @typedef {Farable<M & import('./get-interface.js').GetInterfaceGuard<M>>} Guarded
 */

/**
 * @template {Record<FacetName, Methods>} F
 * @typedef {{ [K in keyof F]: Guarded<F[K]> }} GuardedKit
 */

/**
 * @template {(...args: any[]) => any} I init function
 * @template {Methods} M methods
 * @param {string} tag
 * @param {import('@endo/patterns').InterfaceGuard<{
 *   [K in keyof M]: import("@endo/patterns").MethodGuard
 * }> | undefined} interfaceGuard
 * @param {I} init
 * @param {M & ThisType<{ self: Guarded<M>, state: ReturnType<I> }>} methods
 * @param {FarClassOptions<ClassContext<ReturnType<I>, M>>} [options]
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
  const { finish = undefined, receiveRevoker = undefined } = options;
  /** @type {WeakMap<M,ClassContext<ReturnType<I>, M>>} */
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
    /** @type {ClassContext<ReturnType<I>,M>} */
    const context = freeze({ state, self });
    contextMap.set(self, context);
    if (finish) {
      finish(context);
    }
    return self;
  };

  if (receiveRevoker) {
    const revoke = self => contextMap.delete(self);
    harden(revoke);
    receiveRevoker(revoke);
  }

  return harden(makeInstance);
};
harden(defineExoClass);

/**
 * @template {(...args: any[]) => any} I init function
 * @template {Record<FacetName, Methods>} F facet methods
 * @param {string} tag
 * @param {{ [K in keyof F]:
 *   import('@endo/patterns').InterfaceGuard<{[M in keyof F[K]]: import('@endo/patterns').MethodGuard; }>
 * } | undefined} interfaceGuardKit
 * @param {I} init
 * @param {F & { [K in keyof F]: ThisType<{ facets: GuardedKit<F>, state: ReturnType<I> }> }} methodsKit
 * @param {FarClassOptions<KitContext<ReturnType<I>, GuardedKit<F>>>} [options]
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
  const { finish = undefined, receiveRevoker = undefined } = options;
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
    /** @type {{ state: ReturnType<I>, facets: unknown }} */
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

  if (receiveRevoker) {
    const revoke = aFacet =>
      values(contextMapKit).some(contextMap => contextMap.delete(aFacet));
    harden(revoke);
    receiveRevoker(revoke);
  }

  return harden(makeInstanceKit);
};
harden(defineExoClassKit);

/**
 * @template {Methods} T
 * @param {string} tag
 * @param {import('@endo/patterns').InterfaceGuard<{
 *   [M in keyof T]: import('@endo/patterns').MethodGuard
 * }> | undefined} interfaceGuard CAVEAT: static typing does not yet support `callWhen` transformation
 * @param {T} methods
 * @param {FarClassOptions<ClassContext<{},T>>} [options]
 * @returns {Guarded<T>}
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

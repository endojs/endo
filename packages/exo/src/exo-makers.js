/* global globalThis */
/// <reference types="ses"/>
import { makeEnvironmentCaptor } from '@endo/env-options';
import { objectMap } from '@endo/patterns';

import { defendPrototype, defendPrototypeKit } from './exo-tools.js';

/**
 * @template {Record<string | symbol, MethodGuard>} T
 * @typedef {import('@endo/patterns').InterfaceGuard<T>} InterfaceGuard
 */
/** @typedef {import('@endo/patterns').MethodGuard} MethodGuard */

const { create, seal, freeze, defineProperty, entries } = Object;
const { Fail, quote: q } = assert;

const { getEnvironmentOption } = makeEnvironmentCaptor(globalThis);
const DEBUG = getEnvironmentOption('DEBUG', '');

// Turn on to give each exo instance its own toStringTag value.
const LABEL_INSTANCES = DEBUG.split(',').includes('label-instances');

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
export const defineExoClass = (tag, interfaceGuard, init, methods, options) => {
  harden(methods);
  const { finish = undefined } = options || {};
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
    /** @type {M} */
    const self = makeSelf(proto, instanceCount);
    const revoke = () => contextMap.delete(self);

    // Be careful not to freeze the state record
    /** @type {ClassContext<ReturnType<I>,M>} */
    // @ts-ignore Doesn't understand __proto__
    const context = freeze({
      state,
      self,
      revoke,
    });
    contextMap.set(self, context);
    if (finish) {
      finish(context);
    }
    return /** @type {M & import('@endo/eventual-send').RemotableBrand<{}, M>} */ (
      self
    );
  };
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
  options,
) => {
  harden(methodsKit);
  const { finish = undefined } = options || {};
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
    const revoke = () => {
      let seenTrue = false;
      let seenFalse = false;
      // eslint-disable-next-line no-use-before-define
      for (const [facetName, facet] of entries(facets)) {
        const seen = contextMapKit[facetName].delete(facet);
        if (seen === true) {
          seenTrue = true;
          seenFalse === false ||
            Fail`internal: inconsistent facet revocation ${q(facetName)}`;
        } else {
          seenFalse = true;
          seenTrue === false ||
            Fail`internal: inconsistent facet revocation ${q(facetName)}`;
        }
      }
      return seenTrue;
    };
    // Don't freeze context until we add facets
    /** @type {KitContext<ReturnType<I>,F>} */
    const context = {
      state,
      facets: {},
      revoke,
    };
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
    return context.facets;
  };
  return harden(makeInstanceKit);
};
harden(defineExoClassKit);

/**
 * @template {Methods} T
 * @param {string} tag
 * @param {InterfaceGuard<{ [M in keyof T]: MethodGuard }> | undefined} interfaceGuard
 * CAVEAT: static typing does not yet support `callWhen` transformation
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

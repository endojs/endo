/// <reference types="ses"/>
import { environmentOptionsListHas } from '@endo/env-options';
import { objectMap } from '@endo/patterns';

import { defendPrototype, defendPrototypeKit } from './exo-tools.js';

const { Fail, quote: q } = assert;
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
 * Template for function-valued options for exo class or exo class kit
 * definitions, for receiving powers back at definition time. For example,
 * ```js
 * let amplify;
 * const makeFoo = defineExoClassKit(
 *   tag,
 *   interfaceGuardKit,
 *   initFn,
 *   behaviorKit,
 *   {
 *     receiveAmplifier(a) { amplify = a; },
 *   },
 * );
 * ```
 * uses the `receiveAmplifier` option to receive, during the
 * definition of this exo class kit, the power to amplify a facet of the kit.
 *
 * @template {any} P
 * @typedef {(power: P) => void} ReceivePower
 */

/**
 * The power to revoke a live instance of the associated exo class, or the
 * power to revoke a live facet instance of the associated exo class kit.
 * If called with such a live instance, it revokes it and returns true. Once
 * revoked, it is no longer live, and calling any of its methods throw
 * an informative diagnostic with no further effects.
 *
 * @callback Revoke
 * @param {any} exo
 * @returns {boolean}
 */

/**
 * The power to amplify a live facet instance of the associated exo class kit
 * into the record of all facets of this facet instance's cohort.
 *
 * @template {any} [F=any]
 * @callback Amplify
 * @param {any} exoFacet
 * @returns {F}
 */

// TODO Should we split FarClassOptions into distinct types for
// class options vs class kit options? After all, `receiveAmplifier`
// makes no sense for normal exo classes.
/**
 * Currently, this one options type is used both for regular exo classes
 * as well as exo class kits. However, we may split these into distinct types
 * in the future, as not all options make sense for both uses.
 *
 * @template {any} C
 * @template {any} [F=any]
 * @typedef {object} FarClassOptions
 * @property {(context: C) => void} [finish]
 * If provided, the `finish` function is called after the instance has been
 * initialized and registered, but before it is returned. Try to avoid using
 * `finish` if you can, as we think we'd like to deprecate and retire it.
 * OTOH, if you encounter a compelling need, please let us know so we can
 * revise our plans.
 *
 * @property {StateShape} [stateShape]
 * If provided, it must be a RecordPattern, i.e., a CopyRecord which is also
 * a Pattern. It thus has an exactly defined set of property names and
 * a Pattern as the value of each property. This is supposed to be an invariant
 * on the properties of an instance state record.
 * TODO Though note that only the virtual and durable exos currently
 * enforce the `stateShape` invariant. The heap exos defined in this
 * package currently ignore `stateShape`, but will enforce this in the future.
 *
 * @property {ReceivePower<Revoke>} [receiveRevoker]
 * If a `receiveRevoker` function is provided, it will be called during
 * definition of the exo class or exo class kit with a `Revoke` function.
 * A `Revoke` function is a function of one argument. If you call the revoke
 * function with a live instance of this exo class, or a live facet instance
 * of this exo class kit, then it will "revoke" it and return true. Once
 * revoked, this instance is no longer "live": Any attempt to invoke any of
 * its methods will fail without further effect.
 *
 * @property {ReceivePower<Amplify<F>>} [receiveAmplifier]
 * If a `receiveAmplifier` function is provided, it will be called during
 * definition of the exo class kit with an `Amplify` function. If called
 * during the definition of a normal exo or exo class, it will throw, since
 * only exo kits can be amplified.
 * An `Amplify` function is a function that takes a live facet instance of
 * this class kit as an argument, in which case it will return the facets
 * record, giving access to all the facet instances of the same cohort.
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
  const {
    finish = undefined,
    receiveRevoker = undefined,
    receiveAmplifier = undefined,
  } = options;
  receiveAmplifier === undefined ||
    Fail`Only facets of an exo class kit can be amplified ${q(tag)}`;

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
    receiveRevoker = undefined,
    receiveAmplifier = undefined,
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

  if (receiveAmplifier) {
    const amplify = aFacet => {
      for (const contextMap of values(contextMapKit)) {
        if (contextMap.has(aFacet)) {
          const { facets } = contextMap.get(aFacet);
          return facets;
        }
      }
      throw Fail`Must be an unrevoked facet of ${q(tag)}: ${aFacet}`;
    };
    harden(amplify);
    receiveAmplifier(amplify);
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

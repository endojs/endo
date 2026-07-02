/* eslint-disable no-underscore-dangle */

import { AsyncLocalStorage, executionAsyncResource } from 'node:async_hooks';

const { is: ObjectIs } = Object;
const { apply: ReflectApply } = Reflect;

/** @type {WeakMap<AsyncLocalStorageInternal, WeakMap>} */
const resourceStoreMaps = new WeakMap();

/**
 * @param {AsyncLocalStorageInternal} key
 * @returns {WeakMap}
 */
const getStoreMap = key => /** @type {WeakMap} */ (resourceStoreMaps.get(key));

/**
 * @typedef {object} AsyncLocalStorageInternal
 * @property {boolean} enabled
 * @property {(resource: object, triggerResource: object, type?: string) => void} _propagate
 * @property {(this: AsyncLocalStorage) => void} _enable
 */

Object.defineProperty(AsyncLocalStorage.prototype, 'kResourceStore', {
  configurable: true,
  /**
   * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
   */
  set() {
    resourceStoreMaps.set(this, new WeakMap());
  },
});

// The methods below patch the AsyncLocalStorage prototype. They are written
// as concise methods on an object literal so they retain their `name` for
// stack traces while having no `[[Construct]]` and no `prototype` (unlike
// a `function`-keyword function expression).
const patches = {
  /**
   * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
   * @param {object} resource
   * @param {object} triggerResource
   * @param {string} [type]
   */
  _propagate(resource, triggerResource, type) {
    if (!this.enabled) return;

    const storeMap = getStoreMap(this);
    storeMap.set(resource, storeMap.get(triggerResource));
  },

  /**
   * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
   * @param {any} store
   */
  enterWith(store) {
    this._enable();
    const resource = executionAsyncResource();
    getStoreMap(this).set(resource, store);
  },

  /**
   * @template R
   * @template {any[]} TArgs
   * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
   * @param {any} store
   * @param {(...args: TArgs) => R} callback
   * @param  {...TArgs} args
   * @returns {R}
   */
  run(store, callback, ...args) {
    // Avoid creation of an AsyncResource if store is already active
    if (ObjectIs(store, this.getStore())) {
      return ReflectApply(callback, null, args);
    }

    this._enable();
    const storeMap = getStoreMap(this);

    const resource = executionAsyncResource();

    const oldStore = storeMap.get(resource);

    storeMap.set(resource, store);

    try {
      return ReflectApply(callback, null, args);
    } finally {
      storeMap.set(resource, oldStore);
    }
  },

  /**
   * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
   */
  getStore() {
    return this.enabled
      ? getStoreMap(this).get(executionAsyncResource())
      : undefined;
  },
};

// Install the patched methods with the descriptor form
// (`defineProperties` over `getOwnPropertyDescriptors`) rather than per-property
// assignment. The descriptor form copies each method onto the prototype via
// `[[DefineOwnProperty]]`, which transfers the own-property descriptor faithfully
// and unconditionally; plain `proto.x = patches.x` routes through `[[Set]]`,
// which would honor an inherited setter and, against a non-writable inherited
// data property, would throw a TypeError in strict mode (the mode all module
// code runs in) rather than installing the method. One observable nuance:
// object-literal methods carry
// `enumerable: true`, so this makes `enterWith`, `run`, and `getStore`
// enumerable own properties of the prototype, whereas per-property assignment
// preserved the non-enumerability of the built-in methods it overwrote.
Object.defineProperties(
  AsyncLocalStorage.prototype,
  Object.getOwnPropertyDescriptors(patches),
);

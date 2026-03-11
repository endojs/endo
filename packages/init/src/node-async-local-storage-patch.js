/* eslint-disable no-underscore-dangle */

import { AsyncLocalStorage, executionAsyncResource } from 'node:async_hooks';

const { is: ObjectIs } = Object;
const { apply: ReflectApply } = Reflect;

/** @type {WeakMap<AsyncLocalStorageInternal, WeakMap>} */
const resourceStoreMaps = new WeakMap();

/** @param {AsyncLocalStorageInternal} self @returns {WeakMap} */
const getStoreMap = self => {
  let storeMap = resourceStoreMaps.get(self);
  if (storeMap === undefined) {
    storeMap = new WeakMap();
    resourceStoreMaps.set(self, storeMap);
  }
  return storeMap;
};

/**
 * @typedef {object} AsyncLocalStorageInternal
 * @property {boolean} enabled
 * @property {typeof _propagate} _propagate
 * @property {(this: AsyncLocalStorage) => void} [_enable]
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

/**
 * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
 * @param {object} resource
 * @param {object} triggerResource
 * @param {string} [type]
 */
function _propagate(resource, triggerResource, type) {
  if (!this.enabled) return;

  const storeMap = getStoreMap(this);
  storeMap.set(resource, storeMap.get(triggerResource));
}

// @ts-expect-error propagate is internal
AsyncLocalStorage.prototype._propagate = _propagate;

/**
 * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
 * @param {any} store
 */
AsyncLocalStorage.prototype.enterWith = function enterWith(store) {
  if (typeof this._enable === 'function') {
    this._enable();
  }
  const resource = executionAsyncResource();
  getStoreMap(this).set(resource, store);
};

/**
 * @template R
 * @template {any[]} TArgs
 * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
 * @param {any} store
 * @param {(...args: TArgs) => R} callback
 * @param  {...TArgs} args
 * @returns {R}
 */
AsyncLocalStorage.prototype.run = function run(store, callback, ...args) {
  // Avoid creation of an AsyncResource if store is already active
  if (ObjectIs(store, this.getStore())) {
    return ReflectApply(callback, null, args);
  }

  if (typeof this._enable === 'function') {
    this._enable();
  } else {
    console.error(
      'WAT',
      this,
      this.__proto__,
      this.constructor,
      this.constructor.toString(),
    );
    throw new Error('inconceivable ALS internal');
  }

  const storeMap = getStoreMap(this);

  const resource = executionAsyncResource();

  const oldStore = storeMap.get(resource);

  storeMap.set(resource, store);

  try {
    return ReflectApply(callback, null, args);
  } finally {
    storeMap.set(resource, oldStore);
  }
};

/**
 * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
 */
AsyncLocalStorage.prototype.getStore = function getStore() {
  return this.enabled
    ? getStoreMap(this).get(executionAsyncResource())
    : undefined;
};

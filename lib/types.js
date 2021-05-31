/**
 * @typedef {Object} SyncImpl
 * @property {(target: any, args: Array<any>) => any} applyFunction function
 * application
 * @property {(target: any, method: string | symbol | number, args: Array<any>)
 * => any} applyMethod method invocation, which is an atomic lookup of method and
 * apply
 * @property {(target: any, prop: string | symbol | number) => any} get property
 * lookup
 */

/** @typedef {import('./ts-types').Sync} Sync */

/**
 * @template T
 * @typedef {import('./ts-types').Syncable<T>} Syncable
 */

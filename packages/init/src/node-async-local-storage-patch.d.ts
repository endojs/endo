/// <reference types="node" />
export type AsyncLocalStorageInternal = {
    enabled: boolean;
    _propagate: typeof _propagate;
    _enable: (this: AsyncLocalStorage<any>) => void;
};
/**
 * @this {AsyncLocalStorage & AsyncLocalStorageInternal}
 * @param {object} resource
 * @param {object} triggerResource
 * @param {string} [type]
 */
declare function _propagate(this: AsyncLocalStorage<any> & AsyncLocalStorageInternal, resource: object, triggerResource: object, type?: string | undefined): void;
import { AsyncLocalStorage } from 'node:async_hooks';
export {};
//# sourceMappingURL=node-async-local-storage-patch.d.ts.map
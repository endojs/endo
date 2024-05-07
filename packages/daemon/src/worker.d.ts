export function makeWorkerFacet({ cancel }: {
    cancel: (error: Error) => void;
}): import("@endo/exo").Guarded<{
    terminate: () => Promise<void>;
    /**
     * @param {string} source
     * @param {Array<string>} names
     * @param {Array<unknown>} values
     * @param {string} $id
     * @param {Promise<never>} $cancelled
     */
    evaluate: (source: string, names: Array<string>, values: Array<unknown>, $id: string, $cancelled: Promise<never>) => Promise<any>;
    /**
     * @param {string} specifier
     * @param {Promise<unknown>} powersP
     * @param {Promise<unknown>} contextP
     */
    makeUnconfined: (specifier: string, powersP: Promise<unknown>, contextP: Promise<unknown>) => Promise<any>;
    /**
     * @param {ERef<EndoReadable>} readableP
     * @param {Promise<unknown>} powersP
     * @param {Promise<unknown>} contextP
     */
    makeBundle: (readableP: ERef<EndoReadable>, powersP: Promise<unknown>, contextP: Promise<unknown>) => Promise<any>;
}>;
export function main(powers: MignonicPowers, pid: number | undefined, cancel: (error: Error) => void, cancelled: Promise<never>): Promise<void>;
export type WorkerBootstrap = ReturnType<({ cancel }: {
    cancel: (error: Error) => void;
}) => import("@endo/exo").Guarded<{
    terminate: () => Promise<void>;
    /**
     * @param {string} source
     * @param {Array<string>} names
     * @param {Array<unknown>} values
     * @param {string} $id
     * @param {Promise<never>} $cancelled
     */
    evaluate: (source: string, names: string[], values: unknown[], $id: string, $cancelled: Promise<never>) => Promise<any>;
    /**
     * @param {string} specifier
     * @param {Promise<unknown>} powersP
     * @param {Promise<unknown>} contextP
     */
    makeUnconfined: (specifier: string, powersP: Promise<unknown>, contextP: Promise<unknown>) => Promise<any>;
    /**
     * @param {ERef<EndoReadable>} readableP
     * @param {Promise<unknown>} powersP
     * @param {Promise<unknown>} contextP
     */
    makeBundle: (readableP: ERef<EndoReadable>, powersP: Promise<unknown>, contextP: Promise<unknown>) => Promise<any>;
}>>;
import type { EndoReadable } from './types.js';
import type { ERef } from '@endo/eventual-send';
import type { MignonicPowers } from './types.js';
//# sourceMappingURL=worker.d.ts.map
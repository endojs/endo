export function makeWorkerFacet({ cancel }: {
    cancel: (error: Error) => void;
}): import("@endo/exo/src/types.js").Guarded<{
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
     * @param {import('@endo/eventual-send').ERef<import('./types.js').EndoReadable>} readableP
     * @param {Promise<unknown>} powersP
     * @param {Promise<unknown>} contextP
     */
    makeBundle: (readableP: import('@endo/eventual-send').ERef<import('./types.js').EndoReadable>, powersP: Promise<unknown>, contextP: Promise<unknown>) => Promise<any>;
}>;
export function main(powers: import('./types.js').MignonicPowers, locator: import('./types.js').Locator, uuid: string, pid: number | undefined, cancel: (error: Error) => void, cancelled: Promise<never>): Promise<void>;
export type WorkerBootstrap = ReturnType<({ cancel }: {
    cancel: (error: Error) => void;
}) => import("@endo/exo/src/types.js").Guarded<{
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
     * @param {import('@endo/eventual-send').ERef<import('./types.js').EndoReadable>} readableP
     * @param {Promise<unknown>} powersP
     * @param {Promise<unknown>} contextP
     */
    makeBundle: (readableP: import("@endo/eventual-send").ERef<import("./types.js").EndoReadable>, powersP: Promise<unknown>, contextP: Promise<unknown>) => Promise<any>;
}>>;
//# sourceMappingURL=worker.d.ts.map
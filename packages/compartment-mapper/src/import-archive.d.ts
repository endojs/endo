export function parseArchive(archiveBytes: Uint8Array, archiveLocation?: string | undefined, options?: {
    expectedSha512?: string | undefined;
    computeSha512?: import("./types.js").HashFn | undefined;
    modules?: Record<string, unknown> | undefined;
    importHook?: import("./types.js").ExitModuleImportHook | undefined;
    Compartment?: typeof Compartment | undefined;
    computeSourceLocation?: import("./types.js").ComputeSourceLocationHook | undefined;
    computeSourceMapLocation?: import("./types.js").ComputeSourceMapLocationHook | undefined;
} | undefined): Promise<import('./types.js').Application>;
export function loadArchive(readPowers: import('./types.js').ReadFn | import('./types.js').ReadPowers, archiveLocation: string, options?: import("./types.js").LoadArchiveOptions | undefined): Promise<import('./types.js').Application>;
export function importArchive(readPowers: import('./types.js').ReadFn | import('./types.js').ReadPowers, archiveLocation: string, options: import('./types.js').ExecuteOptions & import('./types.js').LoadArchiveOptions): Promise<object>;
export type CompartmentConstructor = typeof Compartment;
//# sourceMappingURL=import-archive.d.ts.map
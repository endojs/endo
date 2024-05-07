export function parseArchive(archiveBytes: Uint8Array, archiveLocation?: string | undefined, options?: {
    expectedSha512?: string | undefined;
    computeSha512?: HashFn | undefined;
    modules?: Record<string, unknown> | undefined;
    importHook?: ExitModuleImportHook | undefined;
    Compartment?: typeof Compartment | undefined;
    computeSourceLocation?: ComputeSourceLocationHook | undefined;
    computeSourceMapLocation?: ComputeSourceMapLocationHook | undefined;
} | undefined): Promise<Application>;
export function loadArchive(readPowers: import("@endo/zip").ReadFn | ReadPowers, archiveLocation: string, options?: LoadArchiveOptions | undefined): Promise<Application>;
export function importArchive(readPowers: import("@endo/zip").ReadFn | ReadPowers, archiveLocation: string, options: ExecuteOptions & LoadArchiveOptions): Promise<object>;
export type CompartmentConstructor = typeof Compartment;
import type { HashFn } from './types.js';
import type { ExitModuleImportHook } from './types.js';
import type { ComputeSourceLocationHook } from './types.js';
import type { ComputeSourceMapLocationHook } from './types.js';
import type { Application } from './types.js';
import type { ReadPowers } from './types.js';
import type { LoadArchiveOptions } from './types.js';
import type { ExecuteOptions } from './types.js';
//# sourceMappingURL=import-archive.d.ts.map
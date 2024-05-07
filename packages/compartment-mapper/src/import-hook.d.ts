export function exitModuleImportHookMaker({ modules, exitModuleImportHook, }: {
    modules?: Record<string, any> | undefined;
    exitModuleImportHook?: ExitModuleImportHook | undefined;
}): ExitModuleImportHook | undefined;
export function makeImportHookMaker(readPowers: ReadFn | ReadPowers, baseLocation: string, { sources, compartmentDescriptors, archiveOnly, computeSha512, searchSuffixes, sourceMapHook, entryCompartmentName, entryModuleSpecifier, exitModuleImportHook, }: {
    sources?: Sources | undefined;
    compartmentDescriptors?: Record<string, CompartmentDescriptor> | undefined;
    archiveOnly?: boolean | undefined;
    computeSha512?: HashFn | undefined;
    searchSuffixes?: string[] | undefined;
    entryCompartmentName: string;
    entryModuleSpecifier: string;
    exitModuleImportHook?: ExitModuleImportHook | undefined;
    sourceMapHook?: import("./types.js").SourceMapHook | undefined;
}): ImportHookMaker;
import type { ExitModuleImportHook } from './types.js';
import type { ReadFn } from './types.js';
import type { ReadPowers } from './types.js';
import type { Sources } from './types.js';
import type { CompartmentDescriptor } from './types.js';
import type { HashFn } from './types.js';
import type { ImportHookMaker } from './types.js';
//# sourceMappingURL=import-hook.d.ts.map
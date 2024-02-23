export function exitModuleImportHookMaker({ modules, exitModuleImportHook, }: {
    modules?: Record<string, any> | undefined;
    exitModuleImportHook?: ExitModuleImportHook | undefined;
}): ExitModuleImportHook | undefined;
export function makeImportHookMaker(readPowers: ReadFn | ReadPowers, baseLocation: string, { sources, compartmentDescriptors, archiveOnly, computeSha512, searchSuffixes, sourceMapHook, entryCompartmentName, entryModuleSpecifier, exitModuleImportHook, }: {
    sources?: import("./types.js").Sources | undefined;
    compartmentDescriptors?: Record<string, import("./types.js").CompartmentDescriptor> | undefined;
    archiveOnly?: boolean | undefined;
    computeSha512?: import("./types.js").HashFn | undefined;
    searchSuffixes?: string[] | undefined;
    entryCompartmentName: string;
    entryModuleSpecifier: string;
    exitModuleImportHook?: import("./types.js").ExitModuleImportHook | undefined;
    sourceMapHook?: import("./types.js").SourceMapHook | undefined;
}): ImportHookMaker;
export type ImportHook = import('ses').ImportHook;
export type StaticModuleType = import('ses').StaticModuleType;
export type RedirectStaticModuleInterface = import('ses').RedirectStaticModuleInterface;
export type ThirdPartyStaticModuleInterface = import('ses').ThirdPartyStaticModuleInterface;
export type ReadFn = import('./types.js').ReadFn;
export type ReadPowers = import('./types.js').ReadPowers;
export type HashFn = import('./types.js').HashFn;
export type Sources = import('./types.js').Sources;
export type CompartmentSources = import('./types.js').CompartmentSources;
export type CompartmentDescriptor = import('./types.js').CompartmentDescriptor;
export type ImportHookMaker = import('./types.js').ImportHookMaker;
export type DeferredAttenuatorsProvider = import('./types.js').DeferredAttenuatorsProvider;
export type ExitModuleImportHook = import('./types.js').ExitModuleImportHook;
//# sourceMappingURL=import-hook.d.ts.map
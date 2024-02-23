export function makeBundle(read: ReadFn, moduleLocation: string, options?: {
    moduleTransforms?: import("./types.js").ModuleTransforms | undefined;
    dev?: boolean | undefined;
    tags?: Set<string> | undefined;
    commonDependencies?: object;
    searchSuffixes?: string[] | undefined;
    sourceMapHook?: import("./types.js").SourceMapHook | undefined;
} | undefined): Promise<string>;
export function writeBundle(write: WriteFn, read: ReadFn, bundleLocation: string, moduleLocation: string, options?: import("./types.js").ArchiveOptions | undefined): Promise<void>;
export type ResolveHook = import('ses').ResolveHook;
export type PrecompiledStaticModuleInterface = import('ses').PrecompiledStaticModuleInterface;
export type ParserImplementation = import('./types.js').ParserImplementation;
export type CompartmentDescriptor = import('./types.js').CompartmentDescriptor;
export type CompartmentSources = import('./types.js').CompartmentSources;
export type ReadFn = import('./types.js').ReadFn;
export type ModuleTransforms = import('./types.js').ModuleTransforms;
export type Sources = import('./types.js').Sources;
export type WriteFn = import('./types.js').WriteFn;
export type ArchiveOptions = import('./types.js').ArchiveOptions;
//# sourceMappingURL=bundle.d.ts.map
export function mapParsers(languageForExtension: Record<string, Language>, languageForModuleSpecifier: Record<string, string>, parserForLanguage: Record<string, ParserImplementation>, moduleTransforms?: ModuleTransforms): ParseFn;
export function link({ entry, compartments: compartmentDescriptors }: CompartmentMapDescriptor, { resolve, makeImportHook, parserForLanguage, globals, transforms, moduleTransforms, __shimTransforms__, archiveOnly, Compartment, }: LinkOptions): {
    compartment: Compartment;
    compartments: Record<string, Compartment>;
    attenuatorsCompartment: Compartment;
    pendingJobsPromise: Promise<void>;
};
export function assemble(compartmentMap: CompartmentMapDescriptor, options: LinkOptions): Compartment;
export type ModuleMapHook = import('ses').ModuleMapHook;
export type ResolveHook = import('ses').ResolveHook;
export type ParseFn = import('./types.js').ParseFn;
export type ParserImplementation = import('./types.js').ParserImplementation;
export type ShouldDeferError = import('./types.js').ShouldDeferError;
export type ModuleTransforms = import('./types.js').ModuleTransforms;
export type Language = import('./types.js').Language;
export type ModuleDescriptor = import('./types.js').ModuleDescriptor;
export type CompartmentDescriptor = import('./types.js').CompartmentDescriptor;
export type CompartmentMapDescriptor = import('./types.js').CompartmentMapDescriptor;
export type DeferredAttenuatorsProvider = import('./types.js').DeferredAttenuatorsProvider;
export type LinkOptions = import('./types.js').LinkOptions;
export type ERef<T_1> = import('@endo/eventual-send').ERef<T>;
//# sourceMappingURL=link.d.ts.map
export function mapParsers(languageForExtension: Record<string, Language>, languageForModuleSpecifier: Record<string, string>, parserForLanguage: Record<string, ParserImplementation>, moduleTransforms?: ModuleTransforms): ParseFn;
export function link({ entry, compartments: compartmentDescriptors }: CompartmentMapDescriptor, { resolve, makeImportHook, parserForLanguage, globals, transforms, moduleTransforms, __shimTransforms__, archiveOnly, Compartment, }: LinkOptions): {
    compartment: Compartment;
    compartments: Record<string, Compartment>;
    attenuatorsCompartment: Compartment;
    pendingJobsPromise: Promise<void>;
};
export function assemble(compartmentMap: CompartmentMapDescriptor, options: LinkOptions): Compartment;
import type { Language } from './types.js';
import type { ParserImplementation } from './types.js';
import type { ModuleTransforms } from './types.js';
import type { ParseFn } from './types.js';
import type { CompartmentMapDescriptor } from './types.js';
import type { LinkOptions } from './types.js';
//# sourceMappingURL=link.d.ts.map
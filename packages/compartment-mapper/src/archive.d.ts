export function makeArchiveCompartmentMap(compartmentMap: CompartmentMapDescriptor, sources: Sources): {
    archiveCompartmentMap: CompartmentMapDescriptor;
    archiveSources: Sources;
};
export function makeAndHashArchive(powers: ReadFn | ReadPowers, moduleLocation: string, options?: import("./types.js").ArchiveOptions | undefined): Promise<{
    bytes: Uint8Array;
    sha512?: string | undefined;
}>;
export function makeArchive(powers: ReadFn | ReadPowers, moduleLocation: string, options?: import("./types.js").ArchiveOptions | undefined): Promise<Uint8Array>;
export function mapLocation(powers: ReadFn | ReadPowers, moduleLocation: string, options?: import("./types.js").ArchiveOptions | undefined): Promise<Uint8Array>;
export function hashLocation(powers: HashPowers, moduleLocation: string, options?: import("./types.js").ArchiveOptions | undefined): Promise<string>;
export function writeArchive(write: WriteFn, readPowers: ReadFn | ReadPowers, archiveLocation: string, moduleLocation: string, options?: import("./types.js").ArchiveOptions | undefined): Promise<void>;
export type ArchiveOptions = import('./types.js').ArchiveOptions;
export type ArchiveWriter = import('./types.js').ArchiveWriter;
export type CompartmentDescriptor = import('./types.js').CompartmentDescriptor;
export type CompartmentMapDescriptor = import('./types.js').CompartmentMapDescriptor;
export type ModuleDescriptor = import('./types.js').ModuleDescriptor;
export type ParserImplementation = import('./types.js').ParserImplementation;
export type ReadFn = import('./types.js').ReadFn;
export type CaptureSourceLocationHook = import('./types.js').CaptureSourceLocationHook;
export type ReadPowers = import('./types.js').ReadPowers;
export type HashPowers = import('./types.js').HashPowers;
export type Sources = import('./types.js').Sources;
export type WriteFn = import('./types.js').WriteFn;
//# sourceMappingURL=archive.d.ts.map
export function makeArchiveCompartmentMap(compartmentMap: CompartmentMapDescriptor, sources: Sources): {
    archiveCompartmentMap: CompartmentMapDescriptor;
    archiveSources: Sources;
};
export function makeAndHashArchive(powers: ReadFn | ReadPowers, moduleLocation: string, options?: ArchiveOptions | undefined): Promise<{
    bytes: Uint8Array;
    sha512?: string;
}>;
export function makeArchive(powers: ReadFn | ReadPowers, moduleLocation: string, options?: ArchiveOptions | undefined): Promise<Uint8Array>;
export function mapLocation(powers: ReadFn | ReadPowers, moduleLocation: string, options?: ArchiveOptions | undefined): Promise<Uint8Array>;
export function hashLocation(powers: HashPowers, moduleLocation: string, options?: ArchiveOptions | undefined): Promise<string>;
export function writeArchive(write: WriteFn, readPowers: ReadFn | ReadPowers, archiveLocation: string, moduleLocation: string, options?: ArchiveOptions | undefined): Promise<void>;
import type { CompartmentMapDescriptor } from './types.js';
import type { Sources } from './types.js';
import type { ReadFn } from './types.js';
import type { ReadPowers } from './types.js';
import type { ArchiveOptions } from './types.js';
import type { HashPowers } from './types.js';
import type { WriteFn } from './types.js';
//# sourceMappingURL=archive.d.ts.map
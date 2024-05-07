export function makeBundle(read: ReadFn, moduleLocation: string, options?: {
    moduleTransforms?: ModuleTransforms | undefined;
    dev?: boolean | undefined;
    tags?: Set<string> | undefined;
    commonDependencies?: object;
    searchSuffixes?: string[] | undefined;
    sourceMapHook?: import("./types.js").SourceMapHook | undefined;
} | undefined): Promise<string>;
export function writeBundle(write: WriteFn, read: ReadFn, bundleLocation: string, moduleLocation: string, options?: ArchiveOptions | undefined): Promise<void>;
import type { ReadFn } from './types.js';
import type { ModuleTransforms } from './types.js';
import type { WriteFn } from './types.js';
import type { ArchiveOptions } from './types.js';
//# sourceMappingURL=bundle.d.ts.map
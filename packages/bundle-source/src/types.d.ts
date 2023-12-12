export type ModuleFormat = 'endoZipBase64' | 'nestedEvaluate' | 'getExport';
export type BundleSource = BundleSourceSimple & BundleSourceWithFormat & BundleSourceWithOptions & BundleSourceGeneral;
export type BundleSourceResult<T extends ModuleFormat> = T extends 'endoZipBase64' ? {
    moduleFormat: 'endoZipBase64';
    endoZipBase64: string;
    endoZipBase64Sha512: string;
} : T extends 'getExport' | 'nestedEvaluate' ? {
    moduleFormat: T;
    source: string;
    sourceMap: string;
} : never;
export type BundleSourceSimple = <T extends "endoZipBase64">(startFilename: string) => Promise<BundleSourceResult<T>>;
export type BundleSourceWithFormat = <T extends ModuleFormat = "endoZipBase64">(startFilename: string, format: T, powers?: {
    read?: ReadFn;
    canonical?: CanonicalFn;
    externals?: string[];
}) => Promise<BundleSourceResult<T>>;
export type BundleSourceWithOptions = <T extends ModuleFormat = "endoZipBase64">(startFilename: string, bundleOptions: BundleOptions<T>, powers?: {
    read?: ReadFn;
    canonical?: CanonicalFn;
    externals?: string[];
}) => Promise<BundleSourceResult<T>>;
export type BundleSourceGeneral = <T extends ModuleFormat = "endoZipBase64">(startFilename: string, formatOrOptions?: T | BundleOptions<T> | undefined, powers?: {
    read?: ReadFn;
    canonical?: CanonicalFn;
    externals?: string[];
}) => Promise<BundleSourceResult<T>>;
export type BundleOptions<T extends ModuleFormat> = {
    format?: T | undefined;
    /**
     * - development mode, for test bundles that need
     * access to devDependencies of the entry package.
     */
    dev?: boolean | undefined;
};
export type ReadFn = (location: string) => Promise<Uint8Array>;
/**
 * Returns a canonical URL for a given URL, following redirects or symbolic
 * links if any exist along the path.
 * Must return the given logical location if the real location does not exist.
 */
export type CanonicalFn = (location: string) => Promise<string>;
//# sourceMappingURL=types.d.ts.map
export namespace jsOpts {
    function encodeBundle(bundle: any): string;
    function toBundleName(n: any): string;
    function toBundleMeta(n: any): string;
}
export namespace jsonOpts {
    export function encodeBundle_1(bundle: any): string;
    export { encodeBundle_1 as encodeBundle };
    export function toBundleName_1(n: any): string;
    export { toBundleName_1 as toBundleName };
    export function toBundleMeta_1(n: any): string;
    export { toBundleMeta_1 as toBundleMeta };
}
export function makeBundleCache(wr: any, cwd: any, readPowers: any, opts: any): {
    add: (rootPath: any, targetName: any, log?: any) => Promise<BundleMeta>;
    validate: (targetName: string, rootOpt: any, log?: Logger | undefined, meta?: BundleMeta | undefined) => Promise<BundleMeta>;
    validateOrAdd: (rootPath: string, targetName: string, log?: Logger | undefined) => Promise<BundleMeta>;
    load: (rootPath: string, targetName?: string | undefined, log?: Logger | undefined) => Promise<any>;
};
export function makeNodeBundleCache(dest: string, options: {
    format?: string;
    cacheOpts?: CacheOpts;
    cacheSourceMaps: boolean;
    dev?: boolean;
    log?: Logger;
}, loadModule: (id: string) => Promise<any>, pid?: number | undefined, nonce?: number | undefined): Promise<{
    add: (rootPath: any, targetName: any, log?: any) => Promise<BundleMeta>;
    validate: (targetName: string, rootOpt: any, log?: Logger | undefined, meta?: BundleMeta | undefined) => Promise<BundleMeta>;
    validateOrAdd: (rootPath: string, targetName: string, log?: Logger | undefined) => Promise<BundleMeta>;
    load: (rootPath: string, targetName?: string | undefined, log?: Logger | undefined) => Promise<any>;
}>;
/**
 * A message logger.
 */
export type Logger = (...args: unknown[]) => void;
export type BundleMeta = {
    bundleFileName: string;
    /**
     * ISO format
     */
    bundleTime: string;
    bundleSize: number;
    moduleSource: {
        relative: string;
        absolute: string;
    };
    contents: Array<{
        relativePath: string;
        mtime: string;
        size: number;
    }>;
};
export type CacheOpts = typeof jsOpts;
//# sourceMappingURL=cache.d.ts.map
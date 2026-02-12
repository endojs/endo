/* eslint-disable no-use-before-define */

export type ModuleFormat =
  | 'endoZipBase64'
  | 'endoScript'
  | 'nestedEvaluate'
  | 'getExport';

export type Logger = (...args: unknown[]) => void;
export type ComputeSha512 = (bytes: string | Uint8Array) => string;

export interface SharedPowers {
  computeSha512?: ComputeSha512 | undefined;
  pathResolve?: (typeof import('path'))['resolve'] | undefined;
  userInfo?: (typeof import('os'))['userInfo'] | undefined;
  env?: Record<string, string | undefined> | undefined;
  platform?: string | undefined;
}

export interface CacheOpts {
  encodeBundle: (bundle: unknown) => string;
  toBundleName: (targetName: string) => string;
  toBundleMeta: (targetName: string) => string;
}

export interface BundleCacheOperationOptions {
  noTransforms?: boolean | undefined;
  elideComments?: boolean | undefined;
  format?: ModuleFormat | undefined;
  conditions?: string[] | undefined;
}

export interface BundleCacheOptions extends BundleCacheOperationOptions {
  cacheOpts?: CacheOpts | undefined;
  log?: Logger | undefined;
}

export interface BundleMetaModuleSource {
  relative: string;
  absolute: string;
}

export interface BundleMetaContent {
  relativePath: string;
  mtime: string;
  size: number;
}

export interface BundleMeta {
  bundleFileName: string;
  bundleTime: string;
  bundleSize: number;
  noTransforms: boolean;
  elideComments: boolean;
  format: ModuleFormat;
  conditions: string[];
  moduleSource: BundleMetaModuleSource;
  contents: BundleMetaContent[];
}

export interface BundleCache {
  add: (
    rootPath: string,
    targetName: string,
    log?: Logger | undefined,
    options?: BundleCacheOperationOptions | undefined,
  ) => Promise<BundleMeta>;
  validate: (
    targetName: string,
    rootOpt: unknown,
    log?: Logger | undefined,
    meta?: BundleMeta | undefined,
    options?: BundleCacheOperationOptions | undefined,
  ) => Promise<BundleMeta>;
  validateOrAdd: (
    rootPath: string,
    targetName: string,
    log?: Logger | undefined,
    options?: BundleCacheOperationOptions | undefined,
  ) => Promise<BundleMeta>;
  load: (
    rootPath: string,
    targetName?: string | undefined,
    log?: Logger | undefined,
    options?: BundleCacheOperationOptions | undefined,
  ) => Promise<unknown>;
}

export interface FileReader {
  toString: () => string;
  readText: () => Promise<string>;
  maybeReadText: () => Promise<string | undefined>;
  neighbor: (ref: string) => FileReader;
  stat: () => Promise<import('fs').Stats>;
  absolute: () => string;
  relative: (there: string) => string;
  exists: () => Promise<boolean>;
}

export interface FileWriter {
  toString: () => string;
  writeText: (txt: any, opts?: any) => Promise<void>;
  readOnly: () => FileReader;
  neighbor: (ref: string) => FileWriter;
  mkdir: (opts?: any) => Promise<any>;
  rm: (opts?: any) => Promise<void>;
  rename: (newName: string) => Promise<void>;
}

export interface AtomicFileWriter extends Omit<FileWriter, 'neighbor'> {
  neighbor: (ref: string) => AtomicFileWriter;
  atomicWriteText: (txt: any, opts?: any) => Promise<import('fs').Stats>;
}

export type BundleScriptModuleFormat =
  | 'endoScript'
  | 'nestedEvaluate'
  | 'getExport';

export interface BundleScriptOptions {
  dev?: boolean | undefined;
  cacheSourceMaps?: boolean | undefined;
  noTransforms?: boolean | undefined;
  elideComments?: boolean | undefined;
  conditions?: string[] | undefined;
  commonDependencies?: Record<string, string> | undefined;
}

export interface BundleZipBase64Options extends BundleScriptOptions {
  importHook?:
    | import('@endo/compartment-mapper/node-powers.js').ExitModuleImportHook
    | undefined;
}

export interface ParserImplementationLike {
  parse: (sourceBytes: Uint8Array, ...rest: any[]) => any;
  heuristicImports: boolean;
  synchronous: boolean;
}

export type ParserForLanguageLike = Record<string, ParserImplementationLike>;

export type ModuleTransformsLike = Record<
  string,
  (...args: any[]) => Promise<any>
>;

export interface SourceMapDescriptor {
  sha512: string;
  compartment: string;
  module: string;
}

export interface BundlingKitIO {
  pathResolve: (typeof import('path'))['resolve'];
  userInfo: (typeof import('os'))['userInfo'];
  computeSha512?: ComputeSha512 | undefined;
  platform: string;
  env: Record<string, string | undefined>;
}

export interface BundlingKitOptions {
  cacheSourceMaps: boolean;
  elideComments: boolean;
  noTransforms: boolean;
  commonDependencies?: Record<string, string> | undefined;
  dev?: boolean | undefined;
}

export interface BundlingKit {
  sourceMapHook: (
    sourceMap: string,
    sourceDescriptor: SourceMapDescriptor,
  ) => void;
  sourceMapJobs: Set<Promise<void>>;
  moduleTransforms: ModuleTransformsLike;
  parserForLanguage: ParserForLanguageLike;
  workspaceLanguageForExtension: Record<string, string>;
  workspaceModuleLanguageForExtension: Record<string, string>;
  workspaceCommonjsLanguageForExtension: Record<string, string>;
}

export type BundleSource = BundleSourceSimple &
  BundleSourceWithFormat &
  BundleSourceWithOptions &
  BundleSourceGeneral;

export type BundleSourceResult<T extends ModuleFormat> =
  T extends 'endoZipBase64'
    ? {
        moduleFormat: 'endoZipBase64';
        endoZipBase64: string;
        endoZipBase64Sha512: string;
      }
    : T extends 'getExport' | 'nestedEvaluate'
      ? {
          moduleFormat: T;
          source: string;
          sourceMap: string;
        }
      : T extends 'endoScript'
        ? {
            moduleFormat: T;
            source: string;
          }
        : never;

export type BundleSourceSimple = <T extends 'endoZipBase64'>(
  startFilename: string,
) => Promise<BundleSourceResult<T>>;

export type BundleSourceWithFormat = <T extends ModuleFormat = 'endoZipBase64'>(
  startFilename: string,
  format: T,
  powers?: {
    read?: ReadFn;
    canonical?: CanonicalFn;
    externals?: string[];
  },
) => Promise<BundleSourceResult<T>>;

export type BundleSourceWithOptions = <
  T extends ModuleFormat = 'endoZipBase64',
>(
  startFilename: string,
  bundleOptions: BundleOptions<T>,
  powers?: {
    read?: ReadFn;
    canonical?: CanonicalFn;
    externals?: string[];
  },
) => Promise<BundleSourceResult<T>>;

export type BundleSourceGeneral = <T extends ModuleFormat = 'endoZipBase64'>(
  startFilename: string,
  formatOrOptions?: T | BundleOptions<T>,
  powers?: {
    read?: ReadFn;
    canonical?: CanonicalFn;
    externals?: string[];
  },
) => Promise<BundleSourceResult<T>>;

export type BundleOptions<T extends ModuleFormat> = {
  format?: T | undefined;
  cacheSourceMaps?: boolean | undefined;
  /**
   * - development mode, for test bundles that need
   * access to devDependencies of the entry package.
   */
  dev?: boolean | undefined;
  /**
   * - when true for the `endoScript` and
   * `endoZipBase64` format, replaces the interior of comments with blank space
   * that advances the cursor the same number of lines and columns.
   */
  elideComments?: boolean | undefined;
  /**
   * - when true, generates a bundle with the
   * original sources instead of SES-shim specific ESM and CJS. This may become
   * default in a future major version.
   */
  noTransforms?: boolean | undefined;
  /**
   * - conditions for package.json conditional
   * exports and imports.
   */
  conditions?: string[] | undefined;
};

export type ReadFn = (location: string) => Promise<Uint8Array>;

/**
 * Returns a canonical URL for a given URL, following redirects or symbolic
 * links if any exist along the path.
 * Must return the given logical location if the real location does not exist.
 */
export type CanonicalFn = (location: string) => Promise<string>;

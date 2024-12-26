/**
 * @module External types of the compartment mapper.
 */

/* eslint-disable no-use-before-define */

import type {
  FinalStaticModuleType,
  StaticModuleType,
  ThirdPartyStaticModuleInterface,
  Transform,
} from 'ses';
import type {
  CompartmentMapDescriptor,
  CompartmentDescriptor,
  Language,
  LanguageForExtension,
} from './compartment-map-schema.js';
import type { HashFn, ReadFn, ReadPowers } from './powers.js';

/**
 * Set of options available in the context of code execution.
 *
 * May be used only as an intersection with other options types.
 */
export type ExecuteOptions = Partial<{
  globals: object;
  transforms: Array<Transform>;
  __shimTransforms__: Array<Transform>;
  attenuations: Record<string, object>;
  Compartment: typeof Compartment;
  __native__: boolean;
}> &
  ModulesOption &
  ExitModuleImportHookOption;

export type ParseArchiveOptions = Partial<{
  expectedSha512: string;
  computeSha512: HashFn;
  computeSourceLocation: ComputeSourceLocationHook;
  computeSourceMapLocation: ComputeSourceMapLocationHook;
  __native__: boolean;
}> &
  ModulesOption &
  CompartmentOption &
  ParserForLanguageOption &
  ExitModuleImportHookOption;

export type LoadArchiveOptions = ParseArchiveOptions;

export type MapNodeModulesOptions = MapNodeModulesOptionsOmitPolicy &
  PolicyOption;
type MapNodeModulesOptionsOmitPolicy = Partial<{
  /** @deprecated renamed `conditions` to be consistent with Node.js */
  tags: Set<string>;
  /**
   * Conditions for package `"imports"` and `"exports"`.
   * The `"development"` condition also implies that `devDependencies` of the
   * entry package should be reachable.
   * Common conditions include `"node"`, `"browser"`, `"require"`, `"import"`,
   * and `"default"`.
   * The conditions `"import"`, `"default"`, and `"endo"` need not be
   * specified.
   */
  conditions: Set<string>;
  /**
   * @deprecated add `"development"` to the `conditions` Set option.
   * Including `devDependencies` has been subsumed by implication
   * of having the `"development"` condition.
   */
  dev: boolean;
  /**
   * Indicates that the node_modules tree should fail to map if it does not
   * strictly reach every expected package.
   * By default, unreachable packages are simply omitted from the map,
   * which defers some errors to when modules load.
   */
  strict: boolean;
  /** Dependencies to make reachable from any package */
  commonDependencies: Record<string, string>;
  /** Maps extensions to languages for all packages, like `txt` to `text` */
  languageForExtension: LanguageForExtension;
  /** Maps additional extensions to languages for all type=module packages */
  moduleLanguageForExtension: LanguageForExtension;
  /** Maps additional extensions to languages for all type=commonjs packages (default) */
  commonjsLanguageForExtension: LanguageForExtension;
  /** Maps extensions to languages for packages not under node_modules */
  workspaceLanguageForExtension: LanguageForExtension;
  /**
   * Maps additional extensions to languages for all type=module packages that
   * are not under node_modules
   */
  workspaceModuleLanguageForExtension: LanguageForExtension;
  /**
   * Maps additional extensions to languages for all type=commonjs packages
   * (default)
   */
  workspaceCommonjsLanguageForExtension: LanguageForExtension;
  /**
   * Accounts for languages not present as values in any of the extension to
   * language mappings.
   * For higher level functions like `importLocation`, these are inferred
   * from the `parserForLanguage` option.
   */
  languages: Array<Language>;
}>;

/**
 * @deprecated Use `mapNodeModules()`.
 */
export type CompartmentMapForNodeModulesOptions = Omit<
  MapNodeModulesOptions,
  'conditions' | 'tags'
>;

export type CaptureLiteOptions = ImportingOptions &
  LinkingOptions &
  PolicyOption;

export type ArchiveLiteOptions = SyncOrAsyncArchiveOptions &
  ModuleTransformsOption &
  ImportingOptions &
  ExitModuleImportHookOption &
  LinkingOptions;

export type SyncArchiveLiteOptions = SyncOrAsyncArchiveOptions &
  SyncModuleTransformsOption &
  SyncImportingOptions &
  ExitModuleImportNowHookOption;

export type ArchiveOptions = Omit<MapNodeModulesOptions, 'language'> &
  ArchiveLiteOptions;

export type BundleOptions = ArchiveOptions & {
  /**
   * Evaluates individual module functors in-place so stack traces represent
   * original source locations better.
   */
  useNamedEvaluate?: string;
  /**
   * A prefix for the sourceURL comment in each module format that supports
   * sourceURL comments.
   * Requires useNamedEvaluate for effect.
   */
  sourceUrlPrefix?: string;
};

export type SyncArchiveOptions = Omit<MapNodeModulesOptions, 'languages'> &
  SyncArchiveLiteOptions;

/**
 * Options for `loadLocation()`
 */
export type LoadLocationOptions = ArchiveOptions & SyncArchiveOptions;

/**
 * Options for `importLocation()` necessary (but not sufficient--see
 * `ReadNowPowers`) for dynamic require support
 */
export type SyncImportLocationOptions = SyncArchiveOptions & ExecuteOptions;

export type ImportLocationOptions = ArchiveOptions & ExecuteOptions;

// ////////////////////////////////////////////////////////////////////////////////
// Single Options

export type SearchSuffixesOption = {
  /**
   * Suffixes to search if the unmodified specifier is not found. Pass `[]` to
   * emulate Node.js' strict behavior. The default handles Node.js' CommonJS
   * behavior.
   * Unlike Node.js, the Compartment Mapper lifts CommonJS up, more like a
   * bundler, and does not attempt to vary the behavior of resolution depending
   * on the language of the importing module.
   */
  searchSuffixes?: string[];
};

export type SourceMapHookOption = {
  sourceMapHook?: SourceMapHook;
};

export type ModulesOption = {
  modules?: Record<string, any>;
};

export type ExitModuleImportHookOption = {
  importHook?: ExitModuleImportHook;
};

export type ExitModuleImportNowHookOption = {
  importNowHook?: ExitModuleImportNowHook;
};

export type ParserForLanguageOption = {
  parserForLanguage?: ParserForLanguage;
};

export type CompartmentOption = {
  Compartment?: typeof Compartment;
};

export type ModuleTransformsOption = {
  moduleTransforms?: ModuleTransforms;
};

export type SyncModuleTransformsOption = {
  syncModuleTransforms?: SyncModuleTransforms;
};

export type PolicyOption = {
  policy?: any;
};

export type LanguageForExtensionOption = {
  languageForExtension?: LanguageForExtension;
};

// ////////////////////////////////////////////////////////////////////////////////
// Common option groups:

export type SyncOrAsyncArchiveOptions = Partial<{
  captureSourceLocation: CaptureSourceLocationHook;
}> &
  ParserForLanguageOption &
  CompartmentOption &
  PolicyOption;

type SyncOrAsyncImportingOptions = SearchSuffixesOption & SourceMapHookOption;

type ImportingOptions = ModulesOption &
  SyncOrAsyncImportingOptions &
  ExitModuleImportHookOption;

type SyncImportingOptions = ModulesOption &
  SyncOrAsyncImportingOptions &
  ExitModuleImportNowHookOption;

type LinkingOptions = ParserForLanguageOption &
  CompartmentOption &
  SyncModuleTransformsOption &
  ModuleTransformsOption;

// ////////////////////////////////////////////////////////////////////////////////

/**
 * Result of `digestCompartmentMap()`
 */
export interface DigestResult {
  /**
   * Normalized `CompartmentMapDescriptor`
   */
  compartmentMap: CompartmentMapDescriptor;

  /**
   * Sources found in the `CompartmentMapDescriptor`
   */
  sources: Sources;

  /**
   * A record of renamed {@link CompartmentDescriptor CompartmentDescriptors}
   * from _new_ to _original_ name
   */
  newToOldCompartmentNames: Record<string, string>;

  /**
   * A record of renamed {@link CompartmentDescriptor CompartmentDescriptors}
   * from _original_ to _new_ name
   */
  oldToNewCompartmentNames: Record<string, string>;

  /**
   * Alias for `newToOldCompartmentNames`
   * @deprecated Use {@link newToOldCompartmentNames} instead.
   */
  compartmentRenames: Record<string, string>;
}

/**
 * The result of `captureFromMap`.
 */
export type CaptureResult = Omit<DigestResult, 'compartmentMap' | 'sources'> & {
  captureCompartmentMap: DigestResult['compartmentMap'];
  captureSources: DigestResult['sources'];
};

/**
 * The result of `makeArchiveCompartmentMap`
 */
export type ArchiveResult = Omit<DigestResult, 'compartmentMap' | 'sources'> & {
  archiveCompartmentMap: DigestResult['compartmentMap'];
  archiveSources: DigestResult['sources'];
};

/**
 * The compartment mapper can capture the Sources for all loaded modules
 * for bundling, archiving, or analysis.
 */
export type Sources = Record<string, CompartmentSources>;
export type CompartmentSources = Record<string, ModuleSource>;

// TODO unionize:
export type ModuleSource = Partial<{
  /** module loading error deferred to later stage */
  deferredError: string;
  /** package-relative location */
  location: string;
  /** fully qualified location */
  sourceLocation: string;
  /**
   * directory name of the original source.
   * This is safe to capture in a compartment map because it is _unlikely_ to
   * vary between hosts.
   * Package managers tend to drop a package in a consistently named location.
   * If entry package is in a workspace, git enforces consistency.
   * If entry package is the root of a repository, we rely on the developer
   * to name the package consistently and suffer an inconsistent integrity hash
   * otherwise.
   * We do not currently capture this property in a compartment map because the
   * schema validator currently (2024) deployed to Agoric blockchains does not
   * tolerate compartment maps with unknown properties.
   * https://github.com/endojs/endo/issues/2671
   */
  sourceDirname: string;
  bytes: Uint8Array;
  /** in lowercase base-16 (hexadecimal) */
  sha512: string;
  parser: Language;
  /** indicates that this is a reference that exits the mapped compartments */
  exit: string;
  /** module for the module */
  record: StaticModuleType;
}>;

export type SourceMapHook = (
  sourceMap: string,
  details: SourceMapHookDetails,
) => void;
export type SourceMapHookDetails = {
  compartment: string;
  module: string;
  location: string;
  sha512: string;
};

export type ModuleTransforms = Record<string, ModuleTransform>;

export type SyncModuleTransforms = Record<string, SyncModuleTransform>;

export type ModuleTransform = (
  ...args: ModuleTransformArguments
) => Promise<ModuleTransformResult>;
export type SyncModuleTransform = (
  ...args: ModuleTransformArguments
) => ModuleTransformResult;

type ModuleTransformArguments = [
  bytes: Uint8Array,
  specifier: string,
  moduleLocation: string,
  packageLocation: string,
  params: {
    sourceMap?: string;
  },
];

type ModuleTransformResult = {
  bytes: Uint8Array;
  parser: Language;
  sourceMap?: string;
};

export type ExitModuleImportHook = (
  specifier: string,
  packageLocation: string,
) => Promise<ThirdPartyStaticModuleInterface | undefined>;

export type ExitModuleImportNowHook = (
  specifier: string,
  packageLocation: string,
) => ThirdPartyStaticModuleInterface | undefined;

export type ComputeSourceLocationHook = (
  compartmentName: string,
  moduleSpecifier: string,
) => string | undefined;

/**
 * A hook for archiving that allows the caller to create a side-table or
 * out-of-band reference for where the archive's sources originated,
 * intended to assist debuggers.
 * When making and importing an archive locally, `import-archive.js` can inject
 * the original source location for compartment name and module specifier chosen
 * by `archive.js.
 */
export type CaptureSourceLocationHook = (
  compartmentName: string,
  moduleSpecifier: string,
  sourceLocation: string,
) => void;

export type ComputeSourceMapLocationDetails = {
  compartment: string;
  module: string;
  location: string;
  sha512: string;
};

export type ComputeSourceMapLocationHook = (
  details: ComputeSourceMapLocationDetails,
) => string;

export type ParserImplementation = {
  /**
   * Whether a heuristic is used by parser to detect imports.
   * CommonJS uses a lexer to heuristically discover static require calls.
   */
  heuristicImports: boolean;
  parse: ParseFn;
  synchronous: boolean;
};

type ParseArguments = [
  bytes: Uint8Array,
  specifier: string,
  moduleLocation: string,
  packageLocation: string,
  options?: Partial<{
    sourceMap: string;
    sourceMapHook: SourceMapHook;
    sourceMapUrl: string;
    readPowers: ReadFn | ReadPowers;
    compartmentDescriptor: CompartmentDescriptor;
  }>,
];

/**
 * Result of a {@link ParseFn} or {@link AsyncParseFn}
 */
export type ParseResult = {
  bytes: Uint8Array;
  parser: Language;
  record: FinalStaticModuleType;
  sourceMap?: string;
};

export type AsyncParseFn = (...args: ParseArguments) => Promise<ParseResult>;

export type ParseFn = { isSyncParser?: true } & ((
  ...args: ParseArguments
) => ParseResult);

/**
 * Mapping of `Language` to {@link ParserImplementation
 * ParserImplementations}
 */
export type ParserForLanguage = Record<Language | string, ParserImplementation>;

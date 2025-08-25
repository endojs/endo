/**
 * External types of the compartment mapper.
 *
 * @module
 */

/* eslint-disable no-use-before-define */

import type {
  FinalStaticModuleType,
  StaticModuleType,
  ThirdPartyStaticModuleInterface,
  Transform,
} from 'ses';
import type {
  CompartmentDescriptor,
  CompartmentMapDescriptor,
  Language,
  LanguageForExtension,
} from './compartment-map-schema.js';
import type { HashFn, ReadFn, ReadPowers } from './powers.js';
import type { SomePolicy } from './policy-schema.js';

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

/**
 * Options having an optional `log` property.
 */
export interface LogOptions {
  /**
   * A logger (for logging)
   */
  log?: LogFn;
}

/**
 * Options for `mapNodeModules()`
 */
export type MapNodeModulesOptions = MapNodeModulesOptionsOmitPolicy &
  PolicyOption &
  LogOptions;

type MapNodeModulesOptionsOmitPolicy = Partial<{
  /** @deprecated renamed `conditions` to be consistent with Node.js */
  tags: Set<string>;
  /**
   * Conditions for package `"imports"` and `"exports"`.
   *
   * Common conditions include `"node"`, `"browser"`, `"require"`, `"import"`,
   * and `"default"`. The conditions `"import"`, `"default"`, and `"endo"` need
   * not be specified.
   *
   * _If using the `"development"` condition_ and you just need to map
   * `devDependencies`, use the {@link MapNodeModulesOptions.dev dev} flag
   * instead.
   */
  conditions: Set<string>;
  /**
   * If `true`, include packages from `devDependencies` in the resulting {@link CompartmentMapDescriptor}.
   *
   * Historically this is synonymous with the `"development"`
   * {@link MapNodeModulesOptions.conditions condition}, but this behavior may
   * be deprecated in a future version.
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

/**
 * Options for `captureFromMap()`
 */
export type CaptureLiteOptions = ImportingOptions &
  LinkingOptions &
  PolicyOption &
  LogOptions &
  ForceLoadOption;

/**
 * Options bag containing a `forceLoad` array.
 */
export interface ForceLoadOption {
  /**
   * List of compartment names (the keys of
   * {@link CompartmentMapDescriptor.compartments}) to force-load _after_ the
   * entry compartment and any attenuators.
   */
  forceLoad?: Array<string>;
}

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
   * Format of the bundle for purposes of importing modules from the surrounding
   * environment.
   * The default can be CommonJS or ESM but depends on neither `require` nor `import`
   * for external modules, but errors early if the entrained modules need to import
   * a host module.
   * Specifying `cjs` makes `require` available for modules outside the bundle
   * (exits to the import graph).
   */
  format?: 'cjs';
  /**
   * Evaluates individual module functors in-place so stack traces represent
   * original source locations better.
   * The resulting script cannot be used on a web page with a no-unsafe-eval
   * Content Security Policy.
   */
  useEvaluate?: boolean;
  /**
   * A prefix for the sourceURL comment in each module format that supports
   * sourceURL comments.
   * Requires `useEvaluate` for effect.
   */
  sourceUrlPrefix?: string;
};

export type SyncArchiveOptions = Omit<MapNodeModulesOptions, 'languages'> &
  SyncArchiveLiteOptions;

/**
 * Options for `loadLocation()`
 */
export type LoadLocationOptions = ArchiveOptions &
  SyncArchiveOptions &
  LogOptions;

/**
 * Options for `importLocation()` necessary (but not sufficient--see
 * `ReadNowPowers`) for dynamic require support
 */
export type SyncImportLocationOptions = SyncArchiveOptions &
  ExecuteOptions &
  LogOptions;

/**
 * Options for `importLocation()` without dynamic require support
 */
export type ImportLocationOptions = ArchiveOptions &
  ExecuteOptions &
  LogOptions;

// ////////////////////////////////////////////////////////////////////////////////
// Single Options

export type ComputeSha512Option = {
  /**
   * For computing integrity hashes for module descriptors based on captured sources.
   */
  computeSha512?: HashFn;
};

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
  /**
   * For obtaining module descriptors for modules that must be provided
   * by the eventual runtime execution environment, asynchronously.
   */
  importHook?: ExitModuleImportHook;
};

export type ExitModuleImportNowHookOption = {
  /**
   * For obtaining module descriptors for modules that must be provided
   * by the eventual runtime execution environment, synchronusly.
   */
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

export type ArchiveOnlyOption = {
  /**
   * Whether to prepare to create an archive or script bundle for execution
   * elsewhere or elsewhen, as opposed to preparing to execute immediately.
   *
   * This has several practical effects.
   *
   * Archives expect to exit to potentially different host modules than the current
   * host, but cannot instantiate those modules.
   * For example, when preparing a bundle for execution in Node.js from within a
   * web page, exiting to `node:fs` is appropriate but cannot be instantiated.
   * So, the import hook will make a note of the exit and provide a stub module
   * that throws an error if it is imported.
   *
   * Also, importing a module graph off a local medium immediately should
   * inject a fully qualified source location into the module source,
   * but sources loaded for an archive must not capture the original source
   * location, but give the runtime an opportunity to inject a sourceURL.
   *
   * Also, the linker does not apply attenuations to the global environment
   * if it is preparing to write an archive or script bundle.
   *
   * This option does not generally surface to users, but is set by the scenario,
   * off for `importLocation`, on for `makeArchive` and `makeScript`.
   */
  archiveOnly?: boolean;
};

export type PolicyOption = {
  policy?: SomePolicy;
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
  /**
   * package-relative location.
   * Not suitable for capture in an archive or bundle since it varies from host
   * to host and would frustrate integrity hash checks.
   */
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
  }> &
    ArchiveOnlyOption,
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

/**
 * Generic logging function accepted by various functions.
 */
export type LogFn = (...args: any[]) => void;

/**
 * A string that represents a file URL.
 */
export type FileUrlString = `file://${string}`;

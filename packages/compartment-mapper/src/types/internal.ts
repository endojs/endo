/**
 * Internal types of the compartment mapper that need not be visible to
 * consumers.
 *
 * @module
 */

/* eslint-disable no-use-before-define */

import type { ImportHook, ImportNowHook, StaticModuleType } from 'ses';
import type {
  CompartmentDescriptor,
  Language,
  LanguageForExtension,
  LanguageForModuleSpecifier,
  PackageCompartmentDescriptor,
  PackageCompartmentDescriptors,
  CompartmentModuleConfiguration,
  PackageCompartmentDescriptorName,
} from './compartment-map-schema.js';
import type {
  ArchiveOnlyOption,
  AsyncParseFn,
  CompartmentSources,
  ComputeSha512Option,
  ExecuteOptions,
  ExitModuleImportHookOption,
  ExitModuleImportNowHookOption,
  FileUrlString,
  ModuleSourceHook,
  PackageConnectionsHook,
  PreloadOption,
  LogOptions,
  ModuleTransforms,
  ParseFn,
  ParserForLanguage,
  PolicyOption,
  SearchSuffixesOption,
  SourceMapHook,
  SourceMapHookOption,
  Sources,
  SyncModuleTransforms,
  CompartmentsRenameFn,
} from './external.js';
import type { PackageDescriptor } from './node-modules.js';
import type { DeferredAttenuatorsProvider } from './policy.js';
import type {
  MaybeReadFn,
  MaybeReadNowFn,
  ReadFn,
  ReadPowers,
} from './powers.js';

export type LinkOptions = {
  resolve?: ResolveHook;
  makeImportHook: ImportHookMaker;
  makeImportNowHook?: ImportNowHookMaker;
  parserForLanguage?: ParserForLanguage;
  moduleTransforms?: ModuleTransforms;
  syncModuleTransforms?: SyncModuleTransforms;
  __native__?: boolean;
} & ArchiveOnlyOption &
  ExecuteOptions &
  LogOptions;

export type LinkResult = {
  compartment: Compartment;
  compartments: Record<string, Compartment>;
  attenuatorsCompartment: Compartment;
  pendingJobsPromise: Promise<void>;
};

export type ResolveHook = (
  importSpecifier: string,
  referrerSpecifier: string,
) => string;

export type ShouldDeferError = (language: Language | undefined) => boolean;

export type MakeImportHookMakersOptions = {
  entryCompartmentName: string;
  entryModuleSpecifier: string;
  /**
   * For depositing captured sources.
   */
  sources?: Sources;
  /**
   * For depositing captured compartment descriptors.
   */
  compartmentDescriptors?: PackageCompartmentDescriptors;
  moduleSourceHook?: ModuleSourceHook | undefined;
} & ComputeSha512Option &
  SearchSuffixesOption &
  ArchiveOnlyOption &
  SourceMapHookOption &
  LogOptions;

export type MakeImportHookMakerOptions = MakeImportHookMakersOptions &
  ExitModuleImportHookOption;
export type MakeImportNowHookMakerOptions = MakeImportHookMakersOptions &
  ExitModuleImportNowHookOption;

export type ImportHookMaker = (params: {
  packageLocation: PackageCompartmentDescriptorName;
  packageName: string;
  attenuators: DeferredAttenuatorsProvider;
  parse: ParseFn | AsyncParseFn;
  shouldDeferError: ShouldDeferError;
  compartments: Record<string, Compartment>;
}) => ImportHook;

export type ImportNowHookMaker = (params: {
  packageLocation: PackageCompartmentDescriptorName;
  packageName: string;
  parse: ParseFn | AsyncParseFn;
  compartments: Record<string, Compartment>;
  shouldDeferError: ShouldDeferError;
  // Unlike analogous prameters of ImportHookMaker, the Compartment Mapper
  // ignores these two parameters, so they are expressly disallowed to avoid
  // confusion about whether they would be respected.
  attenuators?: never;
}) => ImportNowHook;

/**
 * The value returned by `makeMapParsers()`
 */
export type MapParsersFn<ParseT = AsyncParseFn | ParseFn> = (
  /** Mapping from file extension to Language (like `js` to `mjs`). */
  languageForExtension: LanguageForExtension,
  /** Mapping from module specifier to Language. */
  languageForModuleSpecifier: LanguageForModuleSpecifier,
) => ParseT;

/**
 * As used in `import-hook.js`
 */
export type ChooseModuleDescriptorParams = {
  /** Module specifiers with each search suffix appended */
  candidates: string[];
  moduleSpecifier: string;
  packageLocation: FileUrlString;
  /** Compartment descriptor from the compartment map */
  compartmentDescriptor: PackageCompartmentDescriptor;
  /** All compartment descriptors from the compartment map */
  compartmentDescriptors: PackageCompartmentDescriptors;
  /** All module descriptors in same compartment */
  moduleDescriptors: Record<string, CompartmentModuleConfiguration>;
  /** All compartments */
  compartments: Record<string, Compartment>;
  packageSources: CompartmentSources;
  readPowers: ReadPowers | ReadFn;
  /**
   * Whether to embed a sourceURL in applicable compiled sources.
   * Should be false for archives and bundles, but true for runtime.
   */
  sourceMapHook?: SourceMapHook | undefined;
  moduleSourceHook?: ModuleSourceHook | undefined;

  strictlyRequiredForCompartment: StrictlyRequiredFn;
} & ComputeSha512Option &
  ArchiveOnlyOption &
  LogOptions;

type ShouldDeferErrorOption = {
  shouldDeferError: ShouldDeferError;
};

type SyncChooseModuleDescriptorOperators = {
  /**
   * A function that reads a file, returning its binary contents _or_
   * `undefined` if the file is not found
   */
  maybeRead: MaybeReadNowFn;
  /**
   * A function that parses the (defined) binary contents from `maybeRad` into
   * a `ParseResult`
   */
  parse: ParseFn;
};

/**
 * Operators for `chooseModuleDescriptor` representing asynchronous operation.
 */
export type AsyncChooseModuleDescriptorOperators = {
  /**
   * A function that reads a file, resolving with its binary contents _or_
   * `undefined` if the file is not found
   */
  maybeRead: MaybeReadFn;
  /**
   * A function that parses the (defined) binary contents from `maybeRead` into
   * a `ParseResult`
   */
  parse: AsyncParseFn | ParseFn;
};

/**
 * Either synchronous or asynchronous operators for `chooseModuleDescriptor`.
 */
export type ChooseModuleDescriptorOperators = ShouldDeferErrorOption &
  (AsyncChooseModuleDescriptorOperators | SyncChooseModuleDescriptorOperators);

/**
 * The agglomeration of things that the `chooseModuleDescriptor` generator can
 * yield.
 *
 * The generator does not necessarily yield _all_ of these; it depends on
 * whether the operators are {@link AsyncChooseModuleDescriptorOperators} or
 * {@link SyncChooseModuleDescriptorOperators}.
 */
export type ChooseModuleDescriptorYieldables =
  | ReturnType<ChooseModuleDescriptorOperators['maybeRead']>
  | ReturnType<ChooseModuleDescriptorOperators['parse']>;

/**
 * Parameters for `findRedirect()`.
 */
export type FindRedirectParams = {
  compartmentDescriptor: CompartmentDescriptor;
  compartmentDescriptors: Record<string, CompartmentDescriptor>;
  compartments: Record<string, Compartment>;
  /* A module specifier which is an absolute path. NOT a `file://` URL. */
  absoluteModuleSpecifier: string;
};

/**
 * Options for `makeMapParsers()`
 */
export type MakeMapParsersOptions = {
  /** Mapping of language to `ParserImplementation` */
  parserForLanguage: ParserForLanguage;
  /**
   * Async or sync module transforms.
   * If non-empty, synchronous import (specifically dynamic `require` in
   * CommonJS or `compartment.importNow`) are unsupported.
   */
  moduleTransforms?: ModuleTransforms;
  /**
   * Sync module transforms.
   * Always supported.
   */
  syncModuleTransforms?: SyncModuleTransforms;
};

/**
 * Options for `search()`
 */
export type SearchOptions = LogOptions;

/**
 * Object fulfilled from `search()`
 */
export interface SearchResult {
  packageLocation: string;
  packageDescriptorLocation: string;
  packageDescriptorText: string;
  moduleSpecifier: string;
}

/**
 * Object fulfilled from `searchDescriptor()`
 *
 * @template T The datatype; may be a {@link PackageDescriptor}, blob, string, etc.
 */
export interface SearchDescriptorResult<T> {
  data: T;
  directory: string;
  location: string;
  packageDescriptorLocation: string;
}

/**
 * Options for `searchDescriptor()`
 */
export type SearchDescriptorOptions = LogOptions;

/**
 * A power to read a package descriptor
 * @template T Format of package descriptor
 * @deprecated Use {@link MaybeReadDescriptorFn} instead.
 */
export type ReadDescriptorFn<T = PackageDescriptor> = (
  location: string,
) => Promise<T>;

/**
 * A power to _maybe_ read a package descriptor
 * @template T Format of package descriptor
 */
export type MaybeReadDescriptorFn<T = PackageDescriptor> = (
  location: string,
) => Promise<T | undefined>;

/**
 * Function returning a set of module names (scoped to the compartment) whose
 * parser is not using heuristics to determine imports.
 */
export type StrictlyRequiredFn = (compartmentName: string) => Set<string>;

/**
 * Function which decides whether to throw an error immediately upon failing to
 * load a module or defer to execution time.
 *
 * @returns A phony `StaticModuleType` which throws when executed
 */
export type DeferErrorFn = (
  /**
   * The module specifier that failed to load
   */
  specifier: string,
  /**
   * The error that was thrown
   */
  error: Error,
) => StaticModuleType;

export type MakeLoadCompartmentsOptions = LogOptions &
  PolicyOption &
  PreloadOption;

export type DigestCompartmentMapOptions<
  OldCompartmentName extends string = FileUrlString,
  NewCompartmentName extends string = PackageCompartmentDescriptorName,
> = LogOptions & {
  packageConnectionsHook?: PackageConnectionsHook | undefined;
  renameCompartments?: CompartmentsRenameFn<
    OldCompartmentName,
    NewCompartmentName
  >;
};

export type CaptureCompartmentMapOptions = DigestCompartmentMapOptions;

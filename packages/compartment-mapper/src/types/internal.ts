/**
 * @module Internal types of the compartment mapper that need not be visible to
 * consumers.
 */

/* eslint-disable no-use-before-define */

import type { ImportHook, ImportNowHook } from 'ses';
import type {
  CompartmentDescriptor,
  Language,
  LanguageForExtension,
  LanguageForModuleSpecifier,
  ModuleDescriptor,
} from './compartment-map-schema.js';
import type {
  HashFn,
  MaybeReadFn,
  MaybeReadNowFn,
  ReadFn,
  ReadPowers,
} from './powers.js';
import type { DeferredAttenuatorsProvider } from './policy.js';
import type {
  AsyncParseFn,
  CompartmentSources,
  ExecuteOptions,
  ExitModuleImportNowHook,
  ModuleTransforms,
  ParseFn,
  ParserForLanguage,
  SearchSuffixesOption,
  SourceMapHook,
  SourceMapHookOption,
  Sources,
  SyncModuleTransforms,
} from './external.js';

export type LinkOptions = {
  resolve?: ResolveHook;
  makeImportHook: ImportHookMaker;
  makeImportNowHook?: ImportNowHookMaker;
  parserForLanguage?: ParserForLanguage;
  moduleTransforms?: ModuleTransforms;
  syncModuleTransforms?: SyncModuleTransforms;
  archiveOnly?: boolean;
  __native__?: boolean;
} & ExecuteOptions;

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

export type MakeImportNowHookMakerOptions = Partial<{
  sources: Sources;
  compartmentDescriptors: Record<string, CompartmentDescriptor>;
  computeSha512: HashFn;
  exitModuleImportNowHook: ExitModuleImportNowHook;
}> &
  SearchSuffixesOption &
  SourceMapHookOption;

export type ImportHookMaker = (params: {
  packageLocation: string;
  packageName: string;
  attenuators: DeferredAttenuatorsProvider;
  parse: ParseFn | AsyncParseFn;
  shouldDeferError: ShouldDeferError;
  compartments: Record<string, Compartment>;
}) => ImportHook;

export type ImportNowHookMaker = (params: {
  packageLocation: string;
  packageName: string;
  parse: ParseFn | AsyncParseFn;
  compartments: Record<string, Compartment>;
  // Unlike analogous prameters of ImportHookMaker, the Compartment Mapper
  // ignores these two parameters, so they are expressly disallowed to avoid
  // confusion about whether they would be respected.
  attenuators?: never;
  shouldDeferError?: never;
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
  packageLocation: string;
  /** Compartment descriptor from the compartment map */
  compartmentDescriptor: CompartmentDescriptor;
  /** All compartment descriptors from the compartment map */
  compartmentDescriptors: Record<string, CompartmentDescriptor>;
  /** All module descriptors in same compartment */
  moduleDescriptors: Record<string, ModuleDescriptor>;
  /** All compartments */
  compartments: Record<string, Compartment>;
  packageSources: CompartmentSources;
  /** Function to compute SHA-512 hash */
  computeSha512?: HashFn;
  readPowers: ReadPowers | ReadFn;
  sourceMapHook?: SourceMapHook;
  /**
   * Function returning a set of module names (scoped to the compartment) whose
   * parser is not using heuristics to determine imports.
   */
  strictlyRequiredForCompartment: (compartmentName: string) => Set<string>;
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
  /** Should be omitted */
  shouldDeferError?: never;
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
  /**
   * A function that returns `true` if the language returned by `parse` should
   * defer errors.
   */
  shouldDeferError: (language: Language) => boolean;
};

/**
 * Either synchronous or asynchronous operators for `chooseModuleDescriptor`.
 */
export type ChooseModuleDescriptorOperators =
  | AsyncChooseModuleDescriptorOperators
  | SyncChooseModuleDescriptorOperators;

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
  /** Location of the compartment descriptor's package. */
  packageLocation: string;
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

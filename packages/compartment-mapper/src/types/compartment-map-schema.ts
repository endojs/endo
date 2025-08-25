/**
 * These types describe the schema of a `compartment-map.json`, which
 * in turn describes how to load and link an application from storage, like a
 * file system, web host, or zip archive.
 *
 * @module
 */

/* eslint-disable no-use-before-define */

import type {
  ATTENUATORS_COMPARTMENT,
  ENTRY_COMPARTMENT,
} from '../policy-format.js';
import type { CanonicalName } from './canonical-name.js';
import type { FileUrlString, PackageDescriptor } from './external.js';
import type { SomePackagePolicy } from './policy-schema.js';
import type { LiteralUnion } from './typescript.js';

/**
 * The type of a {@link CompartmentMapDescriptor.compartments} property.
 */
export type CompartmentDescriptors<
  T extends CompartmentDescriptor = CompartmentDescriptor,
  K extends string = string,
> = Record<K, T>;

/**
 * A compartment map describes how to construct an application as a graph of
 * Compartments, each corresponding to Node.js style packaged modules.
 */
export type CompartmentMapDescriptor<
  T extends CompartmentDescriptor = CompartmentDescriptor,
  Name extends string = string,
  EntryName extends string = Name,
> = {
  tags: Array<string>;
  entry: EntryDescriptor<EntryName>;
  compartments: CompartmentDescriptors<T, Name>;
};

/**
 * The type of a {@link PackageCompartmentMapDescriptor.compartments} property.
 */
export type PackageCompartmentDescriptors = CompartmentDescriptors<
  PackageCompartmentDescriptor,
  PackageCompartmentDescriptorName
>;

/**
 * The {@link CompartmentDescriptor} type in the
 * {@link PackageCompartmentMapDescriptor} returned by `mapNodeModules()`
 */
export type PackageCompartmentMapDescriptor = CompartmentMapDescriptor<
  PackageCompartmentDescriptor,
  PackageCompartmentDescriptorName,
  FileUrlString
>;

export interface FileCompartmentDescriptor
  extends CompartmentDescriptor<
    FileModuleDescriptorConfiguration | CompartmentModuleDescriptorConfiguration
  > {
  location: FileUrlString;
}

export type FileCompartmentDescriptors =
  CompartmentDescriptors<FileCompartmentDescriptor>;

export type FileCompartmentMapDescriptor =
  CompartmentMapDescriptor<FileCompartmentDescriptor>;

/**
 * The entry descriptor of a compartment map denotes the root module of an
 * application and the compartment that contains it.
 */
export type EntryDescriptor<K extends string = string> = {
  compartment: K;
  module: string;
};

/**
 * Keys of {@link PackageCompartmentMapDescriptor.compartments}
 */
export type PackageCompartmentDescriptorName = LiteralUnion<
  typeof ATTENUATORS_COMPARTMENT,
  FileUrlString
>;

export interface PackageCompartmentDescriptor
  extends CompartmentDescriptor<CompartmentModuleDescriptorConfiguration> {
  label: LiteralUnion<
    typeof ATTENUATORS_COMPARTMENT | typeof ENTRY_COMPARTMENT,
    string
  >;

  location: LiteralUnion<typeof ATTENUATORS_COMPARTMENT, FileUrlString>;

  name: LiteralUnion<
    typeof ATTENUATORS_COMPARTMENT | typeof ENTRY_COMPARTMENT,
    string
  >;

  scopes: Record<string, ScopeDescriptor<FileUrlString>>;

  sourceDirname: string;

  retained?: never;
}

/**
 * A compartment descriptor corresponds to a single Compartment
 * of an assembled Application and describes how to construct
 * one for a given library or application `package.json`.
 */
export interface CompartmentDescriptor<
  T extends ModuleDescriptorConfiguration = ModuleDescriptorConfiguration,
  U extends string = string,
> {
  label: CanonicalName<U>;
  /**
   * the name of the originating package suitable for constructing a sourceURL
   * prefix that will match it to files in a developer workspace.
   */
  name: string;
  modules: Record<string, T>;
  scopes?: Record<string, ScopeDescriptor>;
  /** language for extension */
  parsers?: LanguageForExtension;
  /** language for module specifier */
  types?: LanguageForModuleSpecifier;
  /** policy specific to compartment */
  policy?: SomePackagePolicy;

  location: string;
  /**
   * name of the parent directory of the package from which the compartment is derived,
   * for purposes of generating sourceURL comments that are most likely to unite with the original sources in an IDE workspace.
   */
  sourceDirname?: string;

  /**
   * whether this compartment was retained by any module in the solution. This
   * property should never appear in an archived compartment map.
   */
  retained?: true;
}

export type CompartmentDescriptorWithPolicy<
  T extends ModuleDescriptorConfiguration = ModuleDescriptorConfiguration,
> = Omit<CompartmentDescriptor<T>, 'policy'> & { policy: SomePackagePolicy };

/**
 * A compartment descriptor digested by `digestCompartmentMap()`
 */
export interface DigestedCompartmentDescriptor
  extends CompartmentDescriptor<SourceModuleDescriptorConfiguration> {
  path: never;
  retained: never;
  scopes: never;
  parsers: never;
  types: never;
  __createdBy: never;
  sourceDirname: never;
}

export type DigestedCompartmentDescriptors =
  CompartmentDescriptors<DigestedCompartmentDescriptor>;

export type DigestedCompartmentMapDescriptor =
  CompartmentMapDescriptor<DigestedCompartmentDescriptor>;

/**
 * For every module explicitly mentioned in an `exports` field of a
 * `package.json`, there is a corresponding `ModuleDescriptorConfiguration`.
 */
export type ModuleDescriptorConfiguration =
  | SourceModuleDescriptorConfiguration
  | CompartmentModuleDescriptorConfiguration;

export type ModuleDescriptorConfigurationCreator =
  | 'link'
  | 'transform'
  | 'import-hook'
  | 'digest'
  | 'node-modules';

export interface BaseModuleDescriptorConfiguration {
  deferredError?: string;

  retained?: true;

  __createdBy?: ModuleDescriptorConfigurationCreator;
}

export interface ErrorModuleDescriptorConfiguration
  extends BaseModuleDescriptorConfiguration {
  deferredError: string;
}

/**
 * For every module explicitly mentioned in an `exports` field of a
 * `package.json`, there is a corresponding `CompartmentModuleDescriptorConfiguration`.
 */
export interface CompartmentModuleDescriptorConfiguration
  extends BaseModuleDescriptorConfiguration {
  /**
   * The name of the compartment that contains this module.
   */
  compartment: FileUrlString;
  /**
   * The module name within {@link CompartmentDescriptor.modules} of the
   * `CompartmentDescriptor` referred to by {@link compartment}
   */
  module: string;
}

export interface ExitModuleDescriptorConfiguration
  extends BaseModuleDescriptorConfiguration {
  exit: string;
}

export interface FileModuleDescriptorConfiguration
  extends BaseModuleDescriptorConfiguration {
  location?: string;
  parser: Language;
  /** in base 16, hex */
  sha512?: string;
}

export type SourceModuleDescriptorConfiguration =
  | FileModuleDescriptorConfiguration
  | ExitModuleDescriptorConfiguration
  | ErrorModuleDescriptorConfiguration;

/**
 * Scope descriptors link all names under a prefix to modules in another
 * compartment, like a wildcard.
 * These are employed to link any module not explicitly mentioned
 * in a `package.json` file, when that `package.json` file does not have
 * an explicit `exports` map.
 */
export type ScopeDescriptor<T extends string = string> = {
  /**
   * A compartment name; not a `Compartment`.
   */
  compartment: T;
  module?: string;
};

/**
 * Natively-recognized and custom languages
 */
export type Language = LiteralUnion<BuiltinLanguage, string>;

/**
 * Languages natively recognized by `compartment-mapper`
 */
export type BuiltinLanguage =
  | 'mjs'
  | 'cjs'
  | 'json'
  | 'bytes'
  | 'text'
  | 'pre-mjs-json'
  | 'pre-cjs-json';

/**
 * Mapping of file extension to {@link Language Languages}.
 */
export type LanguageForExtension = Record<string, Language>;

/**
 * Mapping of module specifier to {@link Language Languages}.
 */
export type LanguageForModuleSpecifier = Record<string, Language>;

export type ModuleDescriptorConfigurationKind =
  | 'file'
  | 'compartment'
  | 'exit'
  | 'error';

export type ModuleDescriptorConfigurationKindToType<
  T extends ModuleDescriptorConfigurationKind,
> = T extends 'file'
  ? FileModuleDescriptorConfiguration
  : T extends 'compartment'
    ? CompartmentModuleDescriptorConfiguration
    : T extends 'exit'
      ? ExitModuleDescriptorConfiguration
      : T extends 'error'
        ? ErrorModuleDescriptorConfiguration
        : never;

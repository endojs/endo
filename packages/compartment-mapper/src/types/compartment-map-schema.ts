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
import type { FileUrlString } from './external.js';
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
    FileModuleConfiguration | CompartmentModuleConfiguration
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
  extends CompartmentDescriptor<CompartmentModuleConfiguration> {
  label: LiteralUnion<
    typeof ATTENUATORS_COMPARTMENT | typeof ENTRY_COMPARTMENT,
    string
  >;

  version: string;

  location: PackageCompartmentDescriptorName;

  name: LiteralUnion<
    typeof ATTENUATORS_COMPARTMENT | typeof ENTRY_COMPARTMENT,
    string
  >;

  scopes: Record<string, ScopeDescriptor<PackageCompartmentDescriptorName>>;

  sourceDirname: string;
}

/**
 * A compartment descriptor corresponds to a single Compartment
 * of an assembled Application and describes how to construct
 * one for a given library or application `package.json`.
 */
export interface CompartmentDescriptor<
  T extends ModuleConfiguration = ModuleConfiguration,
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
  T extends ModuleConfiguration = ModuleConfiguration,
> = Omit<CompartmentDescriptor<T>, 'policy'> & { policy: SomePackagePolicy };

/**
 * A compartment descriptor digested by `digestCompartmentMap()`
 */
export interface DigestedCompartmentDescriptor
  extends CompartmentDescriptor<ModuleConfiguration> {
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
 * `package.json`, there is a corresponding `ModuleConfiguration`.
 */
export type ModuleConfiguration =
  | ErrorModuleConfiguration
  | ExitModuleConfiguration
  | FileModuleConfiguration
  | CompartmentModuleConfiguration;

export type ModuleConfigurationCreator =
  | 'link'
  | 'transform'
  | 'import-hook'
  | 'digest'
  | 'node-modules';

export interface BaseModuleConfiguration {
  deferredError?: string;

  retained?: true;

  __createdBy?: ModuleConfigurationCreator;
}

export interface ErrorModuleConfiguration extends BaseModuleConfiguration {
  deferredError: string;
}

/**
 * This module configuration is a reference to another module in a a compartment descriptor (it may be the same compartment descriptor)
 */
export interface CompartmentModuleConfiguration
  extends BaseModuleConfiguration {
  /**
   * The name of the compartment that contains this module.
   */
  compartment: LiteralUnion<typeof ATTENUATORS_COMPARTMENT, FileUrlString>;
  /**
   * The module name within {@link CompartmentDescriptor.modules} of the
   * `CompartmentDescriptor` referred to by {@link compartment}
   */
  module: string;
}

/**
 * A module configuration representing an exit module
 */
export interface ExitModuleConfiguration extends BaseModuleConfiguration {
  exit: string;
}

/**
 * A module configuration representing a file on disk
 */
export interface FileModuleConfiguration extends BaseModuleConfiguration {
  location?: string;
  parser: Language;
  /** in base 16, hex */
  sha512?: string;
}

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

export type ModuleConfigurationKind = 'file' | 'compartment' | 'exit' | 'error';

export type ModuleConfigurationKindToType<T extends ModuleConfigurationKind> =
  T extends 'file'
    ? FileModuleConfiguration
    : T extends 'compartment'
      ? CompartmentModuleConfiguration
      : T extends 'exit'
        ? ExitModuleConfiguration
        : T extends 'error'
          ? ErrorModuleConfiguration
          : never;

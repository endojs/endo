/**
 * @module These types describe the schema of a `compartment-map.json`, which
 * in turn describes how to load and link an application from storage, like a
 * file system, web host, or zip archive.
 */

/* eslint-disable no-use-before-define */

import type { SomePackagePolicy } from './policy-schema.js';
import type { LiteralUnion } from './typescript.js';

/**
 * A compartment map describes how to construct an application as a graph of
 * Compartments, each corresponding to Node.js style packaged modules.
 */
export type CompartmentMapDescriptor = {
  tags: Array<string>;
  entry: EntryDescriptor;
  compartments: Record<string, CompartmentDescriptor>;
};

/**
 * The entry descriptor of a compartment map denotes the root module of an
 * application and the compartment that contains it.
 */
export type EntryDescriptor = {
  compartment: string;
  module: string;
};

/**
 * A compartment descriptor corresponds to a single Compartment
 * of an assembled Application and describes how to construct
 * one for a given library or application `package.json`.
 */
export type CompartmentDescriptor = {
  label: string;
  /** shortest path of dependency names to this compartment */
  path?: Array<string>;
  /**
   * the name of the originating package suitable for constructing a sourceURL
   * prefix that will match it to files in a developer workspace.
   */
  name: string;
  location: string;
  /**
   * whether this compartment was retained by any module in the solution. This
   * property should never appear in an archived compartment map.
   */
  retained?: boolean;
  modules: Record<string, ModuleDescriptor>;
  scopes: Record<string, ScopeDescriptor>;
  /** language for extension */
  parsers: LanguageForExtension;
  /** language for module specifier */
  types: LanguageForModuleSpecifier;
  /** policy specific to compartment */
  policy: SomePackagePolicy;
  /** List of compartment names this Compartment depends upon */
  compartments: Set<string>;
};

/**
 * For every module explicitly mentioned in an `exports` field of a
 * `package.json`, there is a corresponding module descriptor.
 */
export type ModuleDescriptor = {
  compartment?: string;
  module?: string;
  location?: string;
  parser?: Language;
  /** in base 16, hex */
  sha512?: string;
  exit?: string;
  deferredError?: string;
  retained?: boolean;
};

/**
 * Scope descriptors link all names under a prefix to modules in another
 * compartment, like a wildcard.
 * These are employed to link any module not explicitly mentioned
 * in a `package.json` file, when that `package.json` file does not have
 * an explicit `exports` map.
 */
export type ScopeDescriptor = {
  compartment: string;
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

import type { GenericGraph } from '../generic-graph.js';
import type { ATTENUATORS_COMPARTMENT } from '../policy-format.js';
import type {
  CanonicalName,
  CompartmentMapDescriptor,
  ModuleDescriptorConfiguration,
  PackageCompartmentDescriptorName,
  PolicyOption,
  ScopeDescriptor,
  SomePackagePolicy,
  SomePolicy,
} from '../types.js';
import type {
  CompartmentModuleDescriptorConfiguration,
  Language,
  LanguageForExtension,
  PackageCompartmentDescriptor,
  PackageCompartmentMapDescriptor,
} from './compartment-map-schema.js';
import type {
  FileUrlString,
  LogOptions,
  PackageDescriptorHook,
  PackageDependenciesHook,
} from './external.js';
import type { LiteralUnion } from './typescript.js';

export type CommonDependencyDescriptors = Record<
  string,
  { spec: string; alias: string }
>;

/**
 * Options bag containing {@link CommonDependencyDescriptors} that will be added to
 * _all_ packages in the graph.
 */
export type CommonDependencyDescriptorsOptions = {
  /**
   * Dependencies added to _all_ packages
   */
  commonDependencyDescriptors?: CommonDependencyDescriptors;
};

/**
 * Options for `graphPackage()`
 */
export type GraphPackageOptions = {
  logicalPath?: string[];
  packageDescriptorHook?: PackageDescriptorHook | undefined;
  packageDependenciesHook?: PackageDependenciesHook | undefined;
  policy?: SomePolicy;
} & LogOptions &
  CommonDependencyDescriptorsOptions;

/**
 * Options for `graphPackages()`
 */
export type GraphPackagesOptions = {
  packageDescriptorHook?: PackageDescriptorHook | undefined;
  packageDependenciesHook?: PackageDependenciesHook | undefined;
  policy?: SomePolicy;
} & LogOptions;

/**
 * Options for `gatherDependency()`
 */
export type GatherDependencyOptions = {
  childLogicalPath?: string[];
  /**
   * If `true` the dependency is optional
   */
  optional?: boolean;
  packageDescriptorHook?: PackageDescriptorHook | undefined;
  packageDependenciesHook?: PackageDependenciesHook | undefined;
  policy?: SomePolicy;
} & LogOptions &
  CommonDependencyDescriptorsOptions;

/**
 * The type of a `package.json` file containing relevant fields; used by `graphPackages` and its ilk
 */
export interface PackageDescriptor {
  /**
   * TODO: In reality, this is optional, but `graphPackage` does not consider it to be. This will need to be fixed once support for "anonymous" packages lands; see https://github.com/endojs/endo/pull/2664
   */
  name: string;
  version?: string;
  /**
   * TODO: Update with proper type when this field is handled.
   */
  exports?: unknown;
  type?: 'module' | 'commonjs';
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundleDependencies?: string[];
  peerDependenciesMeta?: Record<
    string,
    { optional?: boolean; [k: string]: unknown }
  >;
  module?: string;
  browser?: Record<string, string> | string;

  main?: string;

  [k: string]: unknown;
}

/**
 * Value in {@link Graph}
 */
export interface Node {
  /**
   * Informative compartment label based on the package name and version (if available)
   */
  label: string;
  /**
   * Package name
   */
  name: string;
  path: Array<string>;
  logicalPath: Array<string>;
  /**
   * `true` if the package's {@link PackageDescriptor} has an `exports` field
   */
  explicitExports: boolean;
  internalAliases: Record<string, string>;
  externalAliases: Record<string, string>;
  /**
   * The name of the original package's parent directory, for reconstructing
   * a sourceURL that is likely to converge with the original location in an IDE.
   */
  sourceDirname: string;
  /**
   * An object whose keys are the thing being imported, and the values are the
   * names of the matching module (relative to the containing package's root;
   * i.e. the URL that was used as the key of graph).
   *
   * The values are the keys of other {@link Node Nodes} in the {@link Graph}.
   */
  dependencyLocations: Record<string, FileUrlString>;
  parsers: LanguageForExtension;
  types: Record<string, Language>;
  packageDescriptor: PackageDescriptor;
}

/**
 * A node in the graph that has been finalized, meaning it has a `label` and is
 * ready for conversion into a `CompartmentDescriptor`.
 */
export interface FinalNode extends Node {
  /**
   * Canonical name of the package; used to identify it in policy
   */
  label: string;

  packagePolicy?: SomePackagePolicy;
}

/**
 * The graph is an intermediate object model that the functions of this module
 * build by exploring the `node_modules` tree dropped by tools like npm and
 * consumed by tools like Node.js. This gets translated finally into a
 * compartment map.
 *
 * Keys may either be a file URL string to a package or the special
 * `<ATTENUATORS>` string.
 */
export type Graph = Record<LiteralUnion<'<ATTENUATORS>', FileUrlString>, Node>;

export type FinalGraph = Record<
  PackageCompartmentDescriptorName,
  Readonly<FinalNode>
>;

export interface LanguageOptions {
  commonjsLanguageForExtension: LanguageForExtension;
  moduleLanguageForExtension: LanguageForExtension;
  workspaceCommonjsLanguageForExtension: LanguageForExtension;
  workspaceModuleLanguageForExtension: LanguageForExtension;
  languages: Set<string>;
}

/**
 * Object result of `findPackage()`
 */
export interface PackageDetails {
  packageLocation: FileUrlString;
  packageDescriptor: PackageDescriptor;
}

/**
 * Specific type of {@link GenericGraph} that uses file URL strings for nodes;
 * used by `mapNodeModules()` and its ilk.
 */
export type LogicalPathGraph = GenericGraph<FileUrlString>;

export type DigestExternalAliasesFn = (
  dependencyName: string,
  dependencyLocation: FileUrlString,
) => Promise<void>;

export interface TranslateGraphOptions extends LogOptions {
  policy?: SomePolicy;
  packageDependenciesHook?: PackageDependenciesHook | undefined;
}

/**
 * Mapping to enable reverse-lookups of `CompartmentDescriptor`s from policy.
 */
export type CanonicalNameMap<
  CompartmentMap extends
    CompartmentMapDescriptor = PackageCompartmentMapDescriptor,
> =
  CompartmentMap extends CompartmentMapDescriptor<infer _, infer K>
    ? Map<CanonicalName | typeof ATTENUATORS_COMPARTMENT, K>
    : never;

export type MakeDigestExternalAliasesFn = (
  moduleDescriptors: Record<string, CompartmentModuleDescriptorConfiguration>,
  scopes: Record<string, ScopeDescriptor>,
  packagePolicy?: SomePackagePolicy | undefined,
) => DigestExternalAliasesFn;

export type MakeDigestExternalAliasesMakerFn = (
  graph: FinalGraph,
  options: LogOptions & PolicyOption,
) => MakeDigestExternalAliasesFn;

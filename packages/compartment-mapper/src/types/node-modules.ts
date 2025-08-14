import type {
  PackageDescriptor,
  FileUrlString,
  LogOptions,
} from './external.js';
import type { GenericGraph } from '../generic-graph.js';
import type {
  CompartmentMapDescriptor,
  Language,
  LanguageForExtension,
  PackageCompartmentDescriptorName,
  PackageCompartmentMapDescriptor,
} from './compartment-map-schema.js';
import type { LiteralUnion } from './typescript.js';
import type { CanonicalName } from './canonical-name.js';
import type { ATTENUATORS_COMPARTMENT } from '../policy-format.js';

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
export type GraphPackageOptions = LogOptions &
  CommonDependencyDescriptorsOptions;

/**
 * Options for `graphPackages()`
 */
export type GraphPackagesOptions = LogOptions;

/**
 * Options for `gatherDependency()`
 */
export type GatherDependencyOptions = {
  /**
   * If `true` the dependency is optional
   */
  optional?: boolean;
} & LogOptions &
  CommonDependencyDescriptorsOptions;

/**
 * Value in {@link Graph}
 */
export interface Node {
  /**
   * Package name
   */
  name: string;
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
}

/**
 * The graph is an intermediate object model that the functions of this module
 * build by exploring the `node_modules` tree dropped by tools like npm and
 * consumed by tools like Node.js. This gets translated finally into a
 * compartment map.
 */
export type Graph = Record<PackageCompartmentDescriptorName, Node>;

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

/**
 * This mapping is provided to `applyCompartmentMapTransforms()` to enable
 * reverse-lookups of `CompartmentDescriptor`s from policy.
 */
export type CanonicalNameMap<
  CompartmentMap extends
    CompartmentMapDescriptor = PackageCompartmentMapDescriptor,
> =
  CompartmentMap extends CompartmentMapDescriptor<infer _, infer K>
    ? Map<CanonicalName | typeof ATTENUATORS_COMPARTMENT, K>
    : never;

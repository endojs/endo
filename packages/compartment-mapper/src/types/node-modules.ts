import type {
  Language,
  LanguageForExtension,
} from './compartment-map-schema.js';
import type {
  AdditionalPackageDetailsOptions,
  LogOptions,
} from './external.js';
import type { PackageDescriptor } from './internal.js';
import type { SomePolicy } from './policy-schema.js';

export type CommonDependencyDescriptors = Record<
  string,
  { spec: string; alias: string }
>;

export type GatherDependencyOptions = {
  childLogicalPath?: string[];
  /**
   * If `true` the dependency is optional
   */
  optional?: boolean;
  /**
   * Dependencies added to _all_ packages
   */
  commonDependencyDescriptors?: CommonDependencyDescriptors;
} & LogOptions;

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
  dependencyLocations: Record<string, string>;
  parsers: LanguageForExtension;
  types: Record<string, Language>;
}

/**
 * The graph is an intermediate object model that the functions of this module
 * build by exploring the `node_modules` tree dropped by tools like npm and
 * consumed by tools like Node.js.
 * This gets translated finally into a compartment map.
 */
export type Graph = Record<string, Node>;

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
  packageLocation: string;
  packageDescriptor: PackageDescriptor;
}

/**
 * Options for `translateGraph()`
 */
export type TranslateGraphOptions = {
  policy?: SomePolicy;
} & AdditionalPackageDetailsOptions;

export type GraphPackageOptions = {
  preferredPackageLogicalPathMap?: Map<string, string[]>;
  logicalPath?: string[];
  commonDependencyDescriptors?: CommonDependencyDescriptors;
} & LogOptions;

export type GraphPackagesOptions = LogOptions & {
  graph?: Graph;
};

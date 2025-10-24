/* eslint-disable no-underscore-dangle */
/**
 * Provides functions for constructing a compartment map that has a
 * compartment descriptor corresponding to every reachable package from an
 * entry module and how to create links between them.
 * The resulting compartment map does not describe individual modules but does
 * capture every usable route between packages including those generalized by
 * wildcard expansion.
 * See {@link link} to expand a compartment map to capture module descriptors
 * for transitive dependencies.
 *
 * @module
 */

/* eslint no-shadow: 0 */

import { inferExportsAndAliases } from './infer-exports.js';
import { parseLocatedJson } from './json.js';
import { join } from './node-module-specifier.js';
import {
  assertPolicy,
  ATTENUATORS_COMPARTMENT,
  ENTRY_COMPARTMENT,
  generateCanonicalName,
} from './policy-format.js';
import { dependencyAllowedByPolicy, makePackagePolicy } from './policy.js';
import { unpackReadPowers } from './powers.js';
import { search, searchDescriptor } from './search.js';
import { GenericGraph, makeShortestPath } from './generic-graph.js';

/**
 * @import {
 *   CanonicalFn,
 *   CompartmentDescriptor,
 *   CompartmentMapDescriptor,
 *   CompartmentMapForNodeModulesOptions,
 *   FileUrlString,
 *   LanguageForExtension,
 *   MapNodeModulesOptions,
 *   MaybeReadDescriptorFn,
 *   MaybeReadFn,
 *   MaybeReadPowers,
 *   PackageDescriptor,
 *   ReadFn,
 *   ReadPowers,
 *   SomePolicy,
 *   LogFn,
 *   CompartmentModuleDescriptorConfiguration,
 *   PackageCompartmentDescriptor,
 *   PackageCompartmentMapDescriptor,
 ScopeDescriptor,
 ModuleDescriptorConfiguration,
 LiteralUnion,
 CanonicalName,
 SomePackagePolicy,
 PackageCompartmentDescriptorName,
 * } from './types.js'
 * @import {
 *   Graph,
 *   Node,
 *   LanguageOptions,
 *   CommonDependencyDescriptors,
 *   GatherDependencyOptions,
 *   GraphPackageOptions,
 *   GraphPackagesOptions,
 *   LogicalPathGraph,
 *   PackageDetails,
 *   FinalGraph,
 *   CanonicalNameMap,
 *   FinalNode,
 TranslateGraphOptions,
 * } from './types/node-modules.js'
 */

const { assign, create, keys, values, entries, freeze } = Object;

const decoder = new TextDecoder();

// q, as in quote, for enquoting strings in error messages.
const { quote: q } = assert;

/**
 * Default logger that does nothing.
 */
const noop = () => {};

/**
 * Default handler for unknown canonical names found in policy.
 * Logs a warning when a canonical name from policy is not found in the compartment map.
 *
 * @param {object} params
 * @param {CanonicalName} params.canonicalName
 * @param {string} params.message
 * @param {LogFn} params.log
 */
const defaultUnknownCanonicalNameHandler = ({
  canonicalName,
  message,
  log,
}) => {
  log(`WARN: Invalid resource ${q(canonicalName)} in policy: ${message}`);
};

/**
 * Default filter for package dependencies based on policy.
 * Filters out dependencies not allowed by the package policy.
 *
 * @param {object} params - The parameters object
 * @param {CanonicalName} params.canonicalName - The canonical name of the package
 * @param {Readonly<Set<CanonicalName>>} params.dependencies - The set of dependencies
 * @param {LogFn} params.log - The logging function
 * @param {SomePolicy} policy - The policy to check against
 * @returns {Partial<{ dependencies: Set<CanonicalName> }> | void}
 */
const defaultPackageDependenciesFilter = (
  { canonicalName, dependencies, log },
  policy,
) => {
  const packagePolicy = makePackagePolicy(canonicalName, { policy });
  const filteredDependencies = new Set(
    [...dependencies].filter(dependency => {
      const allowed = dependencyAllowedByPolicy(dependency, packagePolicy);
      if (!allowed) {
        log(
          `Excluding dependency ${q(dependency)} of package ${q(canonicalName)} per policy`,
        );
      }
      return allowed;
    }),
  );

  return filteredDependencies.size !== dependencies.size
    ? { dependencies: filteredDependencies }
    : undefined;
};

/**
 * Given a relative path andd URL, return a fully qualified URL string.
 *
 * @overload
 * @param {string} rel - a relative URL
 * @param {URL} abs - a fully qualified URL
 * @returns {string} Fully qualified URL string
 */

/**
 * Given a relative path and fully qualified stringlike URL, return a fully
 * qualified stringlike URL.
 *
 * @template {string} [T=string] Type of fully qualified URL string
 * @overload
 * @param {string} rel - a relative URL
 * @param {T} abs - a fully qualified URL
 * @returns {T} Fully qualified stringlike URL
 */

/**
 * @param {string} rel - a relative URL
 * @param {string|URL} abs - a fully qualified URL
 */
const resolveLocation = (rel, abs) => {
  return new URL(rel, abs).toString();
};

/**
 * Ensures a string is a file URL (a {@link FileUrlString})
 *
 * @param {unknown} allegedPackageLocation - a package location to assert
 * @returns {asserts allegedPackageLocation is FileUrlString}
 */
const assertFileUrlString = allegedPackageLocation => {
  assert(
    typeof allegedPackageLocation === 'string',
    `Package location must be a string, got ${q(allegedPackageLocation)}`,
  );
  assert(
    allegedPackageLocation.startsWith('file://'),
    `Package location must be a file URL, got ${q(allegedPackageLocation)}`,
  );
};

// Exported for testing:
/**
 * @param {string} location
 * @returns {string}
 */
export const basename = location => {
  let { pathname } = new URL(location);
  if (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  const index = pathname.lastIndexOf('/');
  if (index < 0) {
    return pathname;
  }
  return pathname.slice(index + 1);
};

/**
 * Asserts that the given value is a `PackageDescriptor`.
 *
 * TODO: This only validates that the value is a plain object. As mentioned in
 * {@link PackageDescriptor}, `name` is currently a required field, but in the
 * real world this is not so. We _do_ make assumptions about the shape of a
 * `PackageDescriptor`, but it may not be worth eagerly validating further.
 * @param {unknown} allegedPackageDescriptor
 * @returns {asserts allegedPackageDescriptor is PackageDescriptor}
 */
const assertPackageDescriptor = allegedPackageDescriptor => {
  assert(
    typeof allegedPackageDescriptor !== 'function' &&
      Object(allegedPackageDescriptor) === allegedPackageDescriptor,
    `Package descriptor must be a plain object, got ${q(allegedPackageDescriptor)}`,
  );
};

/**
 * @param {MaybeReadFn} maybeRead
 * @param {string} packageLocation
 * @returns {Promise<PackageDescriptor|undefined>}
 */
const readDescriptor = async (maybeRead, packageLocation) => {
  const descriptorLocation = resolveLocation('package.json', packageLocation);
  const descriptorBytes = await maybeRead(descriptorLocation);
  if (descriptorBytes === undefined) {
    return undefined;
  }
  const descriptorText = decoder.decode(descriptorBytes);
  const descriptor = parseLocatedJson(descriptorText, descriptorLocation);
  assertPackageDescriptor(descriptor);
  return descriptor;
};

/**
 * Memoized {@link readDescriptor}
 *
 * @param {Record<string, Promise<PackageDescriptor|undefined>>} memo
 * @param {MaybeReadFn} maybeRead
 * @param {string} packageLocation
 * @returns {Promise<PackageDescriptor|undefined>}
 */
const readDescriptorWithMemo = async (memo, maybeRead, packageLocation) => {
  /** @type {Promise<PackageDescriptor|undefined>} */
  let promise = memo[packageLocation];
  if (promise !== undefined) {
    return promise;
  }
  promise = readDescriptor(maybeRead, packageLocation);
  memo[packageLocation] = promise;
  return promise;
};

/**
 * `findPackage` behaves as Node.js to find third-party modules by searching
 * parent to ancestor directories for a `node_modules` directory that contains
 * the name.
 *
 * Node.js does not actually require these to be packages, but in practice,
 * these are the locations that package managers drop a package so Node.js can
 * find it efficiently.
 *
 * @param {MaybeReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {FileUrlString} directory
 * @param {string} name
 * @returns {Promise<PackageDetails|undefined>}
 */
const findPackage = async (readDescriptor, canonical, directory, name) => {
  await null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const packageLocation = await canonical(
      resolveLocation(`node_modules/${name}/`, directory),
    );

    // We have no guarantee that `canonical` will return a file URL; it spits
    // back whatever we give it if `fs.promises.realpath()` rejects.
    assertFileUrlString(packageLocation);

    // eslint-disable-next-line no-await-in-loop
    const packageDescriptor = await readDescriptor(packageLocation);
    if (packageDescriptor !== undefined) {
      return { packageLocation, packageDescriptor };
    }

    const parent = resolveLocation('../', directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;

    const base = basename(directory);
    if (base === 'node_modules') {
      directory = resolveLocation('../', directory);
      if (parent === directory) {
        return undefined;
      }
      directory = parent;
    }
  }
};

/** @satisfies {LanguageForExtension} */
const defaultLanguageForExtension = /** @type {const} */ ({
  mjs: 'mjs',
  cjs: 'cjs',
  json: 'json',
  text: 'text',
  bytes: 'bytes',
});

/** @satisfies {LanguageForExtension} */
const defaultCommonjsLanguageForExtension = /** @type {const} */ ({
  js: 'cjs',
});

/** @satisfies {LanguageForExtension} */
const defaultModuleLanguageForExtension = /** @type {const} */ ({
  js: 'mjs',
});

/**
 * @param {PackageDescriptor} descriptor
 * @param {string} location
 * @param {LanguageOptions} languageOptions
 * @returns {Record<string, string>}
 */
const inferParsers = (descriptor, location, languageOptions) => {
  let { moduleLanguageForExtension, commonjsLanguageForExtension } =
    languageOptions;
  const {
    languages,
    workspaceModuleLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
  } = languageOptions;

  // Select languageForExtension options based on whether they are physically
  // under node_modules, indicating that they have not been built for npm,
  // so any languages that compile to JavaScript may need additional parsers.
  if (!location.includes('/node_modules/')) {
    moduleLanguageForExtension = workspaceModuleLanguageForExtension;
    commonjsLanguageForExtension = workspaceCommonjsLanguageForExtension;
  }

  const {
    type,
    module,
    parsers: packageLanguageForExtension = {},
  } = descriptor;

  // Validate package-local "parsers"
  if (
    typeof packageLanguageForExtension !== 'object' ||
    packageLanguageForExtension === null
  ) {
    throw Error(
      `Cannot interpret parser map ${JSON.stringify(
        packageLanguageForExtension,
      )} of package at ${location}, must be an object mapping file extensions to corresponding languages (for example, mjs for ECMAScript modules, cjs for CommonJS modules, or json for JSON modules`,
    );
  }
  const invalidLanguages = values(packageLanguageForExtension).filter(
    language => !languages.has(language),
  );
  if (invalidLanguages.length > 0) {
    throw Error(
      `Cannot interpret parser map language values ${JSON.stringify(
        invalidLanguages,
      )} of package at ${location}, must be an object mapping file extensions to corresponding languages (for example, mjs for ECMAScript modules, cjs for CommonJS modules, or json for JSON modules`,
    );
  }

  if (type === 'module' || module !== undefined) {
    return { ...moduleLanguageForExtension, ...packageLanguageForExtension };
  }
  if (type === 'commonjs') {
    return { ...commonjsLanguageForExtension, ...packageLanguageForExtension };
  }
  if (type !== undefined) {
    throw Error(
      `Cannot infer parser map for package of type ${type} at ${location}`,
    );
  }
  return { ...commonjsLanguageForExtension, ...packageLanguageForExtension };
};

/**
 * This returns the "weight" of a package name, which is used when determining
 * the shortest path.
 *
 * It is an analogue of the `pathCompare` function.
 *
 * The weight is calculated as follows:
 *
 * 1. The {@link String.length length} of the package name contributes a fixed
 *    value of `0x10000` per character. This is because the `pathCompare`
 *    algorithm first compares strings by length and only evaluates code unit
 *    values if the lengths of two strings are equal. `0x10000` is one (1)
 *    greater than the maximum value that {@link String.charCodeAt charCodeAt}
 *    can return (`0xFFFF`), which guarantees longer strings will have higher
 *    weights.
 * 2. Each character in the package name contributes its UTF-16 code unit value
 *    (`0x0` thru `0xFFFF`) to the total. This is the same operation used when
 *    comparing two strings using comparison operators.
 * 3. The total weight is the sum of 1. and 2.
 *
 * @param {string} packageName - Name of package to calculate weight for.
 * @returns {number} Numeric weight
 */
const calculatePackageWeight = packageName => {
  let totalCodeValue = packageName.length * 65536; // each character contributes 65536
  for (let i = 0; i < packageName.length; i += 1) {
    totalCodeValue += packageName.charCodeAt(i);
  }
  return totalCodeValue;
};

/**
 * `graphPackage` and {@link gatherDependency} are mutually recursive functions that
 * gather the metadata for a package and its transitive dependencies.
 * The keys of the graph are the locations of the package descriptors.
 * The metadata include a label (which is informative and not necessarily
 * unique), the location of each shallow dependency, and names of the modules
 * that the package exports.
 *
 * @param {string} name
 * @param {MaybeReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {Graph} graph
 * @param {PackageDetails} packageDetails
 * @param {Set<string>} conditions
 * @param {boolean | undefined} dev
 * @param {LanguageOptions} languageOptions
 * @param {boolean} strict
 * @param {LogicalPathGraph} logicalPathGraph
 * @param {GraphPackageOptions} options
 * @returns {Promise<undefined>}
 */
const graphPackage = async (
  name,
  readDescriptor,
  canonical,
  graph,
  { packageLocation, packageDescriptor },
  conditions,
  dev,
  languageOptions,
  strict,
  logicalPathGraph,
  {
    commonDependencyDescriptors = {},
    logicalPath = [],
    log = noop,
    packageDescriptorHook,
    packageDependenciesHook,
    policy,
  } = {},
) => {
  if (graph[packageLocation] !== undefined) {
    // Returning the promise here would create a causal cycle and stall recursion.
    return undefined;
  }

  if (packageDescriptor.name !== name) {
    log('Package name does not match location', {
      name,
      packageDescriptorName: packageDescriptor.name,
      packageLocation,
    });
  }

  const result = /** @type {Node} */ ({});
  graph[packageLocation] = result;

  /** @type {Node['dependencyLocations']} */
  const dependencyLocations = {};
  /** @type {ReturnType<typeof gatherDependency>[]} */
  const children = [];

  /**
   * A set containing dependency names which are considered "optional"
   */
  const optionals = new Set();

  /**
   * Contains the names of _all_ dependencies
   *
   * @type {Set<string>}
   */
  const allDependencies = new Set();

  // these are fields from package.json containing dependencies
  const {
    dependencies = {},
    peerDependencies = {},
    peerDependenciesMeta = {},
    bundleDependencies = {},
    optionalDependencies = {},
    devDependencies = {},
  } = packageDescriptor;

  for (const [name, descriptor] of entries(commonDependencyDescriptors)) {
    if (Object(descriptor) === descriptor) {
      allDependencies.add(name);
    }
  }

  // only consider devDependencies if dev flag is true
  for (const name of keys({
    ...dependencies,
    ...peerDependencies,
    ...bundleDependencies,
    ...optionalDependencies,
    ...(dev ? devDependencies : {}),
  })) {
    allDependencies.add(name);
  }

  // for historical reasons, some packages omit peerDependencies and only
  // use the peerDependenciesMeta field (because there was no way to define
  // an "optional" peerDependency prior to npm v7). this is plainly wrong,
  // but not exactly rare, either
  for (const [dependencyName, meta] of entries(peerDependenciesMeta)) {
    if (Object(meta) === meta && meta.optional) {
      optionals.add(dependencyName);
      allDependencies.add(dependencyName);
    }
  }

  for (const dependencyName of keys(optionalDependencies)) {
    optionals.add(dependencyName);
  }

  for (const dependencyName of [...allDependencies].sort()) {
    const optional = optionals.has(dependencyName);
    const childLogicalPath = [...logicalPath, dependencyName];
    children.push(
      // Mutual recursion ahead:
      // eslint-disable-next-line no-use-before-define
      gatherDependency(
        readDescriptor,
        canonical,
        graph,
        dependencyLocations,
        packageLocation,
        dependencyName,
        conditions,
        languageOptions,
        strict,
        logicalPathGraph,
        {
          childLogicalPath,
          optional,
          commonDependencyDescriptors,
          log,
          packageDescriptorHook,
          packageDependenciesHook,
          policy,
        },
      ),
    );
  }

  const { version = '', exports: exportsDescriptor } = packageDescriptor;
  /** @type {Node['types']} */
  const types = {};

  /**
   * @param {string} path
   * @returns {Promise<PackageDescriptor>}
   */
  const readDescriptorUpwards = async path => {
    const location = resolveLocation(path, packageLocation);
    // readDescriptor coming from above is memoized, so this is not awfully slow
    const { data } = await searchDescriptor(location, readDescriptor);
    return data;
  };

  /** @type {Node['externalAliases']} */
  const externalAliases = {};
  /** @type {Node['internalAliases']} */
  const internalAliases = {};

  inferExportsAndAliases(
    packageDescriptor,
    externalAliases,
    internalAliases,
    conditions,
    types,
  );

  const parsers = inferParsers(
    packageDescriptor,
    packageLocation,
    languageOptions,
  );

  const sourceDirname = basename(packageLocation);

  assign(result, {
    name,
    path: logicalPath,
    label: `${name}${version ? `-v${version}` : ''}`,
    sourceDirname,
    explicitExports: exportsDescriptor !== undefined,
    externalAliases,
    internalAliases,
    dependencyLocations,
    types,
    parsers,
  });

  await Promise.all(
    values(result.externalAliases).map(async item => {
      const descriptor = await readDescriptorUpwards(item);
      if (descriptor && descriptor.type === 'module') {
        types[item] = 'mjs';
      }
    }),
  );

  await Promise.all(children);

  // handle commonDependencyDescriptors package aliases
  for (const [name, { alias }] of entries(commonDependencyDescriptors)) {
    // update the dependencyLocations to point to the common dependency
    const targetLocation = dependencyLocations[name];
    if (targetLocation === undefined) {
      throw Error(
        `Cannot find common dependency ${name} for ${packageLocation}`,
      );
    }
    dependencyLocations[alias] = targetLocation;
  }
  // handle internalAliases package aliases
  for (const specifier of keys(internalAliases).sort()) {
    const target = internalAliases[specifier];
    // ignore all internalAliases where the specifier or target is relative
    const specifierIsRelative = specifier.startsWith('./') || specifier === '.';
    // eslint-disable-next-line no-continue
    if (specifierIsRelative) continue;
    const targetIsRelative = target.startsWith('./') || target === '.';
    // eslint-disable-next-line no-continue
    if (targetIsRelative) continue;
    const targetLocation = dependencyLocations[target];
    if (targetLocation === undefined) {
      throw Error(`Cannot find dependency ${target} for ${packageLocation}`);
    }
    dependencyLocations[specifier] = targetLocation;
  }

  return undefined;
};

/**
 * Adds information for the dependency of the package at `packageLocation` to the `graph` object.
 *
 * @param {MaybeReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {Graph} graph - the partially build graph.
 * @param {Record<string, string>} dependencyLocations
 * @param {FileUrlString} packageLocation - location of the package of interest.
 * @param {string} name - name of the package of interest.
 * @param {Set<string>} conditions
 * @param {LanguageOptions} languageOptions
 * @param {boolean} strict - If `true`, a missing dependency will throw an exception
 * @param {LogicalPathGraph} logicalPathGraph
 * @param {GatherDependencyOptions} [options]
 * @returns {Promise<void>}
 */
const gatherDependency = async (
  readDescriptor,
  canonical,
  graph,
  dependencyLocations,
  packageLocation,
  name,
  conditions,
  languageOptions,
  strict,
  logicalPathGraph,
  {
    childLogicalPath = [],
    optional = false,
    commonDependencyDescriptors = {},
    log = noop,
    packageDescriptorHook,
    packageDependenciesHook,
    policy,
  } = {},
) => {
  const dependency = await findPackage(
    readDescriptor,
    canonical,
    packageLocation,
    name,
  );

  if (dependency === undefined) {
    // allow the dependency to be missing if optional
    if (optional || !strict) {
      return;
    }
    throw Error(`Cannot find dependency ${name} for ${packageLocation}`);
  }

  // #region packageDescriptor hook
  if (packageDescriptorHook) {
    packageDescriptorHook({
      packageDescriptor: dependency.packageDescriptor,
      packageLocation: dependency.packageLocation,
      moduleSpecifier: name,
      log,
    });
  }
  // #endregion
  dependencyLocations[name] = dependency.packageLocation;

  logicalPathGraph.addEdge(
    packageLocation,
    dependency.packageLocation,
    calculatePackageWeight(name),
  );

  await graphPackage(
    name,
    readDescriptor,
    canonical,
    graph,
    dependency,
    conditions,
    false,
    languageOptions,
    strict,
    logicalPathGraph,
    {
      commonDependencyDescriptors,
      logicalPath: childLogicalPath,
      log,
      packageDescriptorHook,
      packageDependenciesHook,
      policy,
    },
  );
};

/**
 * Resolves with a {@link Graph} representing the packages for which
 * {@link CompartmentDescriptor CompartmentDescriptors} will be created.
 *
 * @param {MaybeReadFn} maybeRead
 * @param {CanonicalFn} canonical
 * @param {FileUrlString} packageLocation - location of the main package.
 * @param {Set<string>} conditions
 * @param {PackageDescriptor} mainPackageDescriptor - the parsed contents of the
 * main `package.json`, which was already read when searching for the
 * `package.json`.
 * @param {boolean|undefined} dev - whether to use devDependencies from this
 * package (and only this package).
 * @param {Record<string,string>} commonDependencies - dependencies to be added
 * to all packages
 * @param {LanguageOptions} languageOptions
 * @param {boolean} strict
 * @param {LogicalPathGraph} logicalPathGraph
 * @param {GraphPackagesOptions} options
 * @returns {Promise<Graph>}
 */
const graphPackages = async (
  maybeRead,
  canonical,
  packageLocation,
  conditions,
  mainPackageDescriptor,
  dev,
  commonDependencies,
  languageOptions,
  strict,
  logicalPathGraph,
  { log = noop, packageDescriptorHook, packageDependenciesHook, policy } = {},
) => {
  const memo = create(null);
  /**
   * @type {MaybeReadDescriptorFn}
   */
  const readDescriptor = packageLocation =>
    readDescriptorWithMemo(memo, maybeRead, packageLocation);

  if (mainPackageDescriptor !== undefined) {
    memo[packageLocation] = Promise.resolve(mainPackageDescriptor);
  }

  const allegedPackageDescriptor = await readDescriptor(packageLocation);

  if (allegedPackageDescriptor === undefined) {
    throw TypeError(
      `Cannot find package.json for application at ${packageLocation}`,
    );
  }

  assertPackageDescriptor(allegedPackageDescriptor);
  const packageDescriptor = allegedPackageDescriptor;

  conditions = new Set(conditions || []);
  conditions.add('import');
  conditions.add('default');
  conditions.add('endo');

  // Resolve common dependencies.
  /** @type {CommonDependencyDescriptors} */
  const commonDependencyDescriptors = {};
  const packageDescriptorDependencies = packageDescriptor.dependencies || {};
  for (const [alias, dependencyName] of entries(commonDependencies)) {
    const spec = packageDescriptorDependencies[dependencyName];
    if (spec === undefined) {
      throw Error(
        `Cannot find dependency ${dependencyName} for ${packageLocation} from common dependencies`,
      );
    }
    commonDependencyDescriptors[dependencyName] = {
      spec,
      alias,
    };
  }

  logicalPathGraph.addNode(packageLocation);

  const graph = create(null);
  await graphPackage(
    packageDescriptor.name,
    readDescriptor,
    canonical,
    graph,
    {
      packageLocation,
      packageDescriptor,
    },
    conditions,
    dev,
    languageOptions,
    strict,
    logicalPathGraph,
    {
      commonDependencyDescriptors,
      log,
      packageDescriptorHook,
      packageDependenciesHook,
      policy,
    },
  );
  return graph;
};

/**
 * `translateGraph` converts the graph returned by graph packages (above) into a
 * {@link CompartmentMapDescriptor compartment map}.
 *
 * @param {string} entryPackageLocation
 * @param {string} entryModuleSpecifier
 * @param {Graph} graph
 * @param {Set<string>} conditions - build conditions about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @param {TranslateGraphOptions} [options]
 * @returns {PackageCompartmentMapDescriptor}
 */
const translateGraph = (
  entryPackageLocation,
  entryModuleSpecifier,
  graph,
  conditions,
  { policy, log = noop, packageDependenciesHook } = {},
) => {
  /** @type {Record<PackageCompartmentDescriptorName, PackageCompartmentDescriptor>} */
  const compartments = create(null);

  /**
   * Execute package dependencies hooks: default first (if policy exists), then user-provided.
   *
   * @param {CanonicalName} label
   * @param {Record<string, FileUrlString>} dependencyLocations
   * @returns {Record<string, FileUrlString>}
   */
  const executePackageDependenciesHook = (label, dependencyLocations) => {
    const dependencies = new Set(
      values(dependencyLocations).map(
        dependencyLocation => graph[dependencyLocation].label,
      ),
    );

    const packageDependenciesHookInput = {
      canonicalName: label,
      dependencies: new Set(dependencies),
      log,
    };

    // Call default filter first if policy exists
    let packageDependenciesHookResult;
    if (policy) {
      packageDependenciesHookResult = defaultPackageDependenciesFilter(
        packageDependenciesHookInput,
        policy,
      );
    }

    // Then call user-provided hook if it exists
    if (packageDependenciesHook) {
      const userResult = packageDependenciesHook(packageDependenciesHookInput);
      // If user hook also returned a result, use it (overrides default)
      if (userResult?.dependencies) {
        packageDependenciesHookResult = userResult;
      }
    }

    // if "dependencies" are in here, then something changed the list.
    if (packageDependenciesHookResult?.dependencies) {
      const { size } = packageDependenciesHookResult.dependencies;
      if (typeof size === 'number' && size > 0) {
        // because the list of dependencies contains canonical names, we need to lookup any new ones.
        const nodesByCanonicalName = new Map(
          entries(graph).map(([location, node]) => [
            node.label,
            {
              ...node,
              packageLocation: /** @type {FileUrlString} */ (location),
            },
          ]),
        );

        /** @type {typeof dependencyLocations} */
        const newDependencyLocations = {};
        try {
          for (const label of packageDependenciesHookResult.dependencies) {
            const { name, packageLocation } =
              nodesByCanonicalName.get(label) ?? create(null);
            if (name && packageLocation) {
              newDependencyLocations[name] = packageLocation;
            } else {
              log(
                `WARNING: packageDependencies hook returned unknown package with label ${q(label)}`,
              );
            }
          }
          return newDependencyLocations;
        } catch {
          log(
            `WARNING: packageDependencies hook returned invalid value ${q(
              packageDependenciesHookResult,
            )}; using original dependencies`,
          );
        }
      } else {
        dependencyLocations = create(null);
      }
    }
    return dependencyLocations;
  };

  // For each package, build a map of all the external modules the package can
  // import from other packages.
  // The keys of this map are the full specifiers of those modules from the
  // perspective of the importing package.
  // The values are records that name the exporting compartment and the full
  // specifier of the module from the exporting package.
  // The full map includes every exported module from every dependencey
  // package and is a complete list of every external module that the
  // corresponding compartment can import.
  for (const dependeeLocation of /** @type {PackageCompartmentDescriptorName[]} */ (
    keys(graph).sort()
  )) {
    const { name, label, sourceDirname, internalAliases, parsers, types } =
      graph[dependeeLocation];
    /** @type {Record<string, CompartmentModuleDescriptorConfiguration>} */
    const moduleDescriptors = create(null);
    /** @type {Record<string, ScopeDescriptor<PackageCompartmentDescriptorName>>} */
    const scopes = create(null);

    const packagePolicy = makePackagePolicy(label, { policy });

    /* c8 ignore next */
    if (policy && !packagePolicy) {
      // this should never happen
      throw new TypeError('Unexpectedly falsy package policy');
    }

    let dependencyLocations = graph[dependeeLocation].dependencyLocations;
    dependencyLocations = executePackageDependenciesHook(
      label,
      dependencyLocations,
    );

    /**
     * @param {string} dependencyName
     * @param {PackageCompartmentDescriptorName} packageLocation
     */
    const digestExternalAliases = (dependencyName, packageLocation) => {
      const { externalAliases, explicitExports } = graph[packageLocation];
      for (const exportPath of keys(externalAliases).sort()) {
        const targetPath = externalAliases[exportPath];
        // dependency name may be different from package's name,
        // as in the case of browser field dependency replacements.
        // note that policy still applies
        const localPath = join(dependencyName, exportPath);
        // if we have policy, this has already been vetted
        moduleDescriptors[localPath] = {
          compartment: packageLocation,
          module: targetPath,
        };
      }
      // if the exports field is not present, then all modules must be accessible
      if (!explicitExports) {
        scopes[dependencyName] = {
          compartment: packageLocation,
        };
      }
    };
    // Support reflexive package aliases
    digestExternalAliases(name, dependeeLocation);
    // Support external package aliases
    for (const dependencyName of keys(dependencyLocations).sort()) {
      const dependencyLocation = dependencyLocations[dependencyName];
      digestExternalAliases(dependencyName, dependencyLocation);
    }
    // digest own internal aliases
    for (const modulePath of keys(internalAliases).sort()) {
      const facetTarget = internalAliases[modulePath];
      const targetIsRelative =
        facetTarget.startsWith('./') || facetTarget === '.';
      if (targetIsRelative) {
        // add target to moduleDescriptors
        moduleDescriptors[modulePath] = {
          compartment: dependeeLocation,
          module: facetTarget,
        };
      }
    }

    compartments[dependeeLocation] = {
      label,
      name,
      location: dependeeLocation,
      sourceDirname,
      modules: moduleDescriptors,
      scopes,
      parsers,
      types,
      policy: /** @type {SomePackagePolicy} */ (packagePolicy),
    };
  }

  return {
    // TODO graceful migration from tags to conditions
    // https://github.com/endojs/endo/issues/2388
    tags: [...conditions],
    entry: {
      compartment: /** @type {FileUrlString} */ (entryPackageLocation),
      module: entryModuleSpecifier,
    },
    compartments,
  };
};

/**
 * @param {Pick<MapNodeModulesOptions,
 *   'languageForExtension' |
 *   'moduleLanguageForExtension' |
 *   'commonjsLanguageForExtension' |
 *   'workspaceLanguageForExtension' |
 *   'workspaceModuleLanguageForExtension' |
 *   'workspaceCommonjsLanguageForExtension' |
 *   'languages'
 * >} options
 */
const makeLanguageOptions = ({
  languageForExtension: additionalLanguageForExtension = {},
  moduleLanguageForExtension: additionalModuleLanguageForExtension = {},
  commonjsLanguageForExtension: additionalCommonjsLanguageForExtension = {},
  workspaceLanguageForExtension: additionalWorkspaceLanguageForExtension = {},
  workspaceModuleLanguageForExtension:
    additionalWorkspaceModuleLanguageForExtension = {},
  workspaceCommonjsLanguageForExtension:
    additionalWorkspaceCommonjsLanguageForExtension = {},
  languages: additionalLanguages = [],
}) => {
  const commonjsLanguageForExtension = {
    ...defaultLanguageForExtension,
    ...additionalLanguageForExtension,
    ...defaultCommonjsLanguageForExtension,
    ...additionalCommonjsLanguageForExtension,
  };
  const moduleLanguageForExtension = {
    ...defaultLanguageForExtension,
    ...additionalLanguageForExtension,
    ...defaultModuleLanguageForExtension,
    ...additionalModuleLanguageForExtension,
  };
  const workspaceCommonjsLanguageForExtension = {
    ...defaultLanguageForExtension,
    ...additionalLanguageForExtension,
    ...defaultCommonjsLanguageForExtension,
    ...additionalCommonjsLanguageForExtension,
    ...additionalWorkspaceLanguageForExtension,
    ...additionalWorkspaceCommonjsLanguageForExtension,
  };
  const workspaceModuleLanguageForExtension = {
    ...defaultLanguageForExtension,
    ...additionalLanguageForExtension,
    ...defaultModuleLanguageForExtension,
    ...additionalModuleLanguageForExtension,
    ...additionalWorkspaceLanguageForExtension,
    ...additionalWorkspaceModuleLanguageForExtension,
  };

  const languages = new Set([
    ...values(moduleLanguageForExtension),
    ...values(commonjsLanguageForExtension),
    ...values(workspaceModuleLanguageForExtension),
    ...values(workspaceCommonjsLanguageForExtension),
    ...additionalLanguages,
  ]);

  return {
    languages,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
  };
};
/**
 * Creates a `Node` in `graph` corresponding to the "attenuators" Compartment.
 *
 * Only does so if `policy` is provided.
 *
 * @param {Graph} graph Graph
 * @param {Node} entryNode Entry node of the grpah
 * @param {SomePolicy} [policy]
 * @throws If there's already a `Node` in `graph` for the "attenuators"
 * Compartment
 * @returns {void}
 */
const makeAttenuatorsNode = (graph, entryNode, policy) => {
  if (policy) {
    assertPolicy(policy);

    assert(
      graph[ATTENUATORS_COMPARTMENT] === undefined,
      `${q(ATTENUATORS_COMPARTMENT)} is a reserved compartment name`,
    );

    graph[ATTENUATORS_COMPARTMENT] = {
      ...entryNode,
      internalAliases: {},
      externalAliases: {},
      packageDescriptor: { name: ATTENUATORS_COMPARTMENT },
      name: ATTENUATORS_COMPARTMENT,
    };
  }
};

/**
 * Transforms a `Graph` into a readonly `FinalGraph`, in preparation for
 * conversion to a `CompartmentDescriptor`.
 *
 * @param {Graph} graph Graph
 * @param {LogicalPathGraph} logicalPathGraph Logical path graph
 * @param {FileUrlString} entryPackageLocation Entry package location
 * @param {CanonicalNameMap<PackageCompartmentMapDescriptor>} canonicalNameMap Mapping of canonical names to `Node` names (keys in `graph`)
 * @returns {Readonly<FinalGraph>}
 */
const finalizeGraph = (
  graph,
  logicalPathGraph,
  entryPackageLocation,
  canonicalNameMap,
) => {
  const shortestPath = makeShortestPath(logicalPathGraph);

  // neither the entry package nor the attenuators compartment have a path; omit
  const {
    [ATTENUATORS_COMPARTMENT]: attenuatorsNode,
    [entryPackageLocation]: entryNode,
    ...subgraph
  } = graph;

  /** @type {FinalGraph} */
  const finalGraph = create(null);

  /** @type {Readonly<FinalNode>} */
  finalGraph[entryPackageLocation] = freeze({
    ...entryNode,
    label: generateCanonicalName({
      isEntry: true,
      path: [],
    }),
  });

  canonicalNameMap.set(ENTRY_COMPARTMENT, entryPackageLocation);

  if (attenuatorsNode) {
    /** @type {Readonly<FinalNode>} */
    finalGraph[ATTENUATORS_COMPARTMENT] = freeze({
      ...attenuatorsNode,
      label: generateCanonicalName({
        name: ATTENUATORS_COMPARTMENT,
        path: [],
      }),
    });
  }

  const subgraphEntries = /** @type {[FileUrlString, Node][]} */ (
    entries(subgraph)
  );

  for (const [location, node] of subgraphEntries) {
    const shortestLogicalPath = shortestPath(entryPackageLocation, location);

    // the first element will always be the root package location; this is omitted from the path.
    shortestLogicalPath.shift();

    const path = shortestLogicalPath.map(location => graph[location].name);
    const canonicalName = generateCanonicalName({ path });

    /** @type {Readonly<FinalNode>} */
    const finalNode = freeze({
      ...node,
      label: canonicalName,
    });

    canonicalNameMap.set(canonicalName, location);

    finalGraph[location] = finalNode;
  }

  for (const node of values(finalGraph)) {
    Object.freeze(node);
  }

  return freeze(finalGraph);
};

/**
 * Returns an array of "issue" objects if any resources referenced in `policy`
 * are unknown.
 *
 * @param {Set<CanonicalName>} canonicalNames Set of all known canonical names
 * @param {SomePolicy} policy Policy to validate
 * @returns {Array<{canonicalName: CanonicalName, message: string, path:
 * string[], suggestion?: CanonicalName}>} Array of issue objects, or `undefined` if no issues were
 * found
 */
const validatePolicyResources = (canonicalNames, policy) => {
  /**
   * Finds a suggestion for `badName` if it is a suffix of any
   * canonical name in `canonicalNames`.
   *
   * @param {string} badName Unknown canonical name
   * @returns {CanonicalName | undefined}
   */
  const findSuggestion = badName => {
    for (const canonicalName of canonicalNames) {
      if (canonicalName.endsWith(`>${badName}`)) {
        return canonicalName;
      }
    }
    return undefined;
  };

  /** @type {Array<{canonicalName: CanonicalName, message: string, path: string[], suggestion?: CanonicalName}>} */
  const issues = [];
  for (const [resourceName, resourcePolicy] of entries(
    policy.resources ?? {},
  )) {
    if (!canonicalNames.has(resourceName)) {
      const issueMessage = `Resource ${q(resourceName)} was not found`;
      const suggestion = findSuggestion(resourceName);
      const issue = {
        canonicalName: resourceName,
        message: issueMessage,
        path: ['resources', resourceName],
      };
      if (suggestion) {
        issue.suggestion = suggestion;
      }
      issues.push(issue);
    }
    if (typeof resourcePolicy?.packages === 'object') {
      for (const packageName of keys(resourcePolicy.packages)) {
        if (!canonicalNames.has(packageName)) {
          const issueMessage = `Resource ${q(packageName)} from resource ${q(resourceName)} was not found`;
          const suggestion = findSuggestion(packageName);
          const issue = {
            canonicalName: packageName,
            message: issueMessage,
            path: ['resources', resourceName, 'packages', packageName],
          };
          if (suggestion) {
            issue.suggestion = suggestion;
          }
          issues.push(issue);
        }
      }
    }
  }

  return issues;
};

/**
 * @param {ReadFn | ReadPowers<FileUrlString> | MaybeReadPowers<FileUrlString>} readPowers
 * @param {FileUrlString} entryPackageLocation
 * @param {Set<string>} conditionsOption
 * @param {PackageDescriptor} packageDescriptor
 * @param {string} entryModuleSpecifier
 * @param {CompartmentMapForNodeModulesOptions} [options]
 * @returns {Promise<PackageCompartmentMapDescriptor>}
 */
export const compartmentMapForNodeModules_ = async (
  readPowers,
  entryPackageLocation,
  conditionsOption,
  packageDescriptor,
  entryModuleSpecifier,
  options = {},
) => {
  const {
    dev = false,
    commonDependencies = {},
    policy,
    strict = false,
    log = noop,
    packageDescriptorHook,
    unknownCanonicalNameHook,
    canonicalNamesHook,
    packageDependenciesHook,
  } = options;
  const { maybeRead, canonical } = unpackReadPowers(readPowers);
  const languageOptions = makeLanguageOptions(options);

  const conditions = new Set(conditionsOption || []);

  /**
   * This graph will contain nodes for each package location (a
   * {@link FileUrlString}) and edges representing dependencies between packages.
   *
   * The edges are weighted by {@link calculatePackageWeight}.
   *
   * @type {LogicalPathGraph}
   */
  const logicalPathGraph = new GenericGraph();

  // dev is only set for the entry package, and implied by the development
  // condition.

  const graph = await graphPackages(
    maybeRead,
    canonical,
    entryPackageLocation,
    conditions,
    packageDescriptor,
    dev || (conditions && conditions.has('development')),
    commonDependencies,
    languageOptions,
    strict,
    logicalPathGraph,
    { log, packageDescriptorHook, packageDependenciesHook, policy },
  );

  makeAttenuatorsNode(graph, graph[entryPackageLocation], policy);

  /**
   * @type {CanonicalNameMap<PackageCompartmentMapDescriptor>}
   */
  const canonicalNameMap = new Map();

  const finalGraph = finalizeGraph(
    graph,
    logicalPathGraph,
    entryPackageLocation,
    canonicalNameMap,
  );

  // if policy exists, cross-reference the policy "resources" against the list
  // of known canonical names and fire the `unknownCanonicalName` hook for each
  // unknown resource, if found
  if (policy) {
    const canonicalNames = new Set(canonicalNameMap.keys());
    const issues = validatePolicyResources(canonicalNames, policy) ?? [];
    // Call default handler first if policy exists
    for (const { message, canonicalName, path, suggestion } of issues) {
      const hookInput = {
        canonicalName,
        message,
        path,
        log,
      };
      if (suggestion) {
        hookInput.suggestion = suggestion;
      }
      defaultUnknownCanonicalNameHandler(hookInput);
      // Then call user-provided hook if it exists
      if (unknownCanonicalNameHook) {
        unknownCanonicalNameHook(hookInput);
      }
    }
  }

  // Fire canonicalNames hook with all canonical names before translateGraph
  const canonicalNames = new Set(canonicalNameMap.keys());
  if (canonicalNamesHook) {
    canonicalNamesHook({
      canonicalNames,
      log,
    });
  }

  const compartmentMap = translateGraph(
    entryPackageLocation,
    entryModuleSpecifier,
    finalGraph,
    conditions,
    { policy, log, packageDependenciesHook },
  );

  return compartmentMap;
};

/**
 * Creates a {@link CompartmentMapDescriptor} from the module at
 * `moduleLocation`, considering dependencies found in `node_modules`.
 *
 * Locates the {@link PackageDescriptor} for the module at `moduleLocation`
 *
 * @param {ReadFn | ReadPowers<FileUrlString> | MaybeReadPowers<FileUrlString>} readPowers
 * @param {string} moduleLocation
 * @param {MapNodeModulesOptions} [options]
 * @returns {Promise<PackageCompartmentMapDescriptor>}
 */
export const mapNodeModules = async (
  readPowers,
  moduleLocation,
  {
    tags = new Set(),
    conditions = tags,
    log = noop,
    packageDescriptorHook,
    unknownCanonicalNameHook,
    canonicalNamesHook,
    packageDependenciesHook,
    policy,
    ...otherOptions
  } = {},
) => {
  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(readPowers, moduleLocation, { log });

  const packageDescriptor = /** @type {typeof parseLocatedJson<unknown>} */ (
    parseLocatedJson
  )(packageDescriptorText, packageDescriptorLocation);

  assertPackageDescriptor(packageDescriptor);
  assertFileUrlString(packageLocation);

  // #region packageDescriptor hook
  if (packageDescriptorHook) {
    packageDescriptorHook({
      packageDescriptor,
      packageLocation,
      moduleSpecifier,
      log,
    });
  }
  // #endregion

  return compartmentMapForNodeModules_(
    readPowers,
    packageLocation,
    conditions,
    packageDescriptor,
    moduleSpecifier,
    {
      log,
      policy,
      packageDescriptorHook,
      unknownCanonicalNameHook,
      canonicalNamesHook,
      packageDependenciesHook,
      ...otherOptions,
    },
  );
};

/**
 * @deprecated Use {@link mapNodeModules} instead.
 */
export const compartmentMapForNodeModules = compartmentMapForNodeModules_;

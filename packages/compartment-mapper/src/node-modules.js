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

/**
 * @import {
 *   CanonicalFn,
 *   CompartmentDescriptor,
 *   CompartmentMapDescriptor,
 *   CompartmentMapForNodeModulesOptions,
 *   LanguageForExtension,
 *   MapNodeModulesOptions,
 *   MaybeReadFn,
 *   MaybeReadPowers,
 *   PackageDescriptor,
 *   ReadDescriptorFn,
 *   ReadFn,
 *   ReadPowers,
 *   SomePackagePolicy,
 *   SomePolicy,
 * } from './types.js'
 * @import {
 *   Graph,
 *   Node,
 *   LanguageOptions,
 *   CommonDependencyDescriptors,
 *   GatherDependencyOptions,
 *   GraphPackageOptions,
 *   GraphPackagesOptions,
 *   PackageDetails,
 * } from './types/node-modules.js'
 */

import { pathCompare } from './compartment-map.js';
import { inferExportsAndAliases } from './infer-exports.js';
import { parseLocatedJson } from './json.js';
import { join } from './node-module-specifier.js';
import { assertPolicy } from './policy-format.js';
import {
  ATTENUATORS_COMPARTMENT,
  dependencyAllowedByPolicy,
  getPolicyForPackage,
} from './policy.js';
import { unpackReadPowers } from './powers.js';
import { search, searchDescriptor } from './search.js';

const { assign, create, keys, values } = Object;

const decoder = new TextDecoder();

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

/**
 * Default logger that does nothing.
 */
const noop = () => {};

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => {
  return new URL(rel, abs).toString();
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
 * @param {MaybeReadFn} maybeRead
 * @param {string} packageLocation
 * @returns {Promise<object>}
 */
const readDescriptor = async (maybeRead, packageLocation) => {
  const descriptorLocation = resolveLocation('package.json', packageLocation);
  const descriptorBytes = await maybeRead(descriptorLocation);
  if (descriptorBytes === undefined) {
    return undefined;
  }
  const descriptorText = decoder.decode(descriptorBytes);
  const descriptor = parseLocatedJson(descriptorText, descriptorLocation);
  return descriptor;
};

/**
 * @param {Record<string, object>} memo
 * @param {MaybeReadFn} maybeRead
 * @param {string} packageLocation
 * @returns {Promise<object>}
 */
const readDescriptorWithMemo = async (memo, maybeRead, packageLocation) => {
  let promise = memo[packageLocation];
  if (promise !== undefined) {
    return promise;
  }
  promise = readDescriptor(maybeRead, packageLocation);
  memo[packageLocation] = promise;
  return promise;
};

/**
 * Compares `logicalPath` to the current best logical path in `preferredPackageLogicalPathMap` for `packageLocation`.
 *
 * If no current best path exists, it returns `logicalPath`.
 *
 * @template {string[]} T
 * @template {string[]} U
 * @param {T} logicalPath
 * @param {string} packageLocation
 * @param {Map<string, U>} preferredPackageLogicalPathMap
 * @returns {T|U}
 */
const currentBestLogicalPath = (
  logicalPath,
  packageLocation,
  preferredPackageLogicalPathMap,
) => {
  const theCurrentBest = preferredPackageLogicalPathMap.get(packageLocation);
  if (theCurrentBest === undefined) {
    return logicalPath;
  }
  return pathCompare(logicalPath, theCurrentBest) < 0
    ? logicalPath
    : theCurrentBest;
};

/**
 * Updates the shortest paths in a subgraph of `graph` starting with `packageLocation`.
 *
 * This should be called upon the second (and each subsequent) visit to a graph node.
 *
 * @param {Graph} graph Graph
 * @param {string} packageLocation Location of the package to start with
 * @param {string[]} logicalPath Current path parts of the same package
 * @param {Map<string, string[]>} [preferredPackageLogicalPathMap] Mapping of shortest known paths for each package location
 * @returns {void}
 */
const updateShortestPaths = (
  graph,
  packageLocation,
  logicalPath,
  preferredPackageLogicalPathMap = new Map(),
) => {
  const node = graph[packageLocation];
  if (!node) {
    throw new ReferenceError(
      `Cannot find package at ${packageLocation} in graph`,
    );
  }

  const bestLogicalPath = currentBestLogicalPath(
    logicalPath,
    packageLocation,
    preferredPackageLogicalPathMap,
  );

  if (bestLogicalPath === logicalPath) {
    preferredPackageLogicalPathMap.set(packageLocation, bestLogicalPath);

    for (const name of keys(node.dependencyLocations).sort()) {
      const packageLocation = node.dependencyLocations[name];
      if (!packageLocation) {
        // "should never happen"
        throw new ReferenceError(
          `Expected graph node ${q(node.name)} to contain a dependency location for ${q(name)}`,
        );
      }
      updateShortestPaths(graph, packageLocation, [...logicalPath, name]);
    }
  }

  if (node.path !== bestLogicalPath) {
    node.path = bestLogicalPath;
  }

  return undefined;
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
 * @param {ReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {string} directory
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
 * `graphPackage` and {@link gatherDependency} are mutually recursive functions that
 * gather the metadata for a package and its transitive dependencies.
 * The keys of the graph are the locations of the package descriptors.
 * The metadata include a label (which is informative and not necessarily
 * unique), the location of each shallow dependency, and names of the modules
 * that the package exports.
 *
 * @param {string} name
 * @param {ReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {Graph} graph
 * @param {PackageDetails} packageDetails
 * @param {Set<string>} conditions
 * @param {boolean | undefined} dev
 * @param {LanguageOptions} languageOptions
 * @param {boolean} strict
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
  {
    commonDependencyDescriptors = {},
    preferredPackageLogicalPathMap = new Map(),
    logicalPath = [],
    log = noop,
  } = {},
) => {
  if (graph[packageLocation] !== undefined) {
    updateShortestPaths(
      graph,
      packageLocation,
      logicalPath,
      preferredPackageLogicalPathMap,
    );

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
  const optionals = new Set();
  const {
    dependencies = {},
    peerDependencies = {},
    peerDependenciesMeta = {},
    bundleDependencies = {},
    optionalDependencies = {},
    devDependencies = {},
  } = packageDescriptor;
  /** @type {Record<string, string>} */
  const allDependencies = {};
  for (const [name, descriptor] of Object.entries(
    commonDependencyDescriptors,
  )) {
    if (Object(descriptor) === descriptor) {
      const { spec } = descriptor;
      allDependencies[name] = spec;
    }
  }
  assign(allDependencies, dependencies);
  assign(allDependencies, peerDependencies);
  for (const [name, meta] of Object.entries(peerDependenciesMeta)) {
    if (Object(meta) === meta && meta.optional) {
      optionals.add(name);
    }
  }
  assign(allDependencies, bundleDependencies);
  assign(allDependencies, optionalDependencies);
  for (const name of Object.keys(optionalDependencies)) {
    optionals.add(name);
  }
  if (dev) {
    assign(allDependencies, devDependencies);
  }

  for (const name of keys(allDependencies).sort()) {
    const optional = optionals.has(name);
    const childLogicalPath = [...logicalPath, name];
    children.push(
      // Mutual recursion ahead:
      // eslint-disable-next-line no-use-before-define
      gatherDependency(
        readDescriptor,
        canonical,
        graph,
        dependencyLocations,
        packageLocation,
        name,
        conditions,
        preferredPackageLogicalPathMap,
        languageOptions,
        strict,
        {
          childLogicalPath,
          optional,
          commonDependencyDescriptors,
          log,
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

  Object.assign(result, {
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
  for (const [name, { alias }] of Object.entries(commonDependencyDescriptors)) {
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
 * @param {ReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {Graph} graph - the partially build graph.
 * @param {Record<string, string>} dependencyLocations
 * @param {string} packageLocation - location of the package of interest.
 * @param {string} name - name of the package of interest.
 * @param {Set<string>} conditions
 * @param {Map<string, Array<string>>} preferredPackageLogicalPathMap
 * @param {LanguageOptions} languageOptions
 * @param {boolean} strict - If `true`, a missing dependency will throw an exception
 * @param {GatherDependencyOptions} options
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
  preferredPackageLogicalPathMap,
  languageOptions,
  strict,
  {
    childLogicalPath = [],
    optional = false,
    commonDependencyDescriptors = {},
    log = noop,
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
  dependencyLocations[name] = dependency.packageLocation;

  const bestLogicalPath = currentBestLogicalPath(
    childLogicalPath,
    dependency.packageLocation,
    preferredPackageLogicalPathMap,
  );

  if (bestLogicalPath === childLogicalPath) {
    preferredPackageLogicalPathMap.set(
      dependency.packageLocation,
      bestLogicalPath,
    );
  }

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
    {
      commonDependencyDescriptors,
      preferredPackageLogicalPathMap,
      logicalPath: childLogicalPath,
      log,
    },
  );
};

/**
 * Resolves with a {@link Graph} representing the packages for which
 * {@link CompartmentDescriptor CompartmentDescriptors} will be created.
 *
 * @param {MaybeReadFn} maybeRead
 * @param {CanonicalFn} canonical
 * @param {string} packageLocation - location of the main package.
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
 * @param {GraphPackagesOptions} options
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
  { log = noop } = {},
) => {
  const memo = create(null);
  /**
   * @param {string} packageLocation
   * @returns {Promise<PackageDescriptor>}
   */
  const readDescriptor = packageLocation =>
    readDescriptorWithMemo(memo, maybeRead, packageLocation);

  if (mainPackageDescriptor !== undefined) {
    memo[packageLocation] = Promise.resolve(mainPackageDescriptor);
  }

  const packageDescriptor = await readDescriptor(packageLocation);

  conditions = new Set(conditions || []);
  conditions.add('import');
  conditions.add('default');
  conditions.add('endo');

  if (packageDescriptor === undefined) {
    throw Error(
      `Cannot find package.json for application at ${packageLocation}`,
    );
  }

  // Resolve common dependencies.
  /** @type {CommonDependencyDescriptors} */
  const commonDependencyDescriptors = {};
  const packageDescriptorDependencies = packageDescriptor.dependencies || {};
  for (const [alias, dependencyName] of Object.entries(commonDependencies)) {
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
    {
      commonDependencyDescriptors,
      log,
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
 * @param {SomePolicy} [policy]
 * @returns {CompartmentMapDescriptor}
 */
const translateGraph = (
  entryPackageLocation,
  entryModuleSpecifier,
  graph,
  conditions,
  policy,
) => {
  /** @type {CompartmentMapDescriptor['compartments']} */
  const compartments = Object.create(null);

  // For each package, build a map of all the external modules the package can
  // import from other packages.
  // The keys of this map are the full specifiers of those modules from the
  // perspective of the importing package.
  // The values are records that name the exporting compartment and the full
  // specifier of the module from the exporting package.
  // The full map includes every exported module from every dependencey
  // package and is a complete list of every external module that the
  // corresponding compartment can import.
  for (const dependeeLocation of keys(graph).sort()) {
    const {
      name,
      path,
      label,
      sourceDirname,
      dependencyLocations,
      internalAliases,
      parsers,
      types,
    } = graph[dependeeLocation];
    /** @type {CompartmentDescriptor['modules']} */
    const moduleDescriptors = Object.create(null);
    /** @type {CompartmentDescriptor['scopes']} */
    const scopes = Object.create(null);

    /**
     * List of all the compartments (by name) that this compartment can import from.
     *
     * @type {Set<string>}
     */
    const compartmentNames = new Set();
    const packagePolicy = getPolicyForPackage(
      {
        isEntry: dependeeLocation === entryPackageLocation,
        name,
        path,
      },
      policy,
    );

    /* c8 ignore next */
    if (policy && !packagePolicy) {
      // this should never happen
      throw new TypeError('Unexpectedly falsy package policy');
    }

    /**
     * @param {string} dependencyName
     * @param {string} packageLocation
     */
    const digestExternalAliases = (dependencyName, packageLocation) => {
      const { externalAliases, explicitExports, name, path } =
        graph[packageLocation];
      for (const exportPath of keys(externalAliases).sort()) {
        const targetPath = externalAliases[exportPath];
        // dependency name may be different from package's name,
        // as in the case of browser field dependency replacements
        const localPath = join(dependencyName, exportPath);
        if (
          !policy ||
          (packagePolicy &&
            dependencyAllowedByPolicy(
              {
                name,
                path,
              },
              packagePolicy,
            ))
        ) {
          moduleDescriptors[localPath] = {
            compartment: packageLocation,
            module: targetPath,
          };
        }
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
      compartmentNames.add(dependencyLocation);
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
      path,
      location: dependeeLocation,
      sourceDirname,
      modules: moduleDescriptors,
      scopes,
      parsers,
      types,
      policy: /** @type {SomePackagePolicy} */ (packagePolicy),
      compartments: compartmentNames,
    };
  }

  return {
    // TODO graceful migration from tags to conditions
    // https://github.com/endojs/endo/issues/2388
    tags: [...conditions],
    entry: {
      compartment: entryPackageLocation,
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
    ...Object.values(moduleLanguageForExtension),
    ...Object.values(commonjsLanguageForExtension),
    ...Object.values(workspaceModuleLanguageForExtension),
    ...Object.values(workspaceCommonjsLanguageForExtension),
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
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {string} packageLocation
 * @param {Set<string>} conditionsOption
 * @param {PackageDescriptor} packageDescriptor
 * @param {string} moduleSpecifier
 * @param {CompartmentMapForNodeModulesOptions} [options]
 * @returns {Promise<CompartmentMapDescriptor>}
 * @deprecated Use {@link mapNodeModules} instead.
 */
export const compartmentMapForNodeModules = async (
  readPowers,
  packageLocation,
  conditionsOption,
  packageDescriptor,
  moduleSpecifier,
  options = {},
) => {
  const {
    dev = false,
    commonDependencies = {},
    policy,
    strict = false,
    log = noop,
  } = options;
  const { maybeRead, canonical } = unpackReadPowers(readPowers);
  const languageOptions = makeLanguageOptions(options);

  const conditions = new Set(conditionsOption || []);

  // dev is only set for the entry package, and implied by the development
  // condition.
  // The dev option is deprecated in favor of using conditions, since that
  // covers more intentional behaviors of the development mode.

  const graph = await graphPackages(
    maybeRead,
    canonical,
    packageLocation,
    conditions,
    packageDescriptor,
    dev || (conditions && conditions.has('development')),
    commonDependencies,
    languageOptions,
    strict,
    { log },
  );

  if (policy) {
    assertPolicy(policy);

    assert(
      graph[ATTENUATORS_COMPARTMENT] === undefined,
      `${q(ATTENUATORS_COMPARTMENT)} is a reserved compartment name`,
    );

    graph[ATTENUATORS_COMPARTMENT] = {
      ...graph[packageLocation],
      externalAliases: {},
      label: ATTENUATORS_COMPARTMENT,
      name: ATTENUATORS_COMPARTMENT,
    };
  }

  const compartmentMap = translateGraph(
    packageLocation,
    moduleSpecifier,
    graph,
    conditions,
    policy,
  );

  return compartmentMap;
};

/**
 * Creates a {@link CompartmentMapDescriptor} from the module at
 * `moduleLocation`, considering dependencies found in `node_modules`.
 *
 * Locates the {@link PackageDescriptor} for the module at `moduleLocation`
 *
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {MapNodeModulesOptions} [options]
 * @returns {Promise<CompartmentMapDescriptor>}
 */
export const mapNodeModules = async (
  readPowers,
  moduleLocation,
  { tags = new Set(), conditions = tags, log = noop, ...otherOptions } = {},
) => {
  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(readPowers, moduleLocation, { log });

  const packageDescriptor = /** @type {PackageDescriptor} */ (
    parseLocatedJson(packageDescriptorText, packageDescriptorLocation)
  );

  return compartmentMapForNodeModules(
    readPowers,
    packageLocation,
    conditions,
    packageDescriptor,
    moduleSpecifier,
    { log, ...otherOptions },
  );
};

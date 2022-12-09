// @ts-check
/* eslint no-shadow: 0 */

/** @typedef {import('./types.js').Language} Language */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').CanonicalFn} CanonicalFn */
/** @typedef {import('./types.js').CompartmentMapDescriptor} CompartmentMapDescriptor */
/** @typedef {import('./types.js').ModuleDescriptor} ModuleDescriptor */
/** @typedef {import('./types.js').ScopeDescriptor} ScopeDescriptor */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').ReadPowers} ReadPowers */

/**
 * The graph is an intermediate object model that the functions of this module
 * build by exploring the `node_modules` tree dropped by tools like npm and
 * consumed by tools like Node.js.
 * This gets translated finally into a compartment map.
 *
 * @typedef {Record<string, Node>} Graph
 */

/**
 * @typedef {Object} Node
 * @property {string} label
 * @property {string} name
 * @property {Array<string>} path
 * @property {Array<string>} logicalPath
 * @property {boolean} explicitExports
 * @property {Record<string, string>} internalAliases
 * @property {Record<string, string>} externalAliases
 * @property {Record<string, string>} dependencyLocations - from module name to
 * location in storage.
 * @property {Record<string, Language>} parsers - the parser for
 * modules based on their extension.
 * @property {Record<string, Language>} types - the parser for specific
 * modules.
 */

/**
 * @typedef {Record<string, {spec: string, alias: string}>} CommonDependencyDescriptors
 */

import { inferExportsAndAliases } from './infer-exports.js';
import { searchDescriptor } from './search.js';
import { parseLocatedJson } from './json.js';
import { unpackReadPowers } from './powers.js';
import { pathCompare } from './compartment-map.js';
import { getPolicyFor } from './policy.js';
import { join } from './node-module-specifier.js';

const { assign, create, keys, values } = Object;

const decoder = new TextDecoder();

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => {
  return new URL(rel, abs).toString();
};

/**
 * @param {string} location
 * @returns {string}
 */
const basename = location => {
  const { pathname } = new URL(location);
  const index = pathname.lastIndexOf('/');
  if (index < 0) {
    return pathname;
  }
  return pathname.slice(index + 1);
};

/**
 * @param {ReadFn} read
 * @param {string} packageLocation
 * @returns {Promise<Object>}
 */
const readDescriptor = async (read, packageLocation) => {
  const descriptorLocation = resolveLocation('package.json', packageLocation);
  const descriptorBytes = await read(descriptorLocation).catch(
    _error => undefined,
  );
  if (descriptorBytes === undefined) {
    return undefined;
  }
  const descriptorText = decoder.decode(descriptorBytes);
  const descriptor = parseLocatedJson(descriptorText, descriptorLocation);
  return descriptor;
};

/**
 * @param {Record<string, Object>} memo
 * @param {ReadFn} read
 * @param {string} packageLocation
 * @returns {Promise<Object>}
 */
const readDescriptorWithMemo = async (memo, read, packageLocation) => {
  let promise = memo[packageLocation];
  if (promise !== undefined) {
    return promise;
  }
  promise = readDescriptor(read, packageLocation);
  memo[packageLocation] = promise;
  return promise;
};

/**
 * @callback ReadDescriptorFn
 * @param {string} packageLocation
 * @returns {Promise<Object>}
 */

/**
 * findPackage behaves as Node.js to find third-party modules by searching
 * parent to ancestor directories for a `node_modules` directory that contains
 * the name.
 * Node.js does not actually require these to be packages, but in practice,
 * these are the locations that pakcage managers drop a package so Node.js can
 * find it efficiently.
 *
 * @param {ReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {string} directory
 * @param {string} name
 * @returns {Promise<{
 *   packageLocation: string,
 *   packageDescriptor: Object,
 * } | undefined>}
 */
const findPackage = async (readDescriptor, canonical, directory, name) => {
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

const languages = ['mjs', 'cjs', 'json', 'text', 'bytes'];
const uncontroversialParsers = {
  cjs: 'cjs',
  mjs: 'mjs',
  json: 'json',
  text: 'text',
  bytes: 'bytes',
};
const commonParsers = { js: 'cjs', ...uncontroversialParsers };
const moduleParsers = { js: 'mjs', ...uncontroversialParsers };

/**
 * @param {Object} descriptor
 * @param {string} location
 * @returns {Record<string, string>}
 */
const inferParsers = (descriptor, location) => {
  const { type, module, parsers } = descriptor;
  let additionalParsers = Object.create(null);
  if (parsers !== undefined) {
    if (typeof parsers !== 'object') {
      throw new Error(
        `Cannot interpret parser map ${JSON.stringify(
          parsers,
        )} of package at ${location}, must be an object mapping file extensions to corresponding languages (mjs for ECMAScript modules, cjs for CommonJS modules, or json for JSON modules`,
      );
    }
    const invalidLanguages = values(parsers).filter(
      language => !languages.includes(language),
    );
    if (invalidLanguages.length > 0) {
      throw new Error(
        `Cannot interpret parser map language values ${JSON.stringify(
          invalidLanguages,
        )} of package at ${location}, must be an object mapping file extensions to corresponding languages (mjs for ECMAScript modules, cjs for CommonJS modules, or json for JSON modules`,
      );
    }
    additionalParsers = { ...uncontroversialParsers, ...parsers };
  }
  if (type === 'module' || module !== undefined) {
    return { ...moduleParsers, ...additionalParsers };
  }
  if (type === 'commonjs') {
    return { ...commonParsers, ...additionalParsers };
  }
  if (type !== undefined) {
    throw new Error(
      `Cannot infer parser map for package of type ${type} at ${location}`,
    );
  }
  return { ...commonParsers, ...additionalParsers };
};

// for package logical path names
function comparePreferredPackageName(a, b) {
  // prefer shorter package names
  if (a.length > b.length) {
    return 1;
  } else if (a.length < b.length) {
    return -1;
  }
  // as a tie breaker, prefer alphabetical order
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  } else {
    return 0;
  }
}

// for comparing package logical path arrays (shorter is better)
function comparePackageLogicalPaths(aPath, bPath) {
  // undefined is not preferred
  if (aPath === undefined && bPath === undefined) {
    return 0;
  }
  if (aPath === undefined) {
    return 1;
  }
  if (bPath === undefined) {
    return -1;
  }
  // shortest path by part count is preferred
  if (aPath.length > bPath.length) {
    return 1;
  } else if (aPath.length < bPath.length) {
    return -1;
  }
  // as a tie breaker, prefer path ordered by preferred package names
  // iterate parts:
  //   if a is better than b -> yes
  //   if worse -> no
  //   if same -> continue
  for (let index = 0; index < aPath.length; index += 1) {
    const a = aPath[index];
    const b = bPath[index];
    const comparison = comparePreferredPackageName(a, b);
    if (comparison === 0) {
      // eslint-disable-next-line no-continue
      continue;
    } else {
      return comparison;
    }
  }
  return 0;
}

/**
 * graphPackage and gatherDependency are mutually recursive functions that
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
 * @param {Object} packageDetails
 * @param {string} packageDetails.packageLocation
 * @param {Object} packageDetails.packageDescriptor
 * @param {Set<string>} tags
 * @param {boolean} dev
 * @param {CommonDependencyDescriptors} commonDependencyDescriptors
 * @param {Array<string>} logicalPath
 * @param {Map<string, Array<string>>} preferredPackageLogicalPathMap
 * @returns {Promise<undefined>}
 */
const graphPackage = async (
  name,
  readDescriptor,
  canonical,
  graph,
  { packageLocation, packageDescriptor },
  tags,
  dev,
  commonDependencyDescriptors,
  logicalPath = [],
  preferredPackageLogicalPathMap,
) => {
  if (graph[packageLocation] !== undefined) {
    // Returning the promise here would create a causal cycle and stall recursion.
    return undefined;
  }

  if (packageDescriptor.name !== name) {
    console.warn(
      `Package named ${q(
        name,
      )} does not match location ${packageLocation} got (${q(
        packageDescriptor.name,
      )})`,
    );
  }

  const result = {};
  graph[packageLocation] = /** @type {Node} */ (result);

  /** @type {Record<string, string>} */
  const dependencyLocations = {};
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
  const allDependencies = {};
  assign(allDependencies, commonDependencyDescriptors);
  for (const [name, { spec }] of Object.entries(commonDependencyDescriptors)) {
    allDependencies[name] = spec;
  }
  assign(allDependencies, dependencies);
  assign(allDependencies, peerDependencies);
  for (const [name, { optional }] of Object.entries(peerDependenciesMeta)) {
    if (optional) {
      optionals.add(name);
    }
  }
  assign(allDependencies, bundleDependencies);
  assign(allDependencies, optionalDependencies);
  Object.keys(optionalDependencies).forEach(name => {
    optionals.add(name);
  });
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
        tags,
        childLogicalPath,
        preferredPackageLogicalPathMap,
        optional,
        commonDependencyDescriptors,
      ),
    );
  }

  const { version = '', exports: exportsDescriptor } = packageDescriptor;
  /** @type {Record<string, Language>} */
  const types = {};

  const readDescriptorUpwards = async path => {
    const location = resolveLocation(path, packageLocation);
    // readDescriptor coming from above is memoized, so this is not awfully slow
    const { data } = await searchDescriptor(location, readDescriptor);
    return data;
  };

  /** @type {Record<string, string>} */
  const externalAliases = {};
  /** @type {Record<string, string>} */
  const internalAliases = {};

  inferExportsAndAliases(
    packageDescriptor,
    externalAliases,
    internalAliases,
    tags,
    types,
  );

  Object.assign(result, {
    name,
    path: undefined,
    logicalPath,
    label: `${name}${version ? `-v${version}` : ''}`,
    explicitExports: exportsDescriptor !== undefined,
    externalAliases,
    internalAliases,
    dependencyLocations,
    types,
    parsers: inferParsers(packageDescriptor, packageLocation),
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
      throw new Error(
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
      throw new Error(
        `Cannot find dependency ${target} for ${packageLocation}`,
      );
    }
    dependencyLocations[specifier] = targetLocation;
  }

  return undefined;
};

/**
 * @param {ReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {Graph} graph - the partially build graph.
 * @param {Record<string, string>} dependencyLocations
 * @param {string} packageLocation - location of the package of interest.
 * @param {string} name - name of the package of interest.
 * @param {Set<string>} tags
 * @param {Array<string>} childLogicalPath
 * @param {Map<string, Array<string>>} preferredPackageLogicalPathMap
 * @param {boolean} optional - whether the dependency is optional
 * @param {Object} [commonDependencyDescriptors] - dependencies to be added to all packages
 */
const gatherDependency = async (
  readDescriptor,
  canonical,
  graph,
  dependencyLocations,
  packageLocation,
  name,
  tags,
  childLogicalPath = [],
  preferredPackageLogicalPathMap,
  optional = false,
  commonDependencyDescriptors,
) => {
  const dependency = await findPackage(
    readDescriptor,
    canonical,
    packageLocation,
    name,
  );
  if (dependency === undefined) {
    // allow the dependency to be missing if optional
    if (optional) {
      return;
    }
    throw new Error(`Cannot find dependency ${name} for ${packageLocation}`);
  }
  dependencyLocations[name] = dependency.packageLocation;
  const theCurrentBest = preferredPackageLogicalPathMap.get(
    dependency.packageLocation,
  );
  if (comparePackageLogicalPaths(childLogicalPath, theCurrentBest) < 0) {
    preferredPackageLogicalPathMap.set(
      dependency.packageLocation,
      childLogicalPath,
    );
  }
  await graphPackage(
    name,
    readDescriptor,
    canonical,
    graph,
    dependency,
    tags,
    false,
    commonDependencyDescriptors,
    childLogicalPath,
    preferredPackageLogicalPathMap,
  );
};

/**
 * graphPackages returns a graph whose keys are nominally URLs, one per
 * package, with values that are label: (an informative Compartment name, built
 * as ${name}@${version}), dependencies: (a list of URLs), and exports: (an
 * object whose keys are the thing being imported, and the values are the names
 * of the matching module, relative to the containing package's root, that is,
 * the URL that was used as the key of graph).
 * The URLs in dependencies will all exist as other keys of graph.
 *
 * @param {ReadFn} read
 * @param {CanonicalFn} canonical
 * @param {string} packageLocation - location of the main package.
 * @param {Set<string>} tags
 * @param {Object} mainPackageDescriptor - the parsed contents of the main
 * package.json, which was already read when searching for the package.json.
 * @param {boolean} dev - whether to use devDependencies from this package (and
 * only this package).
 * @param {Record<string,string>} [commonDependencies] - dependencies to be added to all packages
 */
const graphPackages = async (
  read,
  canonical,
  packageLocation,
  tags,
  mainPackageDescriptor,
  dev,
  commonDependencies = {},
) => {
  const memo = create(null);
  /**
   * @param {string} packageLocation
   * @returns {Promise<Object>}
   */
  const readDescriptor = packageLocation =>
    readDescriptorWithMemo(memo, read, packageLocation);

  if (mainPackageDescriptor !== undefined) {
    memo[packageLocation] = Promise.resolve(mainPackageDescriptor);
  }

  const packageDescriptor = await readDescriptor(packageLocation);

  tags = new Set(tags || []);
  tags.add('import');
  tags.add('default');
  tags.add('endo');

  if (packageDescriptor === undefined) {
    throw new Error(
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
      throw new Error(
        `Cannot find dependency ${dependencyName} for ${packageLocation} from common dependencies`,
      );
    }
    commonDependencyDescriptors[dependencyName] = {
      spec,
      alias,
    };
  }

  const preferredPackageLogicalPathMap = new Map();
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
    tags,
    dev,
    commonDependencyDescriptors,
    undefined,
    preferredPackageLogicalPathMap,
  );
  return graph;
};

/**
 * Compute the lexically shortest path from the entry package to each
 * transitive dependency package.
 * The path is a delimited with hashes, so hash is forbidden to dependency
 * names.
 * The empty string is a sentinel for a path that has not been computed.
 *
 * The shortest path serves as a suitable sort key for generating archives that
 * are consistent even when the package layout on disk changes, as the package
 * layout tends to differ between installation with and without devopment-time
 * dependencies.
 *
 * @param {Graph} graph
 * @param {string} location
 * @param {Array<string>} path
 */
const trace = (graph, location, path) => {
  const node = graph[location];
  if (node.path !== undefined && pathCompare(node.path, path) <= 0) {
    return;
  }
  node.path = path;
  if (path.join() !== node.logicalPath.join()) {
    console.log(`<dependency identifier algos differ> 
    < ${path.join('>')}
    > ${node.logicalPath.join('>')}
    ${location}`);
  }
  for (const name of keys(node.dependencyLocations)) {
    trace(graph, node.dependencyLocations[name], [...path, name]);
  }
};

/**
 * translateGraph converts the graph returned by graph packages (above) into a
 * compartment map.
 *
 * @param {string} entryPackageLocation
 * @param {string} entryModuleSpecifier
 * @param {Graph} graph
 * @param {Set<string>} tags - build tags about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @param {Object} policy
 * @returns {CompartmentMapDescriptor}
 */
const translateGraph = (
  entryPackageLocation,
  entryModuleSpecifier,
  graph,
  tags,
  policy,
) => {
  /** @type {Record<string, CompartmentDescriptor>} */
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
      dependencyLocations,
      internalAliases,
      parsers,
      types,
    } = graph[dependeeLocation];
    /** @type {Record<string, ModuleDescriptor>} */
    const moduleDescriptors = Object.create(null);
    /** @type {Record<string, ScopeDescriptor>} */
    const scopes = Object.create(null);

    /**
     * @param {string} dependencyName
     * @param {string} packageLocation
     */
    const digestExternalAliases = (dependencyName, packageLocation) => {
      const { externalAliases, explicitExports } = graph[packageLocation];
      for (const exportPath of keys(externalAliases).sort()) {
        const targetPath = externalAliases[exportPath];
        // dependency name may be different from package's name,
        // as in the case of browser field dependency replacements
        const localPath = join(dependencyName, exportPath);
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

    const packagePolicy = getPolicyFor(
      dependeeLocation === entryPackageLocation ? name : dependeeLocation,
      policy,
    );

    compartments[dependeeLocation] = {
      label,
      name,
      path,
      location: dependeeLocation,
      modules: moduleDescriptors,
      scopes,
      parsers,
      types,
      policy: packagePolicy,
    };
  }

  return {
    tags: [...tags],
    entry: {
      compartment: entryPackageLocation,
      module: entryModuleSpecifier,
    },
    compartments,
  };
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} packageLocation
 * @param {Set<string>} tags
 * @param {Object} packageDescriptor
 * @param {string} moduleSpecifier
 * @param {Object} [options]
 * @param {boolean} [options.dev]
 * @param {Object} [options.commonDependencies]
 * @param {Object} [options.policy]
 * @returns {Promise<CompartmentMapDescriptor>}
 */
export const compartmentMapForNodeModules = async (
  readPowers,
  packageLocation,
  tags,
  packageDescriptor,
  moduleSpecifier,
  options = {},
) => {
  const { dev = false, commonDependencies, policy } = options;
  const { read, canonical } = unpackReadPowers(readPowers);
  const graph = await graphPackages(
    read,
    canonical,
    packageLocation,
    tags,
    packageDescriptor,
    dev,
    commonDependencies,
  );

  trace(graph, packageLocation, []);

  // console.log(graph)

  const compartmentMap = translateGraph(
    packageLocation,
    moduleSpecifier,
    graph,
    tags,
    policy,
  );

  return compartmentMap;
};

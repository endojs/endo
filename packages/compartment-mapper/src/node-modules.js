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
 * @property {boolean} explicit
 * @property {Record<string, string>} exports
 * @property {Record<string, string>} dependencies - from module name to
 * location in storage.
 * @property {Record<string, Language>} parsers - the parser for
 * modules based on their extension.
 * @property {Record<string, Language>} types - the parser for specific
 * modules.
 */

import { inferExports } from './infer-exports.js';
import { parseLocatedJson } from './json.js';
import { unpackReadPowers } from './powers.js';

const { assign, create, keys, values } = Object;

const decoder = new TextDecoder();

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

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

const languages = ['mjs', 'cjs', 'json'];
const uncontroversialParsers = { cjs: 'cjs', mjs: 'mjs', json: 'json' };
const commonParsers = { js: 'cjs', ...uncontroversialParsers };
const moduleParsers = { js: 'mjs', ...uncontroversialParsers };

/**
 * @param {Object} descriptor
 * @param {string} location
 * @returns {Record<string, string>}
 */
const inferParsers = (descriptor, location) => {
  const { type, parsers } = descriptor;
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
    return { ...uncontroversialParsers, ...parsers };
  }
  if (type === 'module') {
    return moduleParsers;
  }
  if (type === 'commonjs') {
    return commonParsers;
  }
  if (type !== undefined) {
    throw new Error(
      `Cannot infer parser map for package of type ${type} at ${location}`,
    );
  }
  return commonParsers;
};

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
) => {
  if (graph[packageLocation] !== undefined) {
    // Returning the promise here would create a causal cycle and stall recursion.
    return undefined;
  }

  if (packageDescriptor.name !== name) {
    console.warn(
      `Package named ${q(name)} does not match location ${packageLocation}`,
    );
  }

  const result = {};
  graph[packageLocation] = /** @type {Node} */ (result);

  /** @type {Record<string, string>} */
  const dependencies = {};
  const children = [];
  const predicates = packageDescriptor.dependencies || {};
  if (dev) {
    assign(predicates, packageDescriptor.devDependencies || {});
  }
  for (const name of keys(predicates).sort()) {
    children.push(
      // Mutual recursion ahead:
      // eslint-disable-next-line no-use-before-define
      gatherDependency(
        readDescriptor,
        canonical,
        graph,
        dependencies,
        packageLocation,
        name,
        tags,
      ),
    );
  }

  const { version = '', exports } = packageDescriptor;
  /** @type {Record<string, Language>} */
  const types = {};

  Object.assign(result, {
    name,
    label: `${name}${version ? `-v${version}` : ''}`,
    explicit: exports !== undefined,
    exports: inferExports(packageDescriptor, tags, types),
    dependencies,
    types,
    parsers: inferParsers(packageDescriptor, packageLocation),
  });

  await Promise.all(children);
  return undefined;
};

/**
 * @param {ReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {Graph} graph - the partially build graph.
 * @param {Record<string, string>} dependencies
 * @param {string} packageLocation - location of the package of interest.
 * @param {string} name - name of the package of interest.
 * @param {Set<string>} tags
 */
const gatherDependency = async (
  readDescriptor,
  canonical,
  graph,
  dependencies,
  packageLocation,
  name,
  tags,
) => {
  const dependency = await findPackage(
    readDescriptor,
    canonical,
    packageLocation,
    name,
  );
  if (dependency === undefined) {
    throw new Error(`Cannot find dependency ${name} for ${packageLocation}`);
  }
  dependencies[name] = dependency.packageLocation;
  await graphPackage(
    name,
    readDescriptor,
    canonical,
    graph,
    dependency,
    tags,
    false,
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
 */
const graphPackages = async (
  read,
  canonical,
  packageLocation,
  tags,
  mainPackageDescriptor,
  dev,
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

  if (packageDescriptor === undefined) {
    throw new Error(
      `Cannot find package.json for application at ${packageLocation}`,
    );
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
    tags,
    dev,
  );
  return graph;
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
 * @returns {CompartmentMapDescriptor}
 */
const translateGraph = (
  entryPackageLocation,
  entryModuleSpecifier,
  graph,
  tags,
) => {
  /** @type {Record<string, CompartmentDescriptor>} */
  const compartments = {};

  // For each package, build a map of all the external modules the package can
  // import from other packages.
  // The keys of this map are the full specifiers of those modules from the
  // perspective of the importing package.
  // The values are records that name the exporting compartment and the full
  // specifier of the module from the exporting package.
  // The full map includes every exported module from every dependencey
  // package and is a complete list of every external module that the
  // corresponding compartment can import.
  for (const packageLocation of keys(graph).sort()) {
    const { name, label, dependencies, parsers, types } = graph[
      packageLocation
    ];
    /** @type {Record<string, ModuleDescriptor>} */
    const modules = {};
    /** @type {Record<string, ScopeDescriptor>} */
    const scopes = {};
    /**
     * @param {string} dependencyName
     * @param {string} packageLocation
     */
    const digest = (dependencyName, packageLocation) => {
      const { exports, explicit } = graph[packageLocation];
      for (const exportName of keys(exports).sort()) {
        const module = exports[exportName];
        modules[exportName] = {
          compartment: packageLocation,
          module,
        };
      }
      if (!explicit) {
        scopes[dependencyName] = {
          compartment: packageLocation,
        };
      }
    };
    // Support reflexive package imports.
    digest(name, entryPackageLocation);
    // Support external package imports.
    for (const dependencyName of keys(dependencies).sort()) {
      const packageLocation = dependencies[dependencyName];
      digest(dependencyName, packageLocation);
    }
    compartments[packageLocation] = {
      label,
      name,
      location: packageLocation,
      modules,
      scopes,
      parsers,
      types,
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
  const { dev = false } = options;
  const { read, canonical } = unpackReadPowers(readPowers);
  const graph = await graphPackages(
    read,
    canonical,
    packageLocation,
    tags,
    packageDescriptor,
    dev,
  );
  return translateGraph(packageLocation, moduleSpecifier, graph, tags);
};

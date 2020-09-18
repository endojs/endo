/* eslint no-shadow: 0 */

import { inferExports } from "./infer-exports.js";
import * as json from "./json.js";

const { create, entries, keys, values } = Object;

const decoder = new TextDecoder();

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const basename = location => {
  const { pathname } = new URL(location);
  const index = pathname.lastIndexOf("/");
  if (index < 0) {
    return pathname;
  }
  return pathname.slice(index + 1);
};

const readDescriptor = async (read, packageLocation) => {
  const descriptorLocation = resolveLocation("package.json", packageLocation);
  const descriptorBytes = await read(descriptorLocation).catch(
    _error => undefined
  );
  if (descriptorBytes === undefined) {
    return undefined;
  }
  const descriptorText = decoder.decode(descriptorBytes);
  const descriptor = json.parse(descriptorText, descriptorLocation);
  return descriptor;
};

const readDescriptorWithMemo = async (memo, read, packageLocation) => {
  let promise = memo[packageLocation];
  if (promise !== undefined) {
    return promise;
  }
  promise = readDescriptor(read, packageLocation);
  memo[packageLocation] = promise;
  return promise;
};

// findPackage behaves as Node.js to find third-party modules by searching
// parent to ancestor directories for a `node_modules` directory that contains
// the name.
// Node.js does not actually require these to be packages, but in practice,
// these are the locations that pakcage managers drop a package so Node.js can
// find it efficiently.
const findPackage = async (readDescriptor, directory, name) => {
  for (;;) {
    const packageLocation = resolveLocation(`node_modules/${name}/`, directory);
    // eslint-disable-next-line no-await-in-loop
    const packageDescriptor = await readDescriptor(packageLocation);
    if (packageDescriptor !== undefined) {
      return { packageLocation, packageDescriptor };
    }

    const parent = resolveLocation("../", directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;

    const base = basename(directory);
    if (base === "node_modules") {
      directory = resolveLocation("../", directory);
      if (parent === directory) {
        return undefined;
      }
      directory = parent;
    }
  }
};

const languages = ["cjs", "mjs", "json"];
const uncontroversialParsers = { cjs: "cjs", mjs: "mjs", json: "json" };
const commonParsers = { js: "cjs", ...uncontroversialParsers };
const moduleParsers = { js: "mjs", ...uncontroversialParsers };

const inferParsers = (descriptor, location) => {
  const { type, parsers } = descriptor;
  if (parsers !== undefined) {
    if (typeof parsers !== "object") {
      throw new Error(
        `Cannot interpret parser map ${JSON.stringify(
          parsers
        )} of package at ${location}, must be an object mapping file extensions to corresponding languages (mjs for ECMAScript modules, cjs for CommonJS modules, or json for JSON modules`
      );
    }
    const invalidLanguages = values(parsers).filter(
      language => !languages.includes(language)
    );
    if (invalidLanguages.length > 0) {
      throw new Error(
        `Cannot interpret parser map language values ${JSON.stringify(
          invalidLanguages
        )} of package at ${location}, must be an object mapping file extensions to corresponding languages (mjs for ECMAScript modules, cjs for CommonJS modules, or json for JSON modules`
      );
    }
    return { ...uncontroversialParsers, ...parsers };
  }
  if (type === "module") {
    return moduleParsers;
  }
  if (type === "commonjs") {
    return commonParsers;
  }
  if (type !== undefined) {
    throw new Error(
      `Cannot infer parser map for package of type ${type} at ${location}`
    );
  }
  return commonParsers;
};

// graphPackage and gatherDependency are mutually recursive functions that
// gather the metadata for a package and its transitive dependencies.
// The keys of the graph are the locations of the package descriptors.
// The metadata include a label (which is informative and not necessarily
// unique), the location of each shallow dependency, and names of the modules
// that the package exports.

const graphPackage = async (
  name = "",
  readDescriptor,
  graph,
  { packageLocation, packageDescriptor },
  tags
) => {
  if (graph[packageLocation] !== undefined) {
    // Returning the promise here would create a causal cycle and stall recursion.
    return undefined;
  }

  if (packageDescriptor.name !== name) {
    console.warn(
      `Package named ${q(name)} does not match location ${packageLocation}`
    );
  }

  const result = {};
  graph[packageLocation] = result;

  const dependencies = {};
  const children = [];
  for (const name of keys(packageDescriptor.dependencies || {})) {
    children.push(
      // Mutual recursion ahead:
      // eslint-disable-next-line no-use-before-define
      gatherDependency(
        readDescriptor,
        graph,
        dependencies,
        packageLocation,
        name,
        tags
      )
    );
  }

  const { version = "", exports } = packageDescriptor;
  const types = {};

  Object.assign(result, {
    label: `${name}${version ? `-v${version}` : ""}`,
    explicit: exports !== undefined,
    exports: inferExports(packageDescriptor, tags, types),
    dependencies,
    types,
    parsers: inferParsers(packageDescriptor, packageLocation)
  });

  return Promise.all(children);
};

const gatherDependency = async (
  readDescriptor,
  graph,
  dependencies,
  packageLocation,
  name,
  tags
) => {
  const dependency = await findPackage(readDescriptor, packageLocation, name);
  if (dependency === undefined) {
    throw new Error(`Cannot find dependency ${name} for ${packageLocation}`);
  }
  dependencies[name] = dependency.packageLocation;
  await graphPackage(name, readDescriptor, graph, dependency, tags);
};

// graphPackages returns a graph whose keys are nominally URLs, one per
// package, with values that are label: (an informative Compartment name, built
// as ${name}@${version}), dependencies: (a list of URLs), and exports: (an
// object whose keys are the thing being imported, and the values are the names
// of the matching module, relative to the containing package's root, that is,
// the URL that was used as the key of graph).
// The URLs in dependencies will all exist as other keys of graph.
const graphPackages = async (
  read,
  packageLocation,
  tags,
  mainPackageDescriptor
) => {
  const memo = create(null);
  const readDescriptor = packageLocation =>
    readDescriptorWithMemo(memo, read, packageLocation);

  if (mainPackageDescriptor !== undefined) {
    memo[packageLocation] = Promise.resolve(mainPackageDescriptor);
  }

  const packageDescriptor = await readDescriptor(packageLocation);

  tags = new Set(tags || []);
  tags.add("import");

  if (packageDescriptor === undefined) {
    throw new Error(
      `Cannot find package.json for application at ${packageLocation}`
    );
  }
  const graph = create(null);
  await graphPackage(
    packageDescriptor.name,
    readDescriptor,
    graph,
    {
      packageLocation,
      packageDescriptor
    },
    tags
  );
  return graph;
};

// translateGraph converts the graph returned by graph packages (above) into a
// compartment map.
const translateGraph = (mainPackagePath, graph) => {
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
  for (const [
    packageLocation,
    { label, dependencies, parsers, types }
  ] of entries(graph)) {
    const modules = {};
    const scopes = {};
    for (const [dependencyName, packageLocation] of entries(dependencies)) {
      const { exports, explicit } = graph[packageLocation];
      for (const [exportName, module] of entries(exports)) {
        modules[exportName] = {
          compartment: packageLocation,
          module
        };
      }
      if (!explicit) {
        scopes[dependencyName] = {
          compartment: packageLocation
        };
      }
    }
    compartments[packageLocation] = {
      label,
      location: packageLocation,
      modules,
      scopes,
      parsers,
      types
    };
  }

  return {
    main: mainPackagePath,
    compartments
  };
};

export const compartmentMapForNodeModules = async (
  read,
  packageLocation,
  tags,
  packageDescriptor
) => {
  const graph = await graphPackages(
    read,
    packageLocation,
    tags,
    packageDescriptor
  );
  return translateGraph(packageLocation, graph);
};

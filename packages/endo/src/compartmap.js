/* eslint no-shadow: 0 */

import { inferExports } from "./infer-exports.js";

const { create, keys, entries } = Object;

const decoder = new TextDecoder();

const resolve = (rel, abs) => new URL(rel, abs).toString();

const basename = location => {
  const { pathname } = new URL(location);
  const index = pathname.lastIndexOf("/");
  if (index < 0) {
    return pathname;
  }
  return pathname.slice(index + 1);
};

const readDescriptor = async (read, packageLocation) => {
  const descriptorPath = resolve("package.json", packageLocation);
  const descriptorBytes = await read(descriptorPath).catch(_error => undefined);
  if (descriptorBytes === undefined) {
    return undefined;
  }
  const descriptorText = decoder.decode(descriptorBytes);
  const descriptor = JSON.parse(descriptorText);
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

const findPackage = async (readDescriptor, directory, name) => {
  for (;;) {
    const packageLocation = resolve(`node_modules/${name}/`, directory);
    // eslint-disable-next-line no-await-in-loop
    const packageDescriptor = await readDescriptor(packageLocation);
    if (packageDescriptor !== undefined) {
      return { packageLocation, packageDescriptor };
    }

    const parent = resolve("../", directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;

    const base = basename(directory);
    if (base === "node_modules") {
      directory = resolve("../", directory);
      if (parent === directory) {
        return undefined;
      }
      directory = parent;
    }
  }
};

const graphPackage = async (
  readDescriptor,
  graph,
  { packageLocation, packageDescriptor },
  tags
) => {
  if (graph[packageLocation] !== undefined) {
    // Returning the promise here would create a causal cycle and stall recursion.
    return undefined;
  }
  const result = {};
  graph[packageLocation] = result;

  const dependencies = [];
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

  const { name, version } = packageDescriptor;
  result.label = `${name}@${version}`;
  result.dependencies = dependencies;
  result.exports = inferExports(packageDescriptor, tags);

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
  dependencies.push(dependency.packageLocation);
  await graphPackage(readDescriptor, graph, dependency, tags);
};

// This returns a graph whose keys are nominally URLs, one per package, with
// values that are label: (an informative Compartment name, built as
// ${name}@${version}), dependencies: (a list of URLs), and exports: (an object
// whose keys are the thing being imported, and the values are the names of the
// matching module, relative to the containing package's root, i.e. the URL
// that was used as the key of graph). The URLs in dependencies will all exist
// as other keys of graph.
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
  tags.add("endo");

  if (packageDescriptor === undefined) {
    throw new Error(
      `Cannot find package.json for application at ${packageLocation}`
    );
  }
  const graph = create(null);
  await graphPackage(
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

const translateGraph = (mainPackagePath, graph) => {
  const compartments = {};

  for (const [packageLocation, { label, dependencies }] of entries(graph)) {
    const modules = {};
    for (const packageLocation of dependencies) {
      const { exports } = graph[packageLocation];
      for (const [exportName, module] of entries(exports)) {
        modules[exportName] = {
          compartment: packageLocation,
          module
        };
      }
    }
    compartments[packageLocation] = {
      label,
      root: packageLocation,
      modules
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

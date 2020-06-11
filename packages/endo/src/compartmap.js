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

const readDescriptor = async (read, packagePath) => {
  const descriptorPath = resolve("package.json", packagePath);
  const descriptorBytes = await read(descriptorPath).catch(_error => undefined);
  if (descriptorBytes === undefined) {
    return undefined;
  }
  const descriptorText = decoder.decode(descriptorBytes);
  const descriptor = JSON.parse(descriptorText);
  return descriptor;
};

const readDescriptorWithMemo = async (memo, read, packagePath) => {
  let promise = memo[packagePath];
  if (promise !== undefined) {
    return promise;
  }
  promise = readDescriptor(read, packagePath);
  memo[packagePath] = promise;
  return promise;
};

const findPackage = async (readDescriptor, directory, name) => {
  for (;;) {
    const packagePath = resolve(`node_modules/${name}/`, directory);
    // eslint-disable-next-line no-await-in-loop
    const packageDescriptor = await readDescriptor(packagePath);
    if (packageDescriptor !== undefined) {
      return { packagePath, packageDescriptor };
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
  { packagePath, packageDescriptor },
  tags
) => {
  if (graph[packagePath] !== undefined) {
    // Returning the promise here would create a causal cycle and stall recursion.
    return undefined;
  }
  const result = {};
  graph[packagePath] = result;

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
        packagePath,
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
  packagePath,
  name,
  tags
) => {
  const dependency = await findPackage(readDescriptor, packagePath, name);
  if (dependency === undefined) {
    throw new Error(`Cannot find dependency ${name} for ${packagePath}`);
  }
  dependencies.push(dependency.packagePath);
  await graphPackage(readDescriptor, graph, dependency, tags);
};

const graphPackages = async (
  read,
  packagePath,
  tags,
  mainPackageDescriptor
) => {
  const memo = create(null);
  const readDescriptor = packagePath =>
    readDescriptorWithMemo(memo, read, packagePath);

  if (mainPackageDescriptor !== undefined) {
    memo[packagePath] = Promise.resolve(mainPackageDescriptor);
  }

  const packageDescriptor = await readDescriptor(packagePath);

  tags = new Set(tags || []);
  tags.add("import", "endo");

  if (packageDescriptor === undefined) {
    throw new Error(
      `Cannot find package.json for application at ${packagePath}`
    );
  }
  const graph = create(null);
  await graphPackage(
    readDescriptor,
    graph,
    {
      packagePath,
      packageDescriptor
    },
    tags
  );
  return graph;
};

const translateGraph = (mainPackagePath, graph) => {
  const compartments = {};

  for (const [packagePath, { label, dependencies }] of entries(graph)) {
    const modules = {};
    for (const packagePath of dependencies) {
      const { exports } = graph[packagePath];
      for (const [exportName, module] of entries(exports)) {
        modules[exportName] = {
          compartment: packagePath,
          module
        };
      }
    }
    compartments[packagePath] = {
      label,
      root: packagePath,
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
  packagePath,
  tags,
  packageDescriptor
) => {
  const graph = await graphPackages(read, packagePath, tags, packageDescriptor);
  return translateGraph(packagePath, graph);
};

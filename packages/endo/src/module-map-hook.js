const { entries } = Object;

// For a full, absolute module specifier like "dependency",
// produce the module specifier in the dependency, like ".".
// For a deeper path like "@org/dep/aux" and a prefix like "@org/dep", produce
// "./aux".
const trimModuleSpecifierPrefix = (moduleSpecifier, prefix) => {
  if (moduleSpecifier === prefix) {
    return ".";
  }
  if (moduleSpecifier.startsWith(`${prefix}/`)) {
    return `./${moduleSpecifier.slice(prefix.length + 1)}`;
  }
  return undefined;
};

// `makeModuleMapHook` generates a `moduleMapHook` for the `Compartment`
// constructor, suitable for Node.js style packages where any module in the
// package might be imported.
// Since searching for all of these modules up front is either needlessly
// costly (on a file system) or impossible (from a web service), we
// let the import graph guide our search.
// Any module specifier with an absolute prefix should be captured by
// the `moduleMap` or `moduleMapHook`.
export const makeModuleMapHook = (scopes, modules) => {
  const moduleMapHook = moduleSpecifier => {
    // Search for a scope that shares a prefix with the requested module
    // specifier.
    // This might be better with a trie, but only a benchmark on real-world
    // data would tell us whether the additional complexity would translate to
    // better performance, so this is left readable and presumed slow for now.
    for (const [prefix, { compartment, compartmentName }] of entries(scopes)) {
      const remainder = trimModuleSpecifierPrefix(moduleSpecifier, prefix);
      if (remainder) {
        // The following line is weird.
        // Information is flowing backward.
        // This moduleMapHook writes back to the `modules` descriptor, from the
        // original compartment map.
        // So the compartment map that was used to create the compartment
        // assembly, can then be captured in an archive, obviating the need for
        // a moduleMapHook when we assemble compartments from the resulting
        // archiev.
        modules[moduleSpecifier] = {
          compartment: compartmentName,
          module: remainder
        };

        return compartment.module(remainder);
      }
    }

    // No entry in the module map.
    // Compartments will fall through to their `importHook`.
    return undefined;
  };

  return moduleMapHook;
};

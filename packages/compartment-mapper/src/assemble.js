import { resolve } from "./node-module-specifier.js";
import { mapParsers } from "./parse.js";

const { entries } = Object;

const defaultCompartment = Compartment;

// q, as in quote, for strings in error messages.
const q = JSON.stringify;

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
const makeModuleMapHook = (
  compartments,
  compartmentName,
  moduleDescriptors,
  scopeDescriptors,
  exitModules
) => {
  const moduleMapHook = moduleSpecifier => {
    const moduleDescriptor = moduleDescriptors[moduleSpecifier];
    if (moduleDescriptor !== undefined) {
      const {
        compartment: foreignCompartmentName = compartmentName,
        module: foreignModuleSpecifier,
        exit
      } = moduleDescriptor;
      if (exit !== undefined) {
        // TODO Currenly, only the entry package can connect to built-in modules.
        // Policies should be able to allow third-party modules to exit to
        // built-ins, or have built-ins subverted by modules from specific
        // compartments.
        const module = exitModules[exit];
        if (module === undefined) {
          throw new Error(`Cannot import missing external module ${q(exit)}`);
        }
        return module;
      }
      if (foreignModuleSpecifier !== undefined) {
        const foreignCompartment = compartments[foreignCompartmentName];
        if (foreignCompartment === undefined) {
          throw new Error(
            `Cannot import from missing compartment ${q(
              foreignCompartmentName
            )}`
          );
        }
        return foreignCompartment.module(foreignModuleSpecifier);
      }
    }

    // Search for a scope that shares a prefix with the requested module
    // specifier.
    // This might be better with a trie, but only a benchmark on real-world
    // data would tell us whether the additional complexity would translate to
    // better performance, so this is left readable and presumed slow for now.
    for (const [scopePrefix, scopeDescriptor] of entries(scopeDescriptors)) {
      const foreignModuleSpecifier = trimModuleSpecifierPrefix(
        moduleSpecifier,
        scopePrefix
      );

      if (foreignModuleSpecifier !== undefined) {
        const { compartment: foreignCompartmentName } = scopeDescriptor;
        const foreignCompartment = compartments[foreignCompartmentName];
        if (foreignCompartment === undefined) {
          throw new Error(
            `Cannot import from missing compartment ${q(
              foreignCompartmentName
            )}`
          );
        }

        // The following line is weird.
        // Information is flowing backward.
        // This moduleMapHook writes back to the `modules` descriptor, from the
        // original compartment map.
        // So the compartment map that was used to create the compartment
        // assembly, can then be captured in an archive, obviating the need for
        // a moduleMapHook when we assemble compartments from the resulting
        // archiev.
        moduleDescriptors[moduleSpecifier] = {
          compartment: foreignCompartmentName,
          module: foreignModuleSpecifier
        };
        return foreignCompartment.module(foreignModuleSpecifier);
      }
    }

    // No entry in the module map.
    // Compartments will fall through to their `importHook`.
    return undefined;
  };

  return moduleMapHook;
};

// Assemble a DAG of compartments as declared in a compartment map starting at
// the named compartment and building all compartments that it depends upon,
// recursively threading the modules exported by one compartment into the
// compartment that imports them.
// Returns the root of the compartment DAG.
// Does not load or execute any modules.
// Uses makeImportHook with the given "location" string of each compartment in
// the DAG.
// Passes the given endowments and external modules into the root compartment
// only.
export const assemble = (
  { entry, compartments: compartmentDescriptors },
  {
    makeImportHook,
    endowments = {},
    modules: exitModules = {},
    Compartment = defaultCompartment
  }
) => {
  const { compartment: entryCompartmentName } = entry;

  const compartments = {};
  for (const [compartmentName, compartmentDescriptor] of entries(
    compartmentDescriptors
  )) {
    const {
      location,
      modules = {},
      parsers = {},
      types = {},
      scopes = {}
    } = compartmentDescriptor;

    // Capture the default.
    // The `moduleMapHook` writes back to the compartment map.
    compartmentDescriptor.modules = modules;

    const parse = mapParsers(parsers, types);
    const importHook = makeImportHook(location, parse);
    const moduleMapHook = makeModuleMapHook(
      compartments,
      compartmentName,
      modules,
      scopes,
      exitModules
    );
    const resolveHook = resolve;

    // TODO also thread endowments selectively.
    const compartment = new Compartment(endowments, exitModules, {
      resolveHook,
      importHook,
      moduleMapHook,
      name: location
    });

    compartments[compartmentName] = compartment;
  }

  const compartment = compartments[entryCompartmentName];
  if (compartment === undefined) {
    throw new Error(
      `Cannot assemble compartment graph because the root compartment named ${q(
        entryCompartmentName
      )} is missing from the compartment map`
    );
  }

  return compartment;
};

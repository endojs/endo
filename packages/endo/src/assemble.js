/* global Compartment */

import { resolve } from "./node-module-specifier.js";
import { mapParsers } from "./parse.js";
import { makeModuleMapHook } from "./module-map-hook.js";

const { entries } = Object;

const defaultCompartment = Compartment;

// q, as in quote, for strings in error messages.
const q = JSON.stringify;

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
export const assemble = ({
  name,
  compartments,
  makeImportHook,
  parents = [],
  loaded = {},
  endowments = {},
  modules = {},
  Compartment = defaultCompartment
}) => {
  const descriptor = compartments[name];
  if (descriptor === undefined) {
    throw new Error(
      `Cannot assemble compartment graph with missing compartment descriptor named ${q(
        name
      )}, needed by ${parents.map(q).join(", ")}`
    );
  }
  const result = loaded[name];
  if (result !== undefined) {
    return result;
  }
  if (parents.includes(name)) {
    throw new Error(`Cannot assemble compartment graph that includes a cycle`);
  }

  descriptor.modules = descriptor.modules || {};
  for (const [inner, outer] of entries(descriptor.modules)) {
    const {
      compartment: compartmentName,
      module: moduleSpecifier,
      exit
    } = outer;
    if (exit !== undefined) {
      // TODO Currenly, only the entry package can connect to built-in modules.
      // Policies should be able to allow third-party modules to exit to
      // built-ins, or have built-ins subverted by modules from specific
      // compartments.
      const module = modules[exit];
      if (module === undefined) {
        throw new Error(
          `Cannot assemble module graph with missing external module ${q(exit)}`
        );
      }
      modules[inner] = module;
    } else if (compartmentName !== undefined) {
      const compartment = assemble({
        name: compartmentName,
        compartments,
        makeImportHook,
        parents: [...parents, name],
        loaded,
        Compartment
      });
      modules[inner] = compartment.module(moduleSpecifier);
    }
  }

  const scopes = {};
  for (const [prefix, scope] of entries(descriptor.scopes || {})) {
    const { compartment: compartmentName } = scope;
    const compartment = assemble({
      name: compartmentName,
      compartments,
      makeImportHook,
      parents: [...parents, name],
      loaded,
      Compartment
    });
    scopes[prefix] = { compartment, compartmentName };
  }

  const parse = mapParsers(descriptor.parsers || {}, descriptor.types || {});
  // TODO makeResolveHook that filters on file patterns

  const compartment = new Compartment(endowments, modules, {
    resolveHook: resolve,
    importHook: makeImportHook(descriptor.location, parse),
    moduleMapHook: makeModuleMapHook(scopes, descriptor.modules)
  });

  loaded[name] = compartment;
  return compartment;
};

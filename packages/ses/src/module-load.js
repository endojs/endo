// For brevity, in this file, as in module-link.js, the term "moduleRecord"
// without qualification means "module compartment record".
// This is a super-set of the "static module record", that is reusable between
// compartments with different hooks.
// The "module compartment record" captures the compartment and overlays the
// module's "imports" with the more specific "resolvedImports" as inferred from
// the particular compartment's "resolveHook".

import { create, values, freeze } from './commons.js';

// `makeAlias` constructs compartment specifier tuples for the `aliases`
// private field of compartments.
// These aliases allow a compartment to alias an internal module specifier to a
// module specifier in an external compartment, and also to create internal
// aliases.
// Both are facilitated by the moduleMap Compartment constructor option.
export const makeAlias = (compartment, specifier) =>
  freeze({
    compartment,
    specifier,
  });

// `resolveAll` pre-computes resolutions of all imports within the compartment
// in which a module was loaded.
const resolveAll = (imports, resolveHook, fullReferrerSpecifier) => {
  const resolvedImports = create(null);
  for (const importSpecifier of imports) {
    const fullSpecifier = resolveHook(importSpecifier, fullReferrerSpecifier);
    resolvedImports[importSpecifier] = fullSpecifier;
  }
  return freeze(resolvedImports);
};

// `load` asynchronously loads `StaticModuleRecords` and creates a complete
// graph of `ModuleCompartmentRecords`.
// The module records refer to each other by a reference to the dependency's
// compartment and the specifier of the module within its own compartment.
// This graph is then ready to be synchronously linked and executed.
export const load = async (
  compartmentPrivateFields,
  compartment,
  moduleSpecifier,
) => {
  const {
    resolveHook,
    importHook,
    aliases,
    moduleRecords,
  } = compartmentPrivateFields.get(compartment);

  // Follow aliases.
  if (aliases.has(moduleSpecifier)) {
    const alias = aliases.get(moduleSpecifier);
    const moduleRecord = await load(
      compartmentPrivateFields,
      alias.compartment,
      alias.specifier,
    );
    moduleRecords.set(moduleSpecifier, moduleRecord);
    return moduleRecord;
  }

  // Memoize.
  if (moduleRecords.has(moduleSpecifier)) {
    return moduleRecords.get(moduleSpecifier);
  }

  const staticModuleRecord = await importHook(moduleSpecifier);

  // resolve all imports relative to this referrer module.
  const resolvedImports = resolveAll(
    staticModuleRecord.imports,
    resolveHook,
    moduleSpecifier,
  );
  const moduleRecord = freeze({
    compartment,
    staticModuleRecord,
    moduleSpecifier,
    resolvedImports,
  });

  // Memoize.
  moduleRecords.set(moduleSpecifier, moduleRecord);

  // Await all dependencies to load, recursively.
  await Promise.all(
    values(resolvedImports).map(fullSpecifier =>
      load(compartmentPrivateFields, compartment, fullSpecifier),
    ),
  );

  return moduleRecord;
};

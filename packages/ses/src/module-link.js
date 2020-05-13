// For brevity, in this file, as in module-load.js, the term "moduleRecord"
// without qualification means "module compartment record".
// This is a super-set of the "module static record", that is reusable between
// compartments with different hooks.
// The "module compartment record" captures the compartment and overlays the
// module's "imports" with the more specific "resolvedImports" as inferred from
// the particular compartment's "resolveHook".

import { makeModuleInstance } from './module-instance.js';

const { entries } = Object;
// q, as in quote, for quoting strings in error messages.
const q = JSON.stringify;

// `link` creates `ModuleInstances` and `ModuleNamespaces` for a module and its
// transitive dependencies and connects their imports and exports.
// After linking, the resulting working set is ready to be executed.
// The linker only concerns itself with module namespaces that are objects with
// property descriptors for their exports, which the Compartment proxies with
// the actual `ModuleNamespace`.
export const link = (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
) => {
  const { moduleRecords } = compartmentPrivateFields.get(compartment);

  const moduleRecord = moduleRecords.get(moduleSpecifier);
  if (moduleRecord == null) {
    throw new ReferenceError(`Missing link to module ${q(moduleSpecifier)}`);
  }

  // Mutual recursion so there's no confusion about which
  // compartment is in context: the module record may be in another
  // compartment, denoted by moduleRecord.compartment.
  // eslint-disable-next-line no-use-before-define
  return instantiate(compartmentPrivateFields, moduleAliases, moduleRecord);
};

export const instantiate = (
  compartmentPrivateFields,
  moduleAliases,
  moduleRecord,
) => {
  const { compartment, moduleSpecifier, resolvedImports } = moduleRecord;
  const { globalObject, instances } = compartmentPrivateFields.get(compartment);

  // Memoize.
  if (instances.has(moduleSpecifier)) {
    return instances.get(moduleSpecifier);
  }

  const importedInstances = new Map();
  const moduleInstance = makeModuleInstance(
    compartmentPrivateFields,
    moduleAliases,
    moduleRecord,
    importedInstances,
    globalObject,
  );

  // Memoize.
  instances.set(moduleSpecifier, moduleInstance);

  // Link dependency modules.
  for (const [importSpecifier, resolvedSpecifier] of entries(resolvedImports)) {
    const importedInstance = link(
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      resolvedSpecifier,
    );
    importedInstances.set(importSpecifier, importedInstance);
  }

  return moduleInstance;
};

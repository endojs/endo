import { makeModuleInstance } from './module-instance.js';

const { entries } = Object;

// `link` creates `ModuleInstances` and `ModuleNamespaces` for a module and its
// transitive dependencies and connects their imports and exports.
// After linking, the resulting working set is ready to be executed.
// The linker only concerns itself with module namespaces that are objects with
// property descriptors for their exports, which the Compartment proxies with
// the actual `ModuleNamespace`.
export const link = (
  compartment,
  compartmentPrivateFields,
  moduleSpecifier,
) => {
  const { moduleRecords, instances } = compartmentPrivateFields.get(
    compartment,
  );

  // Memoize.
  if (instances.has(moduleSpecifier)) {
    return instances.get(moduleSpecifier);
  }

  const moduleRecord = moduleRecords.get(moduleSpecifier);
  if (moduleRecord == null) {
    throw new ReferenceError(`Missing link to module ${moduleSpecifier}`);
  }

  // The module compartment record graph can refer through an alias to a record
  // from a different compartment.
  // We need to evaluate this module in the context of its own global object.
  const { globalObject } = compartmentPrivateFields.get(
    moduleRecord.compartment,
  );

  const importedInstances = new Map();
  const moduleInstance = makeModuleInstance(
    moduleRecord,
    importedInstances,
    globalObject,
  );

  // Memoize.
  instances.set(moduleRecord.moduleSpecifier, moduleInstance);

  // Link dependency modules.
  for (const [importSpecifier, resolvedSpecifier] of entries(
    moduleRecord.resolvedImports,
  )) {
    const importedInstance = link(
      moduleRecord.compartment,
      compartmentPrivateFields,
      resolvedSpecifier,
    );
    importedInstances.set(importSpecifier, importedInstance);
  }

  return moduleInstance;
};

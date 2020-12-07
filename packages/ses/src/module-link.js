// For brevity, in this file, as in module-load.js, the term "moduleRecord"
// without qualification means "module compartment record".
// This is a super-set of the "static module record", that is reusable between
// compartments with different hooks.
// The "module compartment record" captures the compartment and overlays the
// module's "imports" with the more specific "resolvedImports" as inferred from
// the particular compartment's "resolveHook".

import { makeModuleInstance } from './module-instance.js';
import { getDeferredExports } from './module-proxy.js';
import { entries, freeze } from './commons.js';

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
  moduleAnalyses,
  moduleAliases,
  compartment,
  moduleSpecifier,
) => {
  const { moduleRecords } = compartmentPrivateFields.get(compartment);

  const moduleRecord = moduleRecords.get(moduleSpecifier);
  if (moduleRecord === undefined) {
    throw new ReferenceError(`Missing link to module ${q(moduleSpecifier)}`);
  }

  // Mutual recursion so there's no confusion about which
  // compartment is in context: the module record may be in another
  // compartment, denoted by moduleRecord.compartment.
  // eslint-disable-next-line no-use-before-define
  return instantiate(
    compartmentPrivateFields,
    moduleAnalyses,
    moduleAliases,
    moduleRecord,
  );
};

const validateStaticModuleRecord = (staticModuleRecord, moduleAnalyses) => {
  const isObject = typeof staticModuleRecord === 'object';
  if (!isObject) {
    throw new TypeError(
      `importHook must return a StaticModuleRecord, got ${staticModuleRecord}`,
    );
  }

  const hasAnalysis = moduleAnalyses.has(staticModuleRecord);
  const hasImports = Array.isArray(staticModuleRecord.imports);
  const hasExports = typeof staticModuleRecord.execute === 'function';

  if (!hasAnalysis && !hasExports) {
    if (hasImports) {
      // In this case, the static module record has an `imports` property, but
      // no `execute` method.
      // This could either be a partially implemented custom static module
      // record or created by `StaticModuleRecord` in another realm.
      throw new TypeError(
        'importHook must return a StaticModuleRecord constructed within the same Realm, or a custom record with both imports and an execute method',
      );
    } else {
      // In this case, the static module record has no `imports` or `execute`
      // property, so it could not have been created by the
      // `StaticModuleRecord` from any realm.
      // From this we infer the intent was to produce a valid custom static
      // module record and clue accordingly.
      throw new TypeError(
        'importHook must return a StaticModuleRecord with both imports and an execute method',
      );
    }
  }
};

export const instantiate = (
  compartmentPrivateFields,
  moduleAnalyses,
  moduleAliases,
  moduleRecord,
) => {
  const {
    compartment,
    moduleSpecifier,
    resolvedImports,
    staticModuleRecord,
  } = moduleRecord;
  const { globalObject, instances } = compartmentPrivateFields.get(compartment);

  // Memoize.
  if (instances.has(moduleSpecifier)) {
    return instances.get(moduleSpecifier);
  }

  validateStaticModuleRecord(staticModuleRecord, moduleAnalyses);

  const importedInstances = new Map();
  let moduleInstance;
  const moduleAnalysis = moduleAnalyses.get(staticModuleRecord);
  if (moduleAnalysis !== undefined) {
    moduleInstance = makeModuleInstance(
      compartmentPrivateFields,
      moduleAnalysis,
      moduleAliases,
      moduleRecord,
      importedInstances,
      globalObject,
    );
  } else {
    const { exportsProxy, proxiedExports, activate } = getDeferredExports(
      compartment,
      compartmentPrivateFields.get(compartment),
      moduleAliases,
      moduleSpecifier,
    );
    let activated = false;
    moduleInstance = freeze({
      exportsProxy,
      execute() {
        if (!activated) {
          activate();
          activated = true;
          staticModuleRecord.execute(
            proxiedExports,
            compartment,
            resolvedImports,
          );
        }
      },
    });
  }

  // Memoize.
  instances.set(moduleSpecifier, moduleInstance);

  // Link dependency modules.
  for (const [importSpecifier, resolvedSpecifier] of entries(resolvedImports)) {
    const importedInstance = link(
      compartmentPrivateFields,
      moduleAnalyses,
      moduleAliases,
      compartment,
      resolvedSpecifier,
    );
    importedInstances.set(importSpecifier, importedInstance);
  }

  return moduleInstance;
};

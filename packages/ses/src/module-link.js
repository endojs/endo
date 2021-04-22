/* eslint no-underscore-dangle: ["off"] */

// For brevity, in this file, as in module-load.js, the term "moduleRecord"
// without qualification means "module compartment record".
// This is a super-set of the "static module record", that is reusable between
// compartments with different hooks.
// The "module compartment record" captures the compartment and overlays the
// module's "imports" with the more specific "resolvedImports" as inferred from
// the particular compartment's "resolveHook".

import { assert } from './error/assert.js';
import {
  makeModuleInstance,
  makeThirdPartyModuleInstance,
} from './module-instance.js';
import { entries, isArray } from './commons.js';

const { quote: q } = assert;

function isObject(o) {
  return Object(o) === o;
}

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
  if (moduleRecord === undefined) {
    throw new ReferenceError(`Missing link to module ${q(moduleSpecifier)}`);
  }

  // Mutual recursion so there's no confusion about which
  // compartment is in context: the module record may be in another
  // compartment, denoted by moduleRecord.compartment.
  // eslint-disable-next-line no-use-before-define
  return instantiate(compartmentPrivateFields, moduleAliases, moduleRecord);
};

function isPrecompiled(staticModuleRecord) {
  return typeof staticModuleRecord.__syncModuleProgram__ === 'string';
}

function validatePrecompiledStaticModuleRecord(staticModuleRecord) {
  const { __fixedExportMap__, __liveExportMap__ } = staticModuleRecord;
  assert(
    isObject(__fixedExportMap__),
    `Property '__fixedExportMap__' of a precompiled module record must be an object, got ${q(
      __fixedExportMap__,
    )}`,
  );
  assert(
    isObject(__liveExportMap__),
    `Property '__liveExportMap__' of a precompiled module record must be an object, got ${q(
      __liveExportMap__,
    )}`,
  );
}

function isThirdParty(staticModuleRecord) {
  return typeof staticModuleRecord.execute === 'function';
}

function validateThirdPartyStaticModuleRecord(staticModuleRecord) {
  const { exports } = staticModuleRecord;
  assert(
    isArray(exports),
    `Property 'exports' of a third-party static module record must be an array, got ${q(
      exports,
    )}`,
  );
}

function validateStaticModuleRecord(staticModuleRecord) {
  assert(
    isObject(staticModuleRecord),
    `Static module records must be of type object, got ${q(
      staticModuleRecord,
    )}`,
  );
  const { imports, exports, reexports = [] } = staticModuleRecord;
  assert(
    isArray(imports),
    `Property 'imports' of a static module record must be an array, got ${q(
      imports,
    )}`,
  );
  assert(
    isArray(exports),
    `Property 'exports' of a precompiled module record must be an array, got ${q(
      reexports,
    )}`,
  );
  assert(
    isArray(reexports),
    `Property 'reexports' of a precompiled module record must be an array if present, got ${q(
      reexports,
    )}`,
  );
}

export const instantiate = (
  compartmentPrivateFields,
  moduleAliases,
  moduleRecord,
) => {
  const {
    compartment,
    moduleSpecifier,
    resolvedImports,
    staticModuleRecord,
  } = moduleRecord;
  const { instances } = compartmentPrivateFields.get(compartment);

  // Memoize.
  if (instances.has(moduleSpecifier)) {
    return instances.get(moduleSpecifier);
  }

  validateStaticModuleRecord(staticModuleRecord);

  const importedInstances = new Map();
  let moduleInstance;
  if (isPrecompiled(staticModuleRecord)) {
    validatePrecompiledStaticModuleRecord(staticModuleRecord);
    moduleInstance = makeModuleInstance(
      compartmentPrivateFields,
      moduleAliases,
      moduleRecord,
      importedInstances,
    );
  } else if (isThirdParty(staticModuleRecord)) {
    validateThirdPartyStaticModuleRecord(staticModuleRecord);
    moduleInstance = makeThirdPartyModuleInstance(
      compartmentPrivateFields,
      staticModuleRecord,
      compartment,
      moduleAliases,
      moduleSpecifier,
      resolvedImports,
    );
  } else {
    throw new Error(
      `importHook must return a static module record, got ${q(
        staticModuleRecord,
      )}`,
    );
  }

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

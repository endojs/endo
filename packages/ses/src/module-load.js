// For brevity, in this file, as in module-link.js, the term "moduleRecord"
// without qualification means "module compartment record".
// This is a super-set of the "static module record", that is reusable between
// compartments with different hooks.
// The "module compartment record" captures the compartment and overlays the
// module's "imports" with the more specific "resolvedImports" as inferred from
// the particular compartment's "resolveHook".

import {
  ReferenceError,
  TypeError,
  Map,
  Set,
  arrayJoin,
  arrayMap,
  arrayPush,
  create,
  freeze,
  mapGet,
  mapHas,
  mapSet,
  setAdd,
  promiseCatch,
  promiseThen,
  values,
  weakmapGet,
} from './commons.js';
import { assert } from './error/assert.js';

const { details: d, quote: q } = assert;

const noop = () => {};

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

const loadRecord = async (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  staticModuleRecord,
  pendingJobs,
  moduleLoads,
  errors,
  importMeta,
) => {
  const { resolveHook, moduleRecords } = weakmapGet(
    compartmentPrivateFields,
    compartment,
  );

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
    importMeta,
  });

  // Enqueue jobs to load this module's shallow dependencies.
  for (const fullSpecifier of values(resolvedImports)) {
    // Behold: recursion.
    // eslint-disable-next-line no-use-before-define
    const dependencyLoaded = memoizedLoadWithErrorAnnotation(
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      fullSpecifier,
      pendingJobs,
      moduleLoads,
      errors,
    );
    setAdd(
      pendingJobs,
      promiseThen(dependencyLoaded, noop, error => {
        arrayPush(errors, error);
      }),
    );
  }

  // Memoize.
  mapSet(moduleRecords, moduleSpecifier, moduleRecord);
  return moduleRecord;
};

const loadWithoutErrorAnnotation = async (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  pendingJobs,
  moduleLoads,
  errors,
) => {
  const { importHook, moduleMap, moduleMapHook, moduleRecords } = weakmapGet(
    compartmentPrivateFields,
    compartment,
  );

  // Follow moduleMap, or moduleMapHook if present.
  let aliasNamespace = moduleMap[moduleSpecifier];
  if (aliasNamespace === undefined && moduleMapHook !== undefined) {
    aliasNamespace = moduleMapHook(moduleSpecifier);
  }
  if (typeof aliasNamespace === 'string') {
    // eslint-disable-next-line @endo/no-polymorphic-call
    assert.fail(
      d`Cannot map module ${q(moduleSpecifier)} to ${q(
        aliasNamespace,
      )} in parent compartment, not yet implemented`,
      TypeError,
    );
  } else if (aliasNamespace !== undefined) {
    const alias = weakmapGet(moduleAliases, aliasNamespace);
    if (alias === undefined) {
      // eslint-disable-next-line @endo/no-polymorphic-call
      assert.fail(
        d`Cannot map module ${q(
          moduleSpecifier,
        )} because the value is not a module exports namespace, or is from another realm`,
        ReferenceError,
      );
    }
    // Behold: recursion.
    // eslint-disable-next-line no-use-before-define
    const aliasRecord = await memoizedLoadWithErrorAnnotation(
      compartmentPrivateFields,
      moduleAliases,
      alias.compartment,
      alias.specifier,
      pendingJobs,
      moduleLoads,
      errors,
    );
    mapSet(moduleRecords, moduleSpecifier, aliasRecord);
    return aliasRecord;
  }

  if (mapHas(moduleRecords, moduleSpecifier)) {
    return mapGet(moduleRecords, moduleSpecifier);
  }

  const staticModuleRecord = await importHook(moduleSpecifier);

  if (staticModuleRecord === null || typeof staticModuleRecord !== 'object') {
    // eslint-disable-next-line @endo/no-polymorphic-call
    assert.fail(
      d`importHook must return a promise for an object, for module ${q(
        moduleSpecifier,
      )} in compartment ${q(compartment.name)}`,
    );
  }

  if (staticModuleRecord.record !== undefined) {
    const {
      compartment: aliasCompartment = compartment,
      specifier: aliasSpecifier = moduleSpecifier,
      record: aliasModuleRecord,
      importMeta,
    } = staticModuleRecord;

    const aliasRecord = await loadRecord(
      compartmentPrivateFields,
      moduleAliases,
      aliasCompartment,
      aliasSpecifier,
      aliasModuleRecord,
      pendingJobs,
      moduleLoads,
      errors,
      importMeta,
    );
    mapSet(moduleRecords, moduleSpecifier, aliasRecord);
    return aliasRecord;
  }

  return loadRecord(
    compartmentPrivateFields,
    moduleAliases,
    compartment,
    moduleSpecifier,
    staticModuleRecord,
    pendingJobs,
    moduleLoads,
    errors,
  );
};

const memoizedLoadWithErrorAnnotation = async (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  pendingJobs,
  moduleLoads,
  errors,
) => {
  const { name: compartmentName } = weakmapGet(
    compartmentPrivateFields,
    compartment,
  );

  // Prevent data-lock from recursion into branches visited in dependent loads.
  let compartmentLoading = mapGet(moduleLoads, compartment);
  if (compartmentLoading === undefined) {
    compartmentLoading = new Map();
    mapSet(moduleLoads, compartment, compartmentLoading);
  }
  let moduleLoading = mapGet(compartmentLoading, moduleSpecifier);
  if (moduleLoading !== undefined) {
    return moduleLoading;
  }

  moduleLoading = promiseCatch(
    loadWithoutErrorAnnotation(
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      moduleSpecifier,
      pendingJobs,
      moduleLoads,
      errors,
    ),
    error => {
      // eslint-disable-next-line @endo/no-polymorphic-call
      assert.note(
        error,
        d`${error.message}, loading ${q(moduleSpecifier)} in compartment ${q(
          compartmentName,
        )}`,
      );
      throw error;
    },
  );

  mapSet(compartmentLoading, moduleSpecifier, moduleLoading);

  return moduleLoading;
};

/*
 * `load` asynchronously gathers the `StaticModuleRecord`s for a module and its
 * transitive dependencies.
 * The module records refer to each other by a reference to the dependency's
 * compartment and the specifier of the module within its own compartment.
 * This graph is then ready to be synchronously linked and executed.
 */
export const load = async (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
) => {
  const { name: compartmentName } = weakmapGet(
    compartmentPrivateFields,
    compartment,
  );

  /** @type {Set<Promise<undefined>>} */
  const pendingJobs = new Set();
  /** @type {Map<Object, Map<string, Promise<Record>>} */
  const moduleLoads = new Map();
  /** @type {Array<Error>} */
  const errors = [];

  const dependencyLoaded = memoizedLoadWithErrorAnnotation(
    compartmentPrivateFields,
    moduleAliases,
    compartment,
    moduleSpecifier,
    pendingJobs,
    moduleLoads,
    errors,
  );
  setAdd(
    pendingJobs,
    promiseThen(dependencyLoaded, noop, error => {
      arrayPush(errors, error);
    }),
  );

  // Drain pending jobs queue.
  // Each job is a promise for undefined, regardless of success or failure.
  // Before we add a job to the queue, we catch any error and push it into the
  // `errors` accumulator.
  for (const job of pendingJobs) {
    // eslint-disable-next-line no-await-in-loop
    await job;
  }

  // Throw an aggregate error if there were any errors.
  if (errors.length > 0) {
    throw new TypeError(
      `Failed to load module ${q(moduleSpecifier)} in package ${q(
        compartmentName,
      )} (${errors.length} underlying failures: ${arrayJoin(
        arrayMap(errors, error => error.message),
        ', ',
      )}`,
    );
  }
};

// For brevity, in this file, as in module-link.js, the term "moduleRecord"
// without qualification means "module compartment record".
// This is a super-set of the "static module record", that is reusable between
// compartments with different hooks.
// The "module compartment record" captures the compartment and overlays the
// module's "imports" with the more specific "resolvedImports" as inferred from
// the particular compartment's "resolveHook".

import { getEnvironmentOption as getenv } from '@endo/env-options';
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
  promiseThen,
  values,
  weakmapGet,
  generatorNext,
  generatorThrow,
} from './commons.js';
import { assert } from './error/assert.js';

const { Fail, details: X, quote: q, note: annotateError } = assert;

const noop = () => {};

async function asyncTrampoline(generatorFunc, args, errorWrapper) {
  await null;
  const iterator = generatorFunc(...args);
  let result = generatorNext(iterator);
  while (!result.done) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const val = await result.value;
      result = generatorNext(iterator, val);
    } catch (error) {
      result = generatorThrow(iterator, errorWrapper(error));
    }
  }
  return result.value;
}

function syncTrampoline(generatorFunc, args) {
  const iterator = generatorFunc(...args);
  let result = generatorNext(iterator);
  while (!result.done) {
    try {
      result = generatorNext(iterator, result.value);
    } catch (error) {
      result = generatorThrow(iterator, error);
    }
  }
  return result.value;
}
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

const loadRecord = (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  staticModuleRecord,
  enqueueJob,
  selectImplementation,
  moduleLoads,
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
    enqueueJob(memoizedLoadWithErrorAnnotation, [
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      fullSpecifier,
      enqueueJob,
      selectImplementation,
      moduleLoads,
    ]);
  }

  // Memoize.
  mapSet(moduleRecords, moduleSpecifier, moduleRecord);
  return moduleRecord;
};

function* loadWithoutErrorAnnotation(
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  enqueueJob,
  selectImplementation,
  moduleLoads,
) {
  const { importHook, importNowHook, moduleMap, moduleMapHook, moduleRecords } =
    weakmapGet(compartmentPrivateFields, compartment);

  // Follow moduleMap, or moduleMapHook if present.
  let aliasNamespace = moduleMap[moduleSpecifier];
  if (aliasNamespace === undefined && moduleMapHook !== undefined) {
    aliasNamespace = moduleMapHook(moduleSpecifier);
  }
  if (typeof aliasNamespace === 'string') {
    // eslint-disable-next-line @endo/no-polymorphic-call
    assert.fail(
      X`Cannot map module ${q(moduleSpecifier)} to ${q(
        aliasNamespace,
      )} in parent compartment, not yet implemented`,
      TypeError,
    );
  } else if (aliasNamespace !== undefined) {
    const alias = weakmapGet(moduleAliases, aliasNamespace);
    if (alias === undefined) {
      // eslint-disable-next-line @endo/no-polymorphic-call
      assert.fail(
        X`Cannot map module ${q(
          moduleSpecifier,
        )} because the value is not a module exports namespace, or is from another realm`,
        ReferenceError,
      );
    }
    // Behold: recursion.
    // eslint-disable-next-line no-use-before-define
    const aliasRecord = yield memoizedLoadWithErrorAnnotation(
      compartmentPrivateFields,
      moduleAliases,
      alias.compartment,
      alias.specifier,
      enqueueJob,
      selectImplementation,
      moduleLoads,
    );
    mapSet(moduleRecords, moduleSpecifier, aliasRecord);
    return aliasRecord;
  }

  if (mapHas(moduleRecords, moduleSpecifier)) {
    return mapGet(moduleRecords, moduleSpecifier);
  }

  const staticModuleRecord = yield selectImplementation(
    importHook,
    importNowHook,
  )(moduleSpecifier);

  if (staticModuleRecord === null || typeof staticModuleRecord !== 'object') {
    Fail`importHook must return a promise for an object, for module ${q(
      moduleSpecifier,
    )} in compartment ${q(compartment.name)}`;
  }

  // check if record is a RedirectStaticModuleInterface
  if (staticModuleRecord.specifier !== undefined) {
    // check if this redirect with an explicit record
    if (staticModuleRecord.record !== undefined) {
      // ensure expected record shape
      if (staticModuleRecord.compartment !== undefined) {
        throw TypeError(
          'Cannot redirect to an explicit record with a specified compartment',
        );
      }
      const {
        compartment: aliasCompartment = compartment,
        specifier: aliasSpecifier = moduleSpecifier,
        record: aliasModuleRecord,
        importMeta,
      } = staticModuleRecord;

      const aliasRecord = loadRecord(
        compartmentPrivateFields,
        moduleAliases,
        aliasCompartment,
        aliasSpecifier,
        aliasModuleRecord,
        enqueueJob,
        selectImplementation,
        moduleLoads,
        importMeta,
      );
      mapSet(moduleRecords, moduleSpecifier, aliasRecord);
      return aliasRecord;
    }

    // check if this redirect with an explicit compartment
    if (staticModuleRecord.compartment !== undefined) {
      // ensure expected record shape
      if (staticModuleRecord.importMeta !== undefined) {
        throw TypeError(
          'Cannot redirect to an implicit record with a specified importMeta',
        );
      }
      // Behold: recursion.
      // eslint-disable-next-line no-use-before-define
      const aliasRecord = yield memoizedLoadWithErrorAnnotation(
        compartmentPrivateFields,
        moduleAliases,
        staticModuleRecord.compartment,
        staticModuleRecord.specifier,
        enqueueJob,
        selectImplementation,
        moduleLoads,
      );
      mapSet(moduleRecords, moduleSpecifier, aliasRecord);
      return aliasRecord;
    }

    throw TypeError('Unnexpected RedirectStaticModuleInterface record shape');
  }

  return loadRecord(
    compartmentPrivateFields,
    moduleAliases,
    compartment,
    moduleSpecifier,
    staticModuleRecord,
    enqueueJob,
    selectImplementation,
    moduleLoads,
  );
}

const memoizedLoadWithErrorAnnotation = (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  enqueueJob,
  selectImplementation,
  moduleLoads,
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

  moduleLoading = selectImplementation(asyncTrampoline, syncTrampoline)(
    loadWithoutErrorAnnotation,
    [
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      moduleSpecifier,
      enqueueJob,
      selectImplementation,
      moduleLoads,
    ],
    error => {
      // eslint-disable-next-line @endo/no-polymorphic-call
      annotateError(
        error,
        X`${error.message}, loading ${q(moduleSpecifier)} in compartment ${q(
          compartmentName,
        )}`,
      );
      throw error;
    },
  );

  mapSet(compartmentLoading, moduleSpecifier, moduleLoading);

  return moduleLoading;
};

function asyncJobQueue() {
  /** @type {Set<Promise<undefined>>} */
  const pendingJobs = new Set();
  /** @type {Array<Error>} */
  const errors = [];

  /**
   * Enqueues a job that starts immediately but won't be awaited until drainQueue is called.
   *
   * @template {any[]} T
   * @param {(...args: T)=>Promise<*>} func
   * @param {T} args
   */
  const enqueueJob = (func, args) => {
    setAdd(
      pendingJobs,
      promiseThen(func(...args), noop, error => {
        arrayPush(errors, error);
      }),
    );
  };
  /**
   * Sequentially awaits pending jobs and returns an array of errors
   *
   * @returns {Promise<Array<Error>>}
   */
  const drainQueue = async () => {
    await null;
    for (const job of pendingJobs) {
      // eslint-disable-next-line no-await-in-loop
      await job;
    }
    return errors;
  };
  return { enqueueJob, drainQueue };
}

/**
 * @param {object} options
 * @param {Array<Error>} options.errors
 * @param {string} options.errorPrefix
 */
function throwAggregateError({ errors, errorPrefix }) {
  // Throw an aggregate error if there were any errors.
  if (errors.length > 0) {
    const verbose =
      getenv('COMPARTMENT_LOAD_ERRORS', '', ['verbose']) === 'verbose';
    throw TypeError(
      `${errorPrefix} (${errors.length} underlying failures: ${arrayJoin(
        arrayMap(errors, error => error.message + (verbose ? error.stack : '')),
        ', ',
      )}`,
    );
  }
}

const preferSync = (_asyncImpl, syncImpl) => syncImpl;
const preferAsync = (asyncImpl, _syncImpl) => asyncImpl;

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

  /** @type {Map<object, Map<string, Promise<Record<any, any>>>>} */
  const moduleLoads = new Map();

  const { enqueueJob, drainQueue } = asyncJobQueue();

  enqueueJob(memoizedLoadWithErrorAnnotation, [
    compartmentPrivateFields,
    moduleAliases,
    compartment,
    moduleSpecifier,
    enqueueJob,
    preferAsync,
    moduleLoads,
  ]);

  // Drain pending jobs queue and throw an aggregate error
  const errors = await drainQueue();

  throwAggregateError({
    errors,
    errorPrefix: `Failed to load module ${q(moduleSpecifier)} in package ${q(
      compartmentName,
    )}`,
  });
};

/*
 * `loadNow` synchronously gathers the `StaticModuleRecord`s for a module and its
 * transitive dependencies.
 * The module records refer to each other by a reference to the dependency's
 * compartment and the specifier of the module within its own compartment.
 * This graph is then ready to be synchronously linked and executed.
 */
export const loadNow = (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
) => {
  const { name: compartmentName } = weakmapGet(
    compartmentPrivateFields,
    compartment,
  );

  /** @type {Map<object, Map<string, Promise<Record<any, any>>>>} */
  const moduleLoads = new Map();

  /** @type {Array<Error>} */
  const errors = [];

  const enqueueJob = (func, args) => {
    try {
      func(...args);
    } catch (error) {
      arrayPush(errors, error);
    }
  };

  enqueueJob(memoizedLoadWithErrorAnnotation, [
    compartmentPrivateFields,
    moduleAliases,
    compartment,
    moduleSpecifier,
    enqueueJob,
    preferSync,
    moduleLoads,
  ]);

  throwAggregateError({
    errors,
    errorPrefix: `Failed to load module ${q(moduleSpecifier)} in package ${q(
      compartmentName,
    )}`,
  });
};

import { getEnvironmentOption as getenv } from '@endo/env-options';
import {
  Map,
  Set,
  TypeError,
  arrayJoin,
  arrayMap,
  arrayPush,
  arraySome,
  create,
  freeze,
  generatorNext,
  generatorThrow,
  getOwnPropertyNames,
  isArray,
  isPrimitive,
  mapGet,
  mapHas,
  mapSet,
  promiseThen,
  setAdd,
  values,
  weakmapGet,
  weakmapHas,
} from './commons.js';
import { makeError, annotateError, q, b, X } from './error/assert.js';

const noop = () => {};

const asyncTrampoline = async (generatorFunc, args, errorWrapper) => {
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
};

const syncTrampoline = (generatorFunc, args) => {
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
};

// `makeAlias` constructs compartment specifier tuples for the `aliases`
// private field of compartments.
// These aliases allow a compartment to alias an internal module specifier to a
// module specifier in an external compartment, and also to create internal
// aliases.
// Both are facilitated by the moduleMap Compartment constructor option.
export const makeAlias = (compartment, specifier) =>
  freeze({ compartment, specifier });

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

const loadModuleSource = (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  moduleSource,
  enqueueJob,
  selectImplementation,
  moduleLoads,
  importMeta,
) => {
  const { resolveHook, name: compartmentName } = weakmapGet(
    compartmentPrivateFields,
    compartment,
  );

  const { imports } = moduleSource;
  if (
    !isArray(imports) ||
    arraySome(imports, specifier => typeof specifier !== 'string')
  ) {
    throw makeError(
      X`Invalid module source: 'imports' must be an array of strings, got ${imports} for module ${q(moduleSpecifier)} of compartment ${q(compartmentName)}`,
    );
  }

  // resolve all imports relative to this referrer module.
  const resolvedImports = resolveAll(imports, resolveHook, moduleSpecifier);
  const moduleRecord = freeze({
    compartment,
    moduleSource,
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
  const {
    importHook,
    importNowHook,
    moduleMap,
    moduleMapHook,
    moduleRecords,
    parentCompartment,
  } = weakmapGet(compartmentPrivateFields, compartment);

  if (mapHas(moduleRecords, moduleSpecifier)) {
    return mapGet(moduleRecords, moduleSpecifier);
  }

  // Follow moduleMap, or moduleMapHook if present.
  let moduleDescriptor = moduleMap[moduleSpecifier];
  if (moduleDescriptor === undefined && moduleMapHook !== undefined) {
    moduleDescriptor = moduleMapHook(moduleSpecifier);
  }
  if (moduleDescriptor === undefined) {
    const moduleHook = selectImplementation(importHook, importNowHook);
    if (moduleHook === undefined) {
      const moduleHookName = selectImplementation(
        'importHook',
        'importNowHook',
      );
      throw makeError(
        X`${b(moduleHookName)} needed to load module ${q(
          moduleSpecifier,
        )} in compartment ${q(compartment.name)}`,
      );
    }
    moduleDescriptor = moduleHook(moduleSpecifier);
    // Uninitialized module namespaces throw if we attempt to coerce them into
    // promises.
    if (!weakmapHas(moduleAliases, moduleDescriptor)) {
      moduleDescriptor = yield moduleDescriptor;
    }
  }

  if (typeof moduleDescriptor === 'string') {
    // eslint-disable-next-line @endo/no-polymorphic-call
    throw makeError(
      X`Cannot map module ${q(moduleSpecifier)} to ${q(
        moduleDescriptor,
      )} in parent compartment, use {source} module descriptor`,
      TypeError,
    );
  } else if (!isPrimitive(moduleDescriptor)) {
    // In this shim (and not in XS, and not in the standard we imagine), we
    // allow a module namespace object to stand in for a module descriptor that
    // describes its original {compartment, specifier} so that it can be used
    // to create a link.
    let aliasDescriptor = weakmapGet(moduleAliases, moduleDescriptor);
    if (aliasDescriptor !== undefined) {
      moduleDescriptor = aliasDescriptor;
    }

    if (moduleDescriptor.namespace !== undefined) {
      // { namespace: string, compartment?: Compartment }
      // Namespace module descriptors link to a module instance.

      if (typeof moduleDescriptor.namespace === 'string') {
        // The default compartment is the *parent*, not this child compartment.
        // This is a difference from the legacy {specifier, compartment} module
        // descriptor.
        const {
          compartment: aliasCompartment = parentCompartment,
          namespace: aliasSpecifier,
        } = moduleDescriptor;
        if (
          isPrimitive(aliasCompartment) ||
          !weakmapHas(compartmentPrivateFields, aliasCompartment)
        ) {
          throw makeError(
            X`Invalid compartment in module descriptor for specifier ${q(moduleSpecifier)} in compartment ${q(compartment.name)}`,
          );
        }
        // Behold: recursion.
        // eslint-disable-next-line no-use-before-define
        const aliasRecord = yield memoizedLoadWithErrorAnnotation(
          compartmentPrivateFields,
          moduleAliases,
          aliasCompartment,
          aliasSpecifier,
          enqueueJob,
          selectImplementation,
          moduleLoads,
        );
        mapSet(moduleRecords, moduleSpecifier, aliasRecord);
        return aliasRecord;
      }

      // All remaining objects must either be a module namespace, or be
      // promoted into a module namespace with a virtual module source.
      if (!isPrimitive(moduleDescriptor.namespace)) {
        const { namespace } = moduleDescriptor;
        // Brand-check SES shim module exports namespaces:
        aliasDescriptor = weakmapGet(moduleAliases, namespace);
        if (aliasDescriptor !== undefined) {
          moduleDescriptor = aliasDescriptor;
          // Fall through to processing the resulting {compartment, specifier}
          // alias.
        } else {
          // Promote an arbitrary object to a module namespace with a virtual
          // module source.
          // { namespace: Object }
          const exports = getOwnPropertyNames(namespace);
          /** @type {import('../types.js').VirtualModuleSource} */
          const moduleSource = {
            imports: [],
            exports,
            execute(env) {
              for (const name of exports) {
                env[name] = namespace[name];
              }
            },
          };
          const importMeta = undefined;
          const moduleRecord = loadModuleSource(
            compartmentPrivateFields,
            moduleAliases,
            compartment,
            moduleSpecifier,
            moduleSource,
            enqueueJob,
            selectImplementation,
            moduleLoads,
            importMeta,
          );
          mapSet(moduleRecords, moduleSpecifier, moduleRecord);
          return moduleRecord;
        }
      } else {
        throw makeError(
          X`Invalid compartment in module descriptor for specifier ${q(moduleSpecifier)} in compartment ${q(compartment.name)}`,
        );
      }
    }

    if (moduleDescriptor.source !== undefined) {
      // Module source descriptors create an instance from a module source.
      // The descriptor may contain the module source, or refer to a source
      // loaded in a particular compartment.

      if (typeof moduleDescriptor.source === 'string') {
        // { source: string, importMeta?, specifier?: string, compartment? }
        // A string source is the specifier for a different module source.
        // That source may come from this compartment's parent (default), or
        // from a specified compartment, and the specified compartment may be
        // this compartment to make a duplicate.

        const {
          source: loaderSpecifier,
          specifier: instanceSpecifier = moduleSpecifier,
          compartment: loaderCompartment = parentCompartment,
          importMeta = undefined,
        } = moduleDescriptor;

        // Induce the compartment, possibly a different compartment
        // to load a module source.

        // Behold: recursion.
        // eslint-disable-next-line no-use-before-define
        const loaderRecord = yield memoizedLoadWithErrorAnnotation(
          compartmentPrivateFields,
          moduleAliases,
          loaderCompartment,
          loaderSpecifier,
          enqueueJob,
          selectImplementation,
          moduleLoads,
        );

        // Extract the source of the module from the loader compartment's
        // record.
        const { moduleSource } = loaderRecord;

        // Instantiate that source in our own compartment, possibly with a
        // different specifier for resolving its own imports.
        const moduleRecord = loadModuleSource(
          compartmentPrivateFields,
          moduleAliases,
          compartment,
          instanceSpecifier,
          moduleSource,
          enqueueJob,
          selectImplementation,
          moduleLoads,
          importMeta,
        );
        mapSet(moduleRecords, moduleSpecifier, moduleRecord);
        return moduleRecord;
      } else {
        // { source: ModuleSource, importMeta?, specifier?: string }
        // We assume all non-string module sources are any of the supported
        // kinds of module source: PrecompiledModuleSource,
        // VirtualModuleSource, or a native ModuleSource.

        const {
          source: moduleSource,
          specifier: aliasSpecifier = moduleSpecifier,
          importMeta,
        } = moduleDescriptor;

        const aliasRecord = loadModuleSource(
          compartmentPrivateFields,
          moduleAliases,
          compartment,
          aliasSpecifier,
          moduleSource,
          enqueueJob,
          selectImplementation,
          moduleLoads,
          importMeta,
        );
        mapSet(moduleRecords, moduleSpecifier, aliasRecord);
        return aliasRecord;
      }
    }

    if (moduleDescriptor.archive !== undefined) {
      // { archive: Archive, path: string }
      // We do not support this XS-native module descriptor.
      throw makeError(
        X`Unsupported archive module descriptor for specifier ${q(moduleSpecifier)} in compartment ${q(compartment.name)}`,
      );
    }

    // { record, specifier?, compartment?, importMeta? }
    // A (legacy) module descriptor for when we find the module source (record)
    // but at a different specifier than requested.
    // Providing this {specifier, record} descriptor serves as an ergonomic
    // short-hand for stashing the record, returning a {compartment, specifier}
    // reference, bouncing the module hook, then producing the source (record)
    // when module hook receives the response specifier.
    if (moduleDescriptor.record !== undefined) {
      const {
        compartment: aliasCompartment = compartment,
        specifier: aliasSpecifier = moduleSpecifier,
        record: moduleSource,
        importMeta,
      } = moduleDescriptor;

      const aliasRecord = loadModuleSource(
        compartmentPrivateFields,
        moduleAliases,
        aliasCompartment,
        aliasSpecifier,
        moduleSource,
        enqueueJob,
        selectImplementation,
        moduleLoads,
        importMeta,
      );
      mapSet(moduleRecords, moduleSpecifier, aliasRecord);
      mapSet(moduleRecords, aliasSpecifier, aliasRecord);
      return aliasRecord;
    }

    // { specifier: string, compartment: Compartment }
    // A (legacy) module descriptor that describes a link to a module instance
    // in a specified compartment.
    if (
      moduleDescriptor.compartment !== undefined &&
      moduleDescriptor.specifier !== undefined
    ) {
      if (
        isPrimitive(moduleDescriptor.compartment) ||
        !weakmapHas(compartmentPrivateFields, moduleDescriptor.compartment) ||
        typeof moduleDescriptor.specifier !== 'string'
      ) {
        throw makeError(
          X`Invalid compartment in module descriptor for specifier ${q(moduleSpecifier)} in compartment ${q(compartment.name)}`,
        );
      }
      // Behold: recursion.
      // eslint-disable-next-line no-use-before-define
      const aliasRecord = yield memoizedLoadWithErrorAnnotation(
        compartmentPrivateFields,
        moduleAliases,
        moduleDescriptor.compartment,
        moduleDescriptor.specifier,
        enqueueJob,
        selectImplementation,
        moduleLoads,
      );
      mapSet(moduleRecords, moduleSpecifier, aliasRecord);
      return aliasRecord;
    }

    // A (legacy) behavior: If we do not recognize the module descriptor as a
    // module descriptor, we assume that it is a module source (record):
    const moduleSource = moduleDescriptor;
    const moduleRecord = loadModuleSource(
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      moduleSpecifier,
      moduleSource,
      enqueueJob,
      selectImplementation,
      moduleLoads,
    );
    // Memoize.
    mapSet(moduleRecords, moduleSpecifier, moduleRecord);
    return moduleRecord;
  } else {
    throw makeError(
      X`module descriptor must be a string or object for specifier ${q(
        moduleSpecifier,
      )} in compartment ${q(compartment.name)}`,
    );
  }
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

/**
 * If `aggregateErrors` is `false`, the `errors` property of the fulfilled object
 * will always be empty.
 * @param {{errors?: Error[], noAggregateErrors?: boolean}} [options]
 */
const asyncJobQueue = ({ errors = [], noAggregateErrors = false } = {}) => {
  /** @type {Set<Promise<undefined>>} */
  const pendingJobs = new Set();

  /**
   * Enqueues a job that starts immediately but won't be awaited until drainQueue is called.
   *
   * @template {(...args: any[]) => Promise<void>} F
   * @param {F} func - An async function to execute
   * @param {Parameters<F>} args - Arguments to pass to the function
   * @returns {void}
   */
  const enqueueJob = (func, args) => {
    setAdd(
      pendingJobs,
      promiseThen(func(...args), noop, error => {
        if (noAggregateErrors) {
          throw error;
        } else {
          arrayPush(errors, error);
        }
      }),
    );
  };
  /**
   * Sequentially awaits pending jobs and returns an array of errors
   */
  const drainQueue = async () => {
    await null;
    for (const job of pendingJobs) {
      // eslint-disable-next-line no-await-in-loop
      await job;
    }
  };
  return { enqueueJob, drainQueue, errors };
};

/**
 * If `aggregateErrors` is `false`, the `errors` property of the returned object
 * will always be empty.
 * @param {{errors?: Error[], noAggregateErrors?: boolean}} [options]
 */
const syncJobQueue = ({ errors = [], noAggregateErrors = false } = {}) => {
  let current = [];
  let next = [];

  /**
   * Enqueues a job
   *
   * @template {(...args: any[]) => void} F
   * @param {F} func - An async function to execute
   * @param {Parameters<F>} args - Arguments to pass to the function
   * @returns {void}
   */
  const enqueueJob = (func, args) => {
    arrayPush(next, [func, args]);
  };
  const drainQueue = () => {
    // Attention: load bearing flow order. Calling another enqueued function in the
    // synchronous usecase must happen after the one that enqueued it has finished.
    // Jobs enqueued in one pass do not interleave with jobs resulting from them.
    // It's necessary for efficient memoization and to break cycles.
    for (const [func, args] of current) {
      try {
        func(...args);
      } catch (error) {
        if (noAggregateErrors) {
          throw error;
        } else {
          arrayPush(errors, error);
        }
      }
    }
    current = next;
    next = [];
    if (current.length > 0) drainQueue();
  };
  return { enqueueJob, drainQueue, errors };
};

/**
 * @param {object} options
 * @param {Array<Error>} options.errors
 * @param {string} options.errorPrefix
 */
const throwAggregateError = ({ errors, errorPrefix }) => {
  // Throw an aggregate error if there were any errors.
  if (errors.length > 0) {
    const verbose =
      /** @type {'' | 'verbose'} */
      (getenv('COMPARTMENT_LOAD_ERRORS', '', ['verbose'])) === 'verbose';
    throw TypeError(
      `${errorPrefix} (${errors.length} underlying failures: ${arrayJoin(
        arrayMap(errors, error => error.message + (verbose ? error.stack : '')),
        ', ',
      )}`,
    );
  }
};

const preferSync = (_asyncImpl, syncImpl) => syncImpl;
const preferAsync = (asyncImpl, _syncImpl) => asyncImpl;

/**
 * `load` asynchronously gathers the module records for a module and its
 * transitive dependencies.
 * The module records refer to each other by a reference to the dependency's
 * compartment and the specifier of the module within its own compartment.
 * This graph is then ready to be synchronously linked and executed.
 * @param {WeakMap<Compartment, any>} compartmentPrivateFields
 * @param {WeakMap<object, object>} moduleAliases
 * @param {Compartment} compartment
 * @param {string} moduleSpecifier - The module specifier to load.
 * @param {{ noAggregateErrors?: boolean}} options
 */
export const load = async (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  { noAggregateErrors = false } = {},
) => {
  const { name: compartmentName } = weakmapGet(
    compartmentPrivateFields,
    compartment,
  );

  /** @type {Map<object, Map<string, Promise<Record<any, any>>>>} */
  const moduleLoads = new Map();

  const { enqueueJob, drainQueue, errors } = asyncJobQueue({
    noAggregateErrors,
  });

  enqueueJob(memoizedLoadWithErrorAnnotation, [
    compartmentPrivateFields,
    moduleAliases,
    compartment,
    moduleSpecifier,
    enqueueJob,
    preferAsync,
    moduleLoads,
  ]);

  await drainQueue();

  throwAggregateError({
    errors,
    errorPrefix: `Failed to load module ${q(moduleSpecifier)} in package ${q(
      compartmentName,
    )}`,
  });
};

/**
 * `loadNow` synchronously gathers the module records for a specified module
 * and its transitive dependencies.
 * The module records refer to each other by a reference to the dependency's
 * compartment and the specifier of the module within its own compartment.
 * This graph is then ready to be synchronously linked and executed.
 * @param {WeakMap<Compartment, any>} compartmentPrivateFields
 * @param {WeakMap<object, object>} moduleAliases
 * @param {Compartment} compartment
 * @param {string} moduleSpecifier - The module specifier to load.
 * @param {{ noAggregateErrors?: boolean}} options
 */

export const loadNow = (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  { noAggregateErrors = false } = {},
) => {
  const { name: compartmentName } = weakmapGet(
    compartmentPrivateFields,
    compartment,
  );

  /** @type {Map<object, Map<string, Promise<Record<any, any>>>>} */
  const moduleLoads = new Map();

  const { enqueueJob, drainQueue, errors } = syncJobQueue({
    noAggregateErrors,
  });

  enqueueJob(memoizedLoadWithErrorAnnotation, [
    compartmentPrivateFields,
    moduleAliases,
    compartment,
    moduleSpecifier,
    enqueueJob,
    preferSync,
    moduleLoads,
  ]);

  drainQueue();

  throwAggregateError({
    errors,
    errorPrefix: `Failed to load module ${q(moduleSpecifier)} in package ${q(
      compartmentName,
    )}`,
  });
};

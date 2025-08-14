/* Validates a compartment map against its schema. */

import { assertPackagePolicy } from './policy-format.js';

/**
 * @import {
 *  FileCompartmentDescriptor,
 *  FileCompartmentMapDescriptor,
 *  FileModuleDescriptorConfiguration,
 *  CompartmentMapDescriptor,
 *  EntryDescriptor,
 *  ModuleDescriptorConfiguration,
 *  ExitModuleDescriptorConfiguration,
 *  CompartmentModuleDescriptorConfiguration,
 *  CompartmentDescriptor,
 *  ScopeDescriptor,
 *  BaseModuleDescriptorConfiguration} from './types.js'
 */

// TODO convert to the new `||` assert style.
// Deferred because this file pervasively uses simple template strings rather than
// template strings tagged with `assert.details` (aka `X`), and uses
// this definition of `q` rather than `assert.quote`
const q = JSON.stringify;
const { keys, entries } = Object;
const { isArray } = Array;

/** @type {(a: string, b: string) => number} */
// eslint-disable-next-line no-nested-ternary
export const stringCompare = (a, b) => (a === b ? 0 : a < b ? -1 : 1);

/**
 * @template T
 * @param {Iterable<T>} iterable
 */
function* enumerate(iterable) {
  let index = 0;
  for (const value of iterable) {
    yield [index, value];
    index += 1;
  }
}

/**
 * Type guard for a string value.
 *
 * @overload
 * @param {unknown} value
 * @param {string} path
 * @param {string} url
 * @returns {asserts value is string}
 */

/**
 * Type guard for a string value with a custom assertion failure message.
 *
 * @overload
 * @param {unknown} value
 * @param {string} message
 * @returns {asserts value is string}
 */

/**
 * Type guard for a string value.
 *
 * @param {unknown} value
 * @param {string} pathOrMessage
 * @param {string} [url]
 * @returns {asserts value is string}
 */
const assertString = (value, pathOrMessage, url) => {
  if (url === undefined) {
    const message = pathOrMessage;
    assert.typeof(value, 'string', message);
  } else {
    const path = pathOrMessage;
    assert.typeof(
      value,
      'string',
      `${path} in ${q(url)} must be a string, got ${q(value)}`,
    );
  }
};

/**
 * @param {unknown} allegedObject
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedObject is Record<PropertyKey, unknown>}
 */
const assertPlainObject = (allegedObject, path, url) => {
  const object = Object(allegedObject);
  assert(
    object === allegedObject &&
      !isArray(object) &&
      !(typeof object === 'function'),
    `${path} must be an object, got ${q(allegedObject)} of type ${q(typeof allegedObject)} in ${q(url)}`,
  );
};

/**
 *
 * @param {unknown} value
 * @param {string} path
 * @param {string} url
 * @returns {asserts value is boolean}
 */
const assertBoolean = (value, path, url) => {
  assert.typeof(
    value,
    'boolean',
    `${path} in ${q(url)} must be a boolean, got ${q(value)}`,
  );
};

/**
 * @param {Record<string, unknown>} object
 * @param {string} message
 */
const assertEmptyObject = (object, message) => {
  assert(keys(object).length === 0, message);
};

/**
 * @param {unknown} conditions
 * @param {string} url
 * @returns {asserts conditions is CompartmentMapDescriptor['tags']}
 */
const assertConditions = (conditions, url) => {
  if (conditions === undefined) return;
  assert(
    isArray(conditions),
    `conditions must be an array, got ${conditions} in ${q(url)}`,
  );
  for (const [index, value] of enumerate(conditions)) {
    assertString(value, `conditions[${index}]`, url);
  }
};

/**
 * @template {Partial<ModuleDescriptorConfiguration>} T
 * @param {T} allegedModule
 * @returns {Omit<T, keyof BaseModuleDescriptorConfiguration>}
 */
const getModuleDescriptorSpecificProperties = allegedModule => {
  const {
    createdBy: _createdBy,
    retained: _retained,
    deferredError: _deferredError,
    ...other
  } = allegedModule;
  return other;
};

/**
 *
 * @param {Record<PropertyKey, unknown>} allegedModule
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedModule is ModuleDescriptorConfiguration}
 */
const assertBaseModuleDescriptorConfiguration = (allegedModule, path, url) => {
  const { deferredError, retained, createdBy } = allegedModule;
  if (deferredError !== undefined) {
    assertString(deferredError, `${path}.deferredError`, url);
  }
  if (retained !== undefined) {
    assertBoolean(retained, `${path}.retained`, url);
  }
  if (createdBy !== undefined) {
    assertString(createdBy, `${path}.createdBy`, url);
  }
};

/**
 * @param {ModuleDescriptorConfiguration} moduleDescriptor
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedModule is CompartmentModuleDescriptorConfiguration}
 */
const assertCompartmentModuleDescriptor = (moduleDescriptor, path, url) => {
  const { compartment, module, ...extra } =
    getModuleDescriptorSpecificProperties(
      /** @type {CompartmentModuleDescriptorConfiguration} */ (
        moduleDescriptor
      ),
    );
  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q(extra)} in ${q(url)}`,
  );

  assertString(compartment, `${path}.compartment`, url);
  assertString(module, `${path}.module`, url);
};

/**
 * @param {ModuleDescriptorConfiguration} moduleDescriptor
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedModule is FileModuleDescriptorConfiguration}
 */
const assertFileModuleDescriptor = (moduleDescriptor, path, url) => {
  const { location, parser, sha512, ...extra } =
    getModuleDescriptorSpecificProperties(
      /** @type {FileModuleDescriptorConfiguration} */ (moduleDescriptor),
    );
  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );
  assertString(location, `${path}.location`, url);
  assertString(parser, `${path}.parser`, url);

  if (sha512 !== undefined) {
    assertString(sha512, `${path}.sha512`, url);
  }
};

/**
 * @param {ModuleDescriptorConfiguration} moduleDescriptor
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedModule is ExitModuleDescriptorConfiguration}
 */
const assertExitModuleDescriptor = (moduleDescriptor, path, url) => {
  const { exit, ...extra } = getModuleDescriptorSpecificProperties(
    /** @type {ExitModuleDescriptorConfiguration} */ (moduleDescriptor),
  );
  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );
  assertString(exit, `${path}.exit`, url);
};

/**
 * @param {unknown} allegedModule
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedModule is ModuleDescriptorConfiguration}
 */
const assertModuleConfiguration = (allegedModule, path, url) => {
  assertPlainObject(allegedModule, path, url);
  assertBaseModuleDescriptorConfiguration(allegedModule, path, url);

  const { compartment, module, location, parser, exit, ...extra } =
    allegedModule;

  if (compartment !== undefined || module !== undefined) {
    assertCompartmentModuleDescriptor(allegedModule, path, url);
  } else if (location !== undefined || parser !== undefined) {
    assertFileModuleDescriptor(allegedModule, path, url);
  } else if (exit !== undefined) {
    assertExitModuleDescriptor(allegedModule, path, url);
  } else {
    assertEmptyObject(
      getModuleDescriptorSpecificProperties(extra),
      `${path} is not a valid module descriptor, got ${q(allegedModule)} in ${q(
        url,
      )}`,
    );
  }
};

/**
 * @param {unknown} allegedModules
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedModules is Record<string, ModuleDescriptorConfiguration>}
 */
const assertModuleDescriptorConfigurations = (allegedModules, path, url) => {
  assertPlainObject(allegedModules, path, url);
  for (const [key, value] of entries(allegedModules)) {
    assertString(
      key,
      `all keys of ${path}.modules must be strings, got ${key} in ${q(url)}`,
    );
    assertModuleConfiguration(value, `${path}.modules[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedParsers
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedParsers is CompartmentDescriptor['parsers']}
 */
const assertParsers = (allegedParsers, path, url) => {
  if (allegedParsers === undefined) {
    return;
  }
  assertPlainObject(allegedParsers, `${path}.parsers`, url);

  for (const [key, value] of entries(allegedParsers)) {
    assertString(
      key,
      `all keys of ${path}.parsers must be strings, got ${key} in ${q(url)}`,
    );
    assertString(value, `${path}.parsers[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedScope
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedScope is ScopeDescriptor}
 */
const assertScope = (allegedScope, path, url) => {
  assertPlainObject(allegedScope, path, url);

  const { compartment, ...extra } = allegedScope;
  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );

  assertString(compartment, `${path}.compartment`, url);
};

/**
 * @param {unknown} allegedScopes
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedScopes is Record<string, ScopeDescriptor>}
 */
const assertScopes = (allegedScopes, path, url) => {
  if (allegedScopes === undefined) {
    return;
  }

  assertPlainObject(allegedScopes, path, url);

  for (const [key, value] of entries(allegedScopes)) {
    assertString(
      key,
      `all keys of ${path}.scopes must be strings, got ${key} in ${q(url)}`,
    );
    assertScope(value, `${path}.scopes[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedTypes
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedTypes is CompartmentDescriptor['types']}
 */
const assertTypes = (allegedTypes, path, url) => {
  if (allegedTypes === undefined) {
    return;
  }

  assertPlainObject(allegedTypes, `${path}.types`, url);

  for (const [key, value] of entries(allegedTypes)) {
    assertString(
      key,
      `all keys of ${path}.types must be strings, got ${key} in ${q(url)}`,
    );
    assertString(value, `${path}.types[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedPolicy
 * @param {string} path
 * @param {string} [url]
 * @returns {asserts allegedPolicy is CompartmentDescriptor['policy']}
 */

const assertPolicy = (
  allegedPolicy,
  path,
  url = '<unknown-compartment-map.json>',
) => {
  assertPackagePolicy(allegedPolicy, `${path}.policy`, url);
};

/**
 * @param {unknown} allegedCompartment
 * @param {string} path
 * @param {string} url
 * @returns {asserts allegedCompartment is FileCompartmentDescriptor}
 */
const assertFileCompartmentDescriptor = (allegedCompartment, path, url) => {
  assertPlainObject(allegedCompartment, path, url);

  const {
    location,
    name,
    label,
    parsers,
    types,
    scopes,
    modules,
    policy,
    ...extra
  } = allegedCompartment;

  assertEmptyObject(
    extra,
    `${path} must not have extra properties, got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );

  assertString(location, `${path}.location`, url);
  assertString(name, `${path}.name`, url);
  assertString(label, `${path}.label`, url);

  assertModuleDescriptorConfigurations(modules, path, url);
  assertParsers(parsers, path, url);
  assertScopes(scopes, path, url);
  assertTypes(types, path, url);
  assertPolicy(policy, path, url);
};

/**
 * @param {unknown} allegedCompartments
 * @param {string} url
 * @returns {asserts allegedCompartments is Record<string, FileCompartmentDescriptor>}
 */
const assertFileCompartmentDescriptors = (allegedCompartments, url) => {
  assertPlainObject(allegedCompartments, 'compartments', url);
  for (const [key, value] of entries(allegedCompartments)) {
    assertString(
      key,
      `all keys of compartments must be strings, got ${key} in ${q(url)}`,
    );
    assertFileCompartmentDescriptor(value, `compartments[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedEntry
 * @param {string} url
 * @returns {asserts allegedEntry is EntryDescriptor}
 */
const assertEntry = (allegedEntry, url) => {
  assertPlainObject(allegedEntry, 'entry', url);
  const { compartment, module, ...extra } = allegedEntry;
  assertEmptyObject(
    extra,
    `"entry" must not have extra properties in compartment map, got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );
  assertString(compartment, 'entry.compartment', url);
  assertString(module, 'entry.module', url);
};

/**
 * @param {unknown} allegedCompartmentMap
 * @param {string} [url]
 * @returns {asserts allegedCompartmentMap is FileCompartmentMapDescriptor}
 */
export const assertFileCompartmentMap = (
  allegedCompartmentMap,
  url = '<unknown-compartment-map.json>',
) => {
  assertPlainObject(allegedCompartmentMap, 'compartment map', url);
  const {
    // TODO migrate tags to conditions
    // https://github.com/endojs/endo/issues/2388
    tags: conditions,
    entry,
    compartments,
    ...extra
  } = allegedCompartmentMap;
  assertEmptyObject(
    extra,
    `Compartment map must not have extra properties, got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );
  assertConditions(conditions, url);
  assertEntry(entry, url);
  assertFileCompartmentDescriptors(compartments, url);
};

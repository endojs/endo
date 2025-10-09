/* Validates a compartment map against its schema. */

import {
  assertPackagePolicy,
  ATTENUATORS_COMPARTMENT,
  ENTRY_COMPARTMENT,
} from './policy-format.js';

/**
 * @import {
 *   FileCompartmentDescriptor,
 *   FileCompartmentMapDescriptor,
 *   FileModuleDescriptorConfiguration,
 *   CompartmentMapDescriptor,
 *   EntryDescriptor,
 *   ModuleDescriptorConfiguration,
 *   ExitModuleDescriptorConfiguration,
 *   CompartmentModuleDescriptorConfiguration,
 *   CompartmentDescriptor,
 *   ScopeDescriptor,
 *   BaseModuleDescriptorConfiguration,
 *   DigestedCompartmentMapDescriptor,
 *   PackageCompartmentMapDescriptor,
 *   PackageCompartmentDescriptor,
 *   FileUrlString,
 *   LanguageForExtension,
 *   LanguageForModuleSpecifier,
 *   ModuleDescriptorConfigurationKind,
 *   ModuleDescriptorConfigurationKindToType,
 *   ErrorModuleDescriptorConfiguration,
 *   SourceModuleDescriptorConfiguration,
 *   DigestedCompartmentDescriptor} from './types.js'
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
 * @param {string} keypath
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
 * @param {string} url
 * @returns {asserts value is string}
 */
const assertString = (value, pathOrMessage, url) => {
  const keypath = pathOrMessage;
  assert.typeof(
    value,
    'string',
    `${keypath} in ${q(url)} must be a string; got ${q(value)}`,
  );
};

/**
 * Asserts the `label` field valid
 *
 * @param {unknown} allegedLabel
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts alleged is string}
 */
const assertLabel = (allegedLabel, keypath, url) => {
  assertString(allegedLabel, keypath, url);
  if (allegedLabel === ATTENUATORS_COMPARTMENT) {
    return;
  }
  if (allegedLabel === ENTRY_COMPARTMENT) {
    return;
  }
  assert(
    /^(?:@[a-z][a-z0-9-.]*\/)?[a-z][a-z0-9-.]*(?:>(?:@[a-z][a-z0-9-.]*\/)?[a-z][a-z0-9-.]*)*$/.test(
      allegedLabel,
    ),
    `${keypath} must be a canonical name in ${q(url)}; got ${q(allegedLabel)}`,
  );
};

/**
 * @param {unknown} allegedObject
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedObject is Record<PropertyKey, unknown>}
 */
const assertPlainObject = (allegedObject, keypath, url) => {
  const object = Object(allegedObject);
  assert(
    object === allegedObject &&
      !isArray(object) &&
      !(typeof object === 'function'),
    `${keypath} must be an object; got ${q(allegedObject)} of type ${q(typeof allegedObject)} in ${q(url)}`,
  );
};

/**
 *
 * @param {unknown} value
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts value is boolean}
 */
const assertBoolean = (value, keypath, url) => {
  assert.typeof(
    value,
    'boolean',
    `${keypath} in ${q(url)} must be a boolean; got ${q(value)}`,
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
    `conditions must be an array; got ${conditions} in ${q(url)}`,
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
    __createdBy: _createdBy,
    retained: _retained,
    deferredError: _deferredError,
    ...other
  } = allegedModule;
  return other;
};

/**
 *
 * @param {Record<PropertyKey, unknown>} allegedModule
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedModule is ModuleDescriptorConfiguration}
 */
const assertBaseModuleDescriptorConfiguration = (
  allegedModule,
  keypath,
  url,
) => {
  const { deferredError, retained, createdBy } = allegedModule;
  if (deferredError !== undefined) {
    assertString(deferredError, `${keypath}.deferredError`, url);
  }
  if (retained !== undefined) {
    assertBoolean(retained, `${keypath}.retained`, url);
  }
  if (createdBy !== undefined) {
    assertString(createdBy, `${keypath}.createdBy`, url);
  }
};

/**
 * @param {ModuleDescriptorConfiguration} moduleDescriptor
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedModule is CompartmentModuleDescriptorConfiguration}
 */
const assertCompartmentModuleDescriptor = (moduleDescriptor, keypath, url) => {
  const { compartment, module, ...extra } =
    getModuleDescriptorSpecificProperties(
      /** @type {CompartmentModuleDescriptorConfiguration} */ (
        moduleDescriptor
      ),
    );
  assertEmptyObject(
    extra,
    `${keypath} must not have extra properties; got ${q(extra)} in ${q(url)}`,
  );

  assertString(compartment, `${keypath}.compartment`, url);
  assertString(module, `${keypath}.module`, url);
};

/**
 * @param {ModuleDescriptorConfiguration} moduleDescriptor
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedModule is FileModuleDescriptorConfiguration}
 */
const assertFileModuleDescriptor = (moduleDescriptor, keypath, url) => {
  const { location, parser, sha512, ...extra } =
    getModuleDescriptorSpecificProperties(
      /** @type {FileModuleDescriptorConfiguration} */ (moduleDescriptor),
    );
  assertEmptyObject(
    extra,
    `${keypath} must not have extra properties; got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );
  if (location !== undefined) {
    assertString(location, `${keypath}.location`, url);
  }
  assertString(parser, `${keypath}.parser`, url);

  if (sha512 !== undefined) {
    assertString(sha512, `${keypath}.sha512`, url);
  }
};

/**
 * @param {ModuleDescriptorConfiguration} moduleDescriptor
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedModule is ExitModuleDescriptorConfiguration}
 */
const assertExitModuleDescriptor = (moduleDescriptor, keypath, url) => {
  const { exit, ...extra } = getModuleDescriptorSpecificProperties(
    /** @type {ExitModuleDescriptorConfiguration} */ (moduleDescriptor),
  );
  assertEmptyObject(
    extra,
    `${keypath} must not have extra properties; got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );
  assertString(exit, `${keypath}.exit`, url);
};

/**
 *
 * @param {ModuleDescriptorConfiguration} moduleDescriptor
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts moduleDescriptor is ErrorModuleDescriptorConfiguration}
 */
const assertErrorModuleDescriptor = (moduleDescriptor, keypath, url) => {
  const { deferredError } = moduleDescriptor;
  if (deferredError) {
    assertString(deferredError, `${keypath}.deferredError`, url);
  }
};

/**
 * @template {ModuleDescriptorConfigurationKind[]} Kinds
 * @overload
 * @param {unknown} allegedModule
 * @param {string} keypath
 * @param {string} url
 * @param {Kinds} kinds
 * @returns {asserts allegedModule is ModuleDescriptorConfigurationKindToType<Kinds>}
 */

/**
 * @overload
 * @param {unknown} allegedModule
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedModule is ModuleDescriptorConfiguration}
 */

/**
 * @param {unknown} allegedModule
 * @param {string} keypath
 * @param {string} url
 * @param {ModuleDescriptorConfigurationKind[]} kinds
 */
function assertModuleConfiguration(allegedModule, keypath, url, kinds) {
  assertPlainObject(allegedModule, keypath, url);
  assertBaseModuleDescriptorConfiguration(allegedModule, keypath, url);

  const finalKinds =
    kinds.length > 0
      ? kinds
      : /** @type {ModuleDescriptorConfigurationKind[]} */ ([
          'compartment',
          'file',
          'exit',
          'error',
        ]);
  /** @type {Error[]} */
  const errors = [];
  for (const kind of finalKinds) {
    switch (kind) {
      case 'compartment': {
        try {
          assertCompartmentModuleDescriptor(allegedModule, keypath, url);
        } catch (error) {
          errors.push(error);
        }
        break;
      }
      case 'file': {
        try {
          assertFileModuleDescriptor(allegedModule, keypath, url);
        } catch (error) {
          errors.push(error);
        }
        break;
      }
      case 'exit': {
        try {
          assertExitModuleDescriptor(allegedModule, keypath, url);
        } catch (error) {
          errors.push(error);
        }
        break;
      }
      case 'error': {
        try {
          assertErrorModuleDescriptor(allegedModule, keypath, url);
        } catch (error) {
          errors.push(error);
        }
        break;
      }
      default:
        throw new TypeError(
          `Unknown module descriptor kind ${q(kind)} in ${q(url)}`,
        );
    }
  }

  assert(
    errors.length < finalKinds.length,
    `invalid module descriptor in ${q(url)} at ${q(keypath)}; expected to match one of ${q(kinds)}: ${errors.map(err => err.message).join('; ')}`,
  );
}

/**
 * @param {unknown} allegedModules
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedModules is Record<string, ModuleDescriptorConfiguration>}
 */
const assertModuleDescriptorConfigurations = (allegedModules, keypath, url) => {
  assertPlainObject(allegedModules, keypath, url);
  for (const [key, value] of entries(allegedModules)) {
    assertString(
      key,
      `all keys of ${keypath}.modules must be strings; got ${key} in ${q(url)}`,
    );
    assertModuleConfiguration(value, `${keypath}.modules[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedModules
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedModules is Record<string, FileModuleDescriptorConfiguration|CompartmentModuleDescriptorConfiguration>}
 */
const assertFileModuleDescriptorConfigurations = (
  allegedModules,
  keypath,
  url,
) => {
  assertPlainObject(allegedModules, keypath, url);
  for (const [key, value] of entries(allegedModules)) {
    assertString(
      key,
      `all keys of ${keypath}.modules must be strings; got ${key} in ${q(url)}`,
    );
    assertModuleConfiguration(value, `${keypath}.modules[${q(key)}]`, url, [
      'file',
      'compartment',
      'error',
    ]);
  }
};

/**
 * @param {unknown} allegedModules
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedModules is Record<string, SourceModuleDescriptorConfiguration>}
 */
const assertDigestedModuleDescriptorConfigurations = (
  allegedModules,
  keypath,
  url,
) => {
  assertPlainObject(allegedModules, keypath, url);
  for (const [key, value] of entries(allegedModules)) {
    assertString(
      key,
      `all keys of ${keypath}.modules must be strings; got ${key} in ${q(url)}`,
    );
    assertModuleConfiguration(value, `${keypath}.modules[${q(key)}]`, url, [
      'file',
      'exit',
      'error',
    ]);
  }
};

/**
 * @param {unknown} allegedParsers
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedParsers is LanguageForExtension}
 */
const assertParsers = (allegedParsers, keypath, url) => {
  assertPlainObject(allegedParsers, `${keypath}.parsers`, url);

  for (const [key, value] of entries(allegedParsers)) {
    assertString(
      key,
      `all keys of ${keypath}.parsers must be strings; got ${key} in ${q(url)}`,
    );
    assertString(value, `${keypath}.parsers[${q(key)}]`, url);
  }
};

/**
 * @overload
 * @param {unknown} allegedTruthyValue
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedTruthyValue is NonNullable<unknown>}
 */

/**
 *
 * @overload
 * @param {unknown} allegedTruthyValue
 * @param {string} message
 * @returns {asserts allegedTruthyValue is NonNullable<unknown>}
 */

/**
 *
 * @param {unknown} allegedTruthyValue
 * @param {string} keypath
 * @param {string} [url]
 * @returns {asserts allegedTruthyValue is NonNullable<unknown>}
 */
const assertTruthy = (allegedTruthyValue, keypath, url) => {
  assert(
    allegedTruthyValue,
    url
      ? `${keypath} in ${q(url)} must be truthy; got ${q(allegedTruthyValue)}`
      : url,
  );
};

/**
 * @template [T=string]
 * @typedef {(value: unknown, keypath: string, url: string) => void} AssertFn
 */

/**
 * @template [T=string]
 * @param {unknown} allegedScope
 * @param {string} keypath
 * @param {string} url
 * @param {AssertFn<T>} [assertCompartmentValue]
 * @returns {asserts allegedScope is ScopeDescriptor<T>}
 */
const assertScope = (allegedScope, keypath, url, assertCompartmentValue) => {
  assertPlainObject(allegedScope, keypath, url);

  const { compartment, ...extra } = allegedScope;
  assertEmptyObject(
    extra,
    `${keypath} must not have extra properties; got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );

  if (assertCompartmentValue) {
    assertCompartmentValue(compartment, `${keypath}.compartment`, url);
  } else {
    assertString(compartment, `${keypath}.compartment`, url);
  }
};

/**
 * @template [T=string]
 * @param {unknown} allegedScopes
 * @param {string} keypath
 * @param {string} url
 * @param {AssertFn<T>} [assertCompartmentValue]
 * @returns {asserts allegedScopes is Record<string, ScopeDescriptor<T>>}
 */
const assertScopes = (
  allegedScopes,
  keypath,
  url,
  assertCompartmentValue = assertString,
) => {
  assertPlainObject(allegedScopes, keypath, url);

  for (const [key, value] of entries(allegedScopes)) {
    assertString(
      key,
      `all keys of ${keypath}.scopes must be strings; got ${key} in ${q(url)}`,
    );
    assertScope(
      value,
      `${keypath}.scopes[${q(key)}]`,
      url,
      assertCompartmentValue,
    );
  }
};

/**
 * @param {unknown} allegedTypes
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedTypes is LanguageForModuleSpecifier}
 */
const assertTypes = (allegedTypes, keypath, url) => {
  assertPlainObject(allegedTypes, `${keypath}.types`, url);

  for (const [key, value] of entries(allegedTypes)) {
    assertString(
      key,
      `all keys of ${keypath}.types must be strings; got ${key} in ${q(url)}`,
    );
    assertString(value, `${keypath}.types[${q(key)}]`, url);
  }
};

/**
 * @template {Record<string, ModuleDescriptorConfiguration>} [M=Record<string, ModuleDescriptorConfiguration>]
 * @param {unknown} allegedCompartment
 * @param {string} keypath
 * @param {string} url
 * @param {AssertFn<M>} [assertModuleConfigurations]
 * @returns {asserts allegedCompartment is CompartmentDescriptor}
 */
const assertCompartmentDescriptor = (
  allegedCompartment,
  keypath,
  url,
  assertModuleConfigurations,
) => {
  assertPlainObject(allegedCompartment, keypath, url);

  const {
    location,
    name,
    parsers,
    types,
    scopes,
    modules,
    policy,
    sourceDirname,
    retained,
  } = allegedCompartment;

  assertString(location, `${keypath}.location`, url);
  assertString(name, `${keypath}.name`, url);

  // TODO: It may be prudent to assert that there exists some module referring
  // to its own compartment

  if (assertModuleConfigurations) {
    assertModuleConfigurations(modules, keypath, url);
  } else {
    assertModuleDescriptorConfigurations(modules, keypath, url);
  }

  if (parsers !== undefined) {
    assertParsers(parsers, keypath, url);
  }
  if (scopes !== undefined) {
    assertScopes(scopes, keypath, url);
  }
  if (types !== undefined) {
    assertTypes(types, keypath, url);
  }
  if (policy !== undefined) {
    assertPackagePolicy(policy, keypath, url);
  }
  if (sourceDirname !== undefined) {
    assertString(sourceDirname, `${keypath}.sourceDirname`, url);
  }
  if (retained !== undefined) {
    assertBoolean(retained, `${keypath}.retained`, url);
  }
};

/**
 * Ensures a string is a file URL (a {@link FileUrlString})
 *
 * @param {unknown} allegedFileUrlString - a package location to assert
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedFileUrlString is FileUrlString}
 */
const assertFileUrlString = (allegedFileUrlString, keypath, url) => {
  assertString(allegedFileUrlString, keypath, url);
  assert(
    allegedFileUrlString.startsWith('file://'),
    `${keypath} must be a file URL in ${q(url)}; got ${q(allegedFileUrlString)}`,
  );
  assert(
    allegedFileUrlString.length > 7,
    `${keypath} must contain a non-empty path in ${q(url)}; got ${q(allegedFileUrlString)}`,
  );
};

/**
 * @param {unknown} allegedModules
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedModules is Record<string, CompartmentModuleDescriptorConfiguration>}
 */
const assertPackageModuleDescriptorConfigurations = (
  allegedModules,
  keypath,
  url,
) => {
  assertPlainObject(allegedModules, keypath, url);
  for (const [key, value] of entries(allegedModules)) {
    assertString(
      key,
      `all keys of ${keypath}.modules must be strings; got ${key} in ${q(url)}`,
    );
    assertModuleConfiguration(value, `${keypath}.modules[${q(key)}]`, url, [
      'compartment',
    ]);
  }
};

/**
 *
 * @param {unknown} allegedLocation
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedLocation is PackageCompartmentDescriptor['location']}
 */
const assertPackageLocation = (allegedLocation, keypath, url) => {
  if (allegedLocation === ATTENUATORS_COMPARTMENT) {
    return;
  }
  assertFileUrlString(allegedLocation, keypath, url);
};

/**
 * @param {unknown} allegedCompartment
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedCompartment is PackageCompartmentDescriptor}
 */
const assertPackageCompartmentDescriptor = (
  allegedCompartment,
  keypath,
  url,
) => {
  assertCompartmentDescriptor(
    allegedCompartment,
    keypath,
    url,
    assertPackageModuleDescriptorConfigurations,
  );

  const {
    location,
    scopes,
    label,
    // these unused vars already validated by assertPackageModuleDescriptorConfigurations
    name: _name,
    sourceDirname: _sourceDirname,
    modules: _modules,
    parsers: _parsers,
    types: _types,
    policy: _policy,
    ...extra
  } = /** @type {PackageCompartmentDescriptor} */ (allegedCompartment);

  assertEmptyObject(
    extra,
    `${keypath} must not have extra properties; got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );

  assertPackageLocation(location, `${keypath}.location`, url);
  assertLabel(label, `${keypath}.label`, url);
  assertScopes(scopes, `${keypath}.scopes`, url, assertFileUrlString);
};

/**
 *
 * @param {unknown} allegedCompartment
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedCompartment is DigestedCompartmentDescriptor}
 */
const assertDigestedCompartmentDescriptor = (
  allegedCompartment,
  keypath,
  url,
) => {
  assertCompartmentDescriptor(
    allegedCompartment,
    keypath,
    url,
    assertDigestedModuleDescriptorConfigurations,
  );

  const {
    name: _name,
    label: _label,
    modules: _modules,
    policy: _policy,
    location: _location,
    ...extra
  } = allegedCompartment;

  assertEmptyObject(
    extra,
    `${keypath} must not have extra properties; got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );
};

/**
 * @param {unknown} allegedCompartment
 * @param {string} keypath
 * @param {string} url
 * @returns {asserts allegedCompartment is FileCompartmentDescriptor}
 */
const assertFileCompartmentDescriptor = (allegedCompartment, keypath, url) => {
  assertCompartmentDescriptor(
    allegedCompartment,
    keypath,
    url,
    assertFileModuleDescriptorConfigurations,
  );

  const {
    location: _location,
    name: _name,
    label,
    modules: _modules,
    policy: _policy,
    ...extra
  } = /** @type {FileCompartmentDescriptor} */ (allegedCompartment);

  assertEmptyObject(
    extra,
    `${keypath} must not have extra properties; got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );

  assertString(label, `${keypath}.label`, url);
};

/**
 * @param {unknown} allegedCompartments
 * @param {string} url
 * @returns {asserts allegedCompartments is Record<string, unknown>}
 */
const assertCompartmentDescriptors = (allegedCompartments, url) => {
  assertPlainObject(allegedCompartments, 'compartments', url);
  const compartmentNames = keys(allegedCompartments);
  assert(
    compartmentNames.length > 0,
    `compartments must not be empty in ${q(url)}`,
  );
  for (const key of keys(allegedCompartments)) {
    assertString(
      key,
      `all keys of compartments must be strings; got ${key} in ${q(url)}`,
    );
  }
  assert(
    compartmentNames.every(name => typeof name === 'string'),
    `all keys of compartments must be strings; got ${q(compartmentNames)} in ${q(url)}`,
  );
};

/**
 * @param {unknown} allegedCompartments
 * @param {string} url
 * @returns {asserts allegedCompartments is Record<string, FileCompartmentDescriptor>}
 */
const assertFileCompartmentDescriptors = (allegedCompartments, url) => {
  assertCompartmentDescriptors(allegedCompartments, url);
  for (const [key, value] of entries(allegedCompartments)) {
    assertFileCompartmentDescriptor(value, `compartments[${q(key)}]`, url);
  }
};

/**
 * @param {unknown} allegedCompartments
 * @param {string} url
 * @returns {asserts allegedCompartments is Record<string, PackageCompartmentDescriptor>}
 */
const assertPackageCompartmentDescriptors = (allegedCompartments, url) => {
  assertCompartmentDescriptors(allegedCompartments, url);
  for (const [key, value] of entries(allegedCompartments)) {
    assertPackageCompartmentDescriptor(value, `compartments[${q(key)}]`, url);
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
    `"entry" must not have extra properties in compartment map; got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );
  assertString(compartment, 'entry.compartment', url);
  assertString(module, 'entry.module', url);
};

/**
 * @param {unknown} allegedCompartmentMap
 * @param {string} url
 * @returns {asserts allegedCompartmentMap is CompartmentMapDescriptor}
 */
const assertCompartmentMap = (allegedCompartmentMap, url) => {
  assertPlainObject(allegedCompartmentMap, 'compartment map', url);
  const {
    // TODO migrate tags to conditions
    // https://github.com/endojs/endo/issues/2388
    tags: conditions,
    entry,
    compartments: _compartments,
    ...extra
  } = allegedCompartmentMap;
  assertEmptyObject(
    extra,
    `Compartment map must not have extra properties; got ${q(
      keys(extra),
    )} in ${q(url)}`,
  );
  assertConditions(conditions, url);
  assertEntry(entry, url);
  assertTruthy(
    allegedCompartmentMap.compartments?.[entry.compartment],
    `compartments must contain entry compartment "${entry.compartment}" in ${q(url)}`,
  );
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
  assertCompartmentMap(allegedCompartmentMap, url);
  const { compartments } = allegedCompartmentMap;
  assertFileCompartmentDescriptors(compartments, url);
};

/**
 *
 * @param {unknown} allegedCompartments
 * @param {string} url
 * @returns {asserts allegedCompartments is Record<string, DigestedCompartmentDescriptor>}
 */
export const assertDigestedCompartmentDescriptors = (
  allegedCompartments,
  url = '<unknown-compartment-map.json>',
) => {
  assertCompartmentDescriptors(allegedCompartments, url);
  for (const [key, value] of entries(allegedCompartments)) {
    assertDigestedCompartmentDescriptor(value, `compartments[${q(key)}]`, url);
  }
};

/**
 *
 * @param {unknown} allegedCompartmentMap
 * @param {string} [url]
 * @returns {asserts allegedCompartmentMap is DigestedCompartmentMapDescriptor}
 */
export const assertDigestedCompartmentMap = (
  allegedCompartmentMap,
  url = '<unknown-compartment-map.json>',
) => {
  assertCompartmentMap(allegedCompartmentMap, url);
  const { compartments } = allegedCompartmentMap;
  assertDigestedCompartmentDescriptors(compartments, url);
};

/**
 * @param {unknown} allegedCompartmentMap
 * @param {string} [url]
 * @returns {asserts allegedCompartmentMap is PackageCompartmentMapDescriptor}
 */
export const assertPackageCompartmentMap = (
  allegedCompartmentMap,
  url = '<unknown-compartment-map.json>',
) => {
  assertCompartmentMap(allegedCompartmentMap, url);
  const { compartments } = allegedCompartmentMap;
  assertPackageCompartmentDescriptors(compartments, url);
};

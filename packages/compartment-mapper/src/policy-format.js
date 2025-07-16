/**
 * Provides functions for enforcing compartment-map linkage and global
 * variable policies for each compartment.
 *
 * @module
 */

/**
 * @import {SomePackagePolicy,
 *    SomePolicy,
 *    PackagePolicy,
 *    AttenuationDefinition,
 *    PolicyEnforcementField,
 *    WildcardPolicy,
 *    UnifiedAttenuationDefinition,
 *    PolicyItem,
 *    TypeGuard,
 *    GuardedType,
 *    SomeTypeGuard,
 *    ImplicitAttenuationDefinition,
 *    FullAttenuationDefinition,
 *    UnionToIntersection,
 *    PackageNamingKit
 *} from './types.js'
 */

const { entries, keys } = Object;
const { isArray } = Array;
const q = JSON.stringify;

/**
 * Const string to identify the internal attenuators compartment
 */
export const ATTENUATORS_COMPARTMENT = '<ATTENUATORS>';

/**
 * @satisfies {keyof FullAttenuationDefinition}
 */
const ATTENUATOR_KEY = 'attenuate';

/**
 * @satisfies {keyof FullAttenuationDefinition}
 */
const ATTENUATOR_PARAMS_KEY = 'params';

/**
 * Generates a string identifying a package for policy lookup purposes.
 *
 * @param {PackageNamingKit} namingKit
 * @returns {string}
 */

export const generateCanonicalName = ({ isEntry = false, name, path }) => {
  if (isEntry) {
    throw Error('Entry module cannot be identified with a canonicalName');
  }
  if (name === ATTENUATORS_COMPARTMENT) {
    return ATTENUATORS_COMPARTMENT;
  }
  return path.join('>');
};

/**
 * @type {WildcardPolicy}
 */
export const WILDCARD_POLICY_VALUE = 'any';

/**
 * @satisfies {PolicyEnforcementField[]}
 */
const POLICY_ENFORCEMENT_FIELDS = /** @type {const} */ ([
  'builtins',
  'globals',
  'packages',
]);

/**
 * Type guard for `undefined`
 *
 * @param {unknown} item
 * @returns {item is undefined}
 */
const isUndefined = item => item === undefined;

/**
 * Type guard for a function or constructor
 *
 * @param {unknown} item
 * @returns {item is ((...args: any[]) => any) | (new (...args: any[]) => any)}
 */
const isFunction = item => typeof item === 'function';

/**
 * Type guard for a plain object
 *
 * @param {unknown} item
 * @returns {item is Record<PropertyKey, unknown>}
 */
const isPlainObject = item =>
  Object(item) === item && !isArray(item) && !isFunction(item);

/**
 * Asserts that `item` is a plain object
 *
 * @param {unknown} item
 * @param {string} [message]
 * @returns {asserts item is Record<string, any>}
 */
const assertPlainObject = (item, message) => {
  assert(
    isPlainObject(item),
    message ?? `Expected a plain object, got ${q(item)}`,
  );
};

/**
 * Checks if the result of `keys(item).length` is `0`.
 *
 * Not a "real" type guard; probably needs to be used with a type assertion.
 *
 * @param {object} item
 * @returns {item is object}
 */
const isEmpty = item => keys(item).length === 0;

/**
 * Helps find a value in `field` of {@link PackagePolicy} `packagePolicy`
 * matching `itemNameOrPath`.
 *
 * @param {PackagePolicy} packagePolicy Package policy
 * @param {PolicyEnforcementField} field Package policy field to look up
 * @param {string|string[]} nameOrPath A canonical name or a path which can
 * be converted to a canonical name
 * @returns {boolean | AttenuationDefinition}
 */
export const policyLookupHelper = (packagePolicy, field, nameOrPath) => {
  assert(
    POLICY_ENFORCEMENT_FIELDS.includes(field),
    `Unknown or unsupported policy field ${q(field)}`,
  );

  if (!isPlainObject(packagePolicy)) {
    return false;
  }

  const policyDefinition = packagePolicy[field];

  if (!policyDefinition) {
    return false;
  }

  if (policyDefinition === WILDCARD_POLICY_VALUE) {
    return true;
  }

  if (isArray(nameOrPath)) {
    nameOrPath = generateCanonicalName({
      path: nameOrPath,
      isEntry: nameOrPath.length === 0,
    });
  }

  if (nameOrPath in policyDefinition) {
    return policyDefinition[nameOrPath];
  }

  return false;
};

/**
 * Type guard; checks if the policy value is set to the wildcard value to allow everything
 *
 * @param {unknown} policyValue
 * @returns {policyValue is WildcardPolicy}
 */
export const isAllowingEverything = policyValue =>
  policyValue === WILDCARD_POLICY_VALUE;

/**
 * Type guard for a {@link ImplicitAttenuationDefinition}
 */
const isImplicitAttenuationDefinition =
  /** @type {TypeGuard<unknown, ImplicitAttenuationDefinition>} */ (isArray);

/**
 * Combine multiple type guards with a logical "OR" operation.
 *
 * @template {SomeTypeGuard} T Any type guard function
 * @overload
 * @param {T[]} guards Array of type guard functions
 * @returns {[T] extends [TypeGuard<infer U, any>] ? (value: U) => value is GuardedType<T> : never} Type guard that returns a union of the types checked by the guards
 */

/**
 * Combine two type guards with a logical "OR" operation.
 *
 * Note the overload here is due to TS' inflexibility w/r/t using conditional return types.
 * @template {SomeTypeGuard} T
 * @param {T[]} guards
 */
const or =
  guards =>
  /** @param {any} item */
  item =>
    guards.some(guard => guard(item));

/**
 * Combine multiple type guards with a logical "AND" operation.
 *
 * @template {SomeTypeGuard} T Any type guard function
 * @overload
 * @param {T[]} guards Array of type guard functions
 * @returns {[T] extends [TypeGuard<infer U, any>] ? (value: U) => value is Extract<UnionToIntersection<GuardedType<T>>, U> : never} Type guard that returns an intesection of the types checked by the guards
 */

/**
 * @template {SomeTypeGuard} T
 * @param {T[]} guards
 */
const and = guards => /** @param {any} item */ item =>
  guards.every(guard => guard(item));

/**
 * @template {SomeTypeGuard} T
 * @overload
 * @param {T} guard
 * @returns {[T] extends [TypeGuard<infer U, any>] ? (value: U) => value is GuardedType<T> & never : never}
 */

/**
 * @template {SomeTypeGuard} T
 * @param {T} guard
 */
const not = guard => /** @param {any} item */ item => !guard(item);
/**
 * Type guard for a string
 *
 * @param {unknown} item
 * @returns {item is string}
 */
const isString = item => typeof item === 'string';

/**
 * Type guard for a {@link FullAttenuationDefinition}
 * @param {unknown} allegedDefinition
 * @returns {allegedDefinition is FullAttenuationDefinition}
 */
const isFullAttenuationDefinition = allegedDefinition =>
  isPlainObject(allegedDefinition) &&
  isString(allegedDefinition[ATTENUATOR_KEY]) &&
  (isUndefined(allegedDefinition[ATTENUATOR_PARAMS_KEY]) ||
    isArray(allegedDefinition[ATTENUATOR_PARAMS_KEY]));

/**
 * Type guard for `AttenuationDefinition`
 */
export const isAttenuationDefinition = or([
  isImplicitAttenuationDefinition,
  isFullAttenuationDefinition,
]);

/**
 * Converts a {@link ImplicitAttenuationDefinition} or {@link FullAttenuationDefinition} to a {@link UnifiedAttenuationDefinition}
 *
 * @param {AttenuationDefinition} attenuationDefinition
 * @returns {UnifiedAttenuationDefinition}
 */
export const getAttenuatorFromDefinition = attenuationDefinition => {
  if (isImplicitAttenuationDefinition(attenuationDefinition)) {
    return {
      displayName: '<default attenuator>',
      specifier: null,
      params: attenuationDefinition,
    };
  }

  if (isFullAttenuationDefinition(attenuationDefinition)) {
    return {
      displayName: attenuationDefinition[ATTENUATOR_KEY],
      specifier: attenuationDefinition[ATTENUATOR_KEY],
      params: attenuationDefinition[ATTENUATOR_PARAMS_KEY],
    };
  }

  throw TypeError(
    `Invalid attenuation ${q(
      attenuationDefinition,
    )}, must be an array of params for default attenuator or an object with an attenuator key`,
  );
};

/**
 * Type guard for a `Record` of items with enumerable keys of type `string` and
 * values of a type defined by a type guard.
 *
 * @template {SomeTypeGuard} T Some type guard function
 * @param {T} guard Type guard function
 */
const isRecordOf =
  guard =>
  /**
   * @param {unknown} item
   * @returns {item is Record<string, GuardedType<T>>}
   */ item =>
    isPlainObject(item) &&
    entries(item).every(([key, value]) => isString(key) && guard(value));

/**
 * Type guard for `boolean`
 * @param {unknown} item
 * @returns {item is boolean}
 */
const isBoolean = item => typeof item === 'boolean';

/**
 * Type guard for a `Record<string, boolean>`
 */
const isRecordOfBoolean = isRecordOf(isBoolean);

/**
 * Type guard for {@link PolicyItem}
 *
 * @param {unknown} item
 * @returns {item is PolicyItem|undefined}
 */
const isPolicyItem = item =>
  isUndefined(item) ||
  item === WILDCARD_POLICY_VALUE ||
  isRecordOfBoolean(item);

/**
 * Type guard for {@link PackagePolicy.globals}
 */
const isGlobals = or([isPolicyItem, isAttenuationDefinition]);

/**
 * Type guard for {@link PackagePolicy.noGlobalFreeze}
 */
const isNoGlobalFreeze = or([isUndefined, isBoolean]);

/**
 * Type guard for {@link PackagePolicy.builtins}
 */
const isBuiltins = or([
  isPolicyItem,
  isRecordOf(or([isBoolean, isAttenuationDefinition])),
]);

/**
 * Type guard for an empty object
 *
 * TODO: Shouldn't need type assertions here
 */
const isEmptyObject =
  /** @type {TypeGuard<unknown, Record<PropertyKey, never>>} */ (
    and([
      isPlainObject,
      /**
       * @type {TypeGuard<any, Record<PropertyKey, never>>}
       */
      value => isEmpty(value),
    ])
  );

/**
 * Type guard for an empty string
 */
const isEmptyString = and([
  isString,
  /** @type {TypeGuard<unknown, {length: 0}>} */ (isEmpty),
]);

/**
 * Type guard for {@link PackagePolicy.defaultAttenuator}
 */
const isDefaultAttenuator = or([
  isUndefined,
  and([isString, not(isEmptyString)]),
]);

/**
 * This asserts (i.e., throws) that `allegedPackagePolicy` is a valid `PackagePolicy`.
 *
 * Mild-mannered during the day, but fights crime at night as a type guard.
 *
 * @param {unknown} allegedPackagePolicy - Alleged `PackagePolicy` to test
 * @param {string} keypath - Keypath in the `Policy` object; used for error messages only
 * @param {string} [url] - URL of the policy file; used for error messages only
 * @returns {asserts allegedPackagePolicy is SomePackagePolicy|undefined}
 */
export const assertPackagePolicy = (allegedPackagePolicy, keypath, url) => {
  if (isUndefined(allegedPackagePolicy)) {
    return;
  }

  const inUrl = url ? ` in ${q(url)}` : '';

  assertPlainObject(
    allegedPackagePolicy,
    `${keypath} must be an object, got ${q(allegedPackagePolicy)}${inUrl}`,
  );

  const {
    packages,
    builtins,
    globals,
    noGlobalFreeze,
    defaultAttenuator: _ignore, // a carve out for the default attenuator in compartment map
    // eslint-disable-next-line no-unused-vars
    options, // any extra options
    ...extra
  } = allegedPackagePolicy;

  assert(
    isEmptyObject(extra),
    `${keypath} must not have extra properties, got ${q(keys(extra))}${inUrl}`,
  );

  assert(
    isNoGlobalFreeze(noGlobalFreeze),
    `${keypath}.noGlobalFreeze must be a boolean, got ${q({
      noGlobalFreeze,
    })}${inUrl}`,
  );

  assert(
    isPolicyItem(packages),
    `${keypath}.packages must be a record of booleans, got ${q({
      packages,
    })}${inUrl}`,
  );

  assert(
    isGlobals(globals),
    `${keypath}.globals must be a record of booleans or a single attenuation, got ${q(
      {
        globals,
      },
    )}${inUrl}`,
  );

  assert(
    isBuiltins(builtins),
    `${keypath}.builtins must be a record of booleans or attenuations, got ${q({
      builtins,
    })}${inUrl}`,
  );
};

/**
 * This asserts (i.e., throws) that `allegedPolicy` is a valid `Policy`
 *
 * It also moonlights as a type guard.
 *
 * @param {unknown} allegedPolicy - Alleged `Policy` to test
 * @returns {asserts allegedPolicy is (SomePolicy | undefined)}
 */
export const assertPolicy = allegedPolicy => {
  if (isUndefined(allegedPolicy)) {
    return;
  }

  assertPlainObject(
    allegedPolicy,
    `policy must be an object, got ${q(allegedPolicy)}`,
  );
  const { resources, entry, defaultAttenuator, ...extra } = allegedPolicy;

  assert(
    isEmptyObject(extra),
    `policy must not have extra properties, got ${q(keys(extra))}`,
  );

  assert(
    isPlainObject(resources),
    `policy.resources must be an object, got ${q(resources)}`,
  );

  assert(
    isDefaultAttenuator(defaultAttenuator),
    `policy.defaultAttenuator must be a nonempty string, got ${q(defaultAttenuator)}`,
  );

  assertPackagePolicy(entry, `policy.entry`);

  for (const [key, value] of entries(resources)) {
    assertPackagePolicy(value, `policy.resources["${key}"]`);
  }
};

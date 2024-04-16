// @ts-check

const { entries, keys } = Object;
const { isArray } = Array;
const q = JSON.stringify;

const ATTENUATOR_KEY = 'attenuate';
const ATTENUATOR_PARAMS_KEY = 'params';
const WILDCARD_POLICY_VALUE = 'any';
export const DYNAMIC_POLICY_VALUE = 'dynamic';
const POLICY_FIELDS_LOOKUP = /** @type {const} */ ([
  'builtins',
  'globals',
  'packages',
]);

/**
 *
 * @param {import('./types.js').PackagePolicy} packagePolicy
 * @param {'builtins'|'globals'|'packages'} field
 * @param {string} itemName
 * @returns {boolean | import('./types.js').AttenuationDefinition}
 */
export const policyLookupHelper = (packagePolicy, field, itemName) => {
  if (!POLICY_FIELDS_LOOKUP.includes(field)) {
    throw Error(`Invalid field ${q(field)}`);
  }
  if (
    typeof packagePolicy !== 'object' ||
    packagePolicy === null ||
    !packagePolicy[field]
  ) {
    return false;
  }

  if (packagePolicy[field] === WILDCARD_POLICY_VALUE) {
    return true;
  }

  const value = /** @type {import('./types.js').AttenuationDefinition} */ (
    packagePolicy[field]
  );
  if (itemName in value) {
    return value[itemName];
  }
  return false;
};

/**
 * Type guard; checks if the policy value is set to the wildcard value to allow everything
 *
 * @param {unknown} policyValue
 * @returns {policyValue is import('./types.js').WildcardPolicy}
 */
export const isAllowingEverything = policyValue =>
  policyValue === WILDCARD_POLICY_VALUE;

/**
 * Type guard for `AttenuationDefinition`
 * @param {unknown} allegedDefinition
 * @returns {allegedDefinition is import('./types.js').AttenuationDefinition}
 */
export const isAttenuationDefinition = allegedDefinition => {
  return Boolean(
    (allegedDefinition &&
      typeof allegedDefinition === 'object' &&
      typeof allegedDefinition[ATTENUATOR_KEY] === 'string') || // object with attenuator name
      isArray(allegedDefinition), // params for default attenuator
  );
};

/**
 *
 * @param {import('./types.js').AttenuationDefinition} attenuationDefinition
 * @returns {import('./types.js').UnifiedAttenuationDefinition}
 */
export const getAttenuatorFromDefinition = attenuationDefinition => {
  if (!isAttenuationDefinition(attenuationDefinition)) {
    throw Error(
      `Invalid attenuation ${q(
        attenuationDefinition,
      )}, must be an array of params for default attenuator or an object with an attenuator key`,
    );
  }
  if (isArray(attenuationDefinition)) {
    return {
      displayName: '<default attenuator>',
      specifier: null,
      params: attenuationDefinition,
    };
  } else {
    return {
      displayName: attenuationDefinition[ATTENUATOR_KEY],
      specifier: attenuationDefinition[ATTENUATOR_KEY],
      params: attenuationDefinition[ATTENUATOR_PARAMS_KEY],
    };
  }
};

// TODO: should be a type guard
const isRecordOf = (item, predicate) => {
  if (typeof item !== 'object' || item === null || isArray(item)) {
    return false;
  }
  return entries(item).every(([key, value]) => predicate(value, key));
};

/**
 * Type guard for `boolean`
 * @param {unknown} item
 * @returns {item is boolean}
 */
const isBoolean = item => typeof item === 'boolean';

// TODO: should be a type guard
const predicateOr =
  (...predicates) =>
  item =>
    predicates.some(p => p(item));

/**
 * @param {unknown} item
 * @returns {item is import('./types.js').PolicyItem}
 */
const isPolicyItem = item =>
  item === undefined ||
  item === WILDCARD_POLICY_VALUE ||
  isRecordOf(item, isBoolean) ||
  isRecordOf(item, value => value === DYNAMIC_POLICY_VALUE);

/**
 * This asserts (i.e., throws) that `allegedPackagePolicy` is a valid `PackagePolicy`.
 *
 * Mild-mannered during the day, but fights crime at night as a type guard.
 *
 * @param {unknown} allegedPackagePolicy - Alleged `PackagePolicy` to test
 * @param {string} path - Path in the `Policy` object; used for error messages only
 * @param {string} [url] - URL of the policy file; used for error messages only
 * @returns {asserts allegedPackagePolicy is import('./types.js').PackagePolicy|undefined}
 */
export const assertPackagePolicy = (allegedPackagePolicy, path, url) => {
  if (allegedPackagePolicy === undefined) {
    return;
  }
  const inUrl = url ? ` in ${q(url)}` : '';

  const packagePolicy = Object(allegedPackagePolicy);
  assert(
    allegedPackagePolicy === packagePolicy && !isArray(allegedPackagePolicy),
    `${path} must be an object, got ${q(allegedPackagePolicy)}${inUrl}`,
  );
  const {
    packages,
    builtins,
    globals,
    noGlobalFreeze,
    defaultAttenuator: _ignore, // a carve out for the default attenuator in compartment map
    ...extra
  } = packagePolicy;

  assert(
    keys(extra).length === 0,
    `${path} must not have extra properties, got ${q(keys(extra))}${inUrl}`,
  );

  assert(
    noGlobalFreeze === undefined || typeof noGlobalFreeze === 'boolean',
    `${path}.noGlobalFreeze must be a boolean, got ${q({
      noGlobalFreeze,
    })}${inUrl}`,
  );

  isPolicyItem(packages) ||
    assert.fail(
      `${path}.packages must be a record of booleans, got ${q({
        packages,
      })}${inUrl}`,
    );

  isPolicyItem(globals) ||
    isAttenuationDefinition(globals) ||
    assert.fail(
      `${path}.globals must be a record of booleans or a single attenuation, got ${q(
        {
          globals,
        },
      )}${inUrl}`,
    );

  isPolicyItem(builtins) ||
    isRecordOf(builtins, predicateOr(isBoolean, isAttenuationDefinition)) ||
    assert.fail(
      `${path}.builtins must be a record of booleans or attenuations, got ${q({
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
 * @returns {asserts allegedPolicy is import('./types.js').Policy|undefined}
 */
export const assertPolicy = allegedPolicy => {
  if (allegedPolicy === undefined) {
    return;
  }
  const policy = Object(allegedPolicy);
  assert(
    allegedPolicy === policy && !Array.isArray(policy),
    `policy must be an object, got ${allegedPolicy}`,
  );

  const { resources, entry, defaultAttenuator, ...extra } = policy;
  assert(
    keys(extra).length === 0,
    `policy must not have extra properties, got ${q(keys(extra))}`,
  );

  assert(
    typeof resources === 'object' && resources !== null && !isArray(resources),
    `policy.resources must be an object, got ${q(resources)}`,
  );
  assert(
    !defaultAttenuator || typeof defaultAttenuator === 'string',
    `policy.defaultAttenuator must be a string, got ${q(defaultAttenuator)}`,
  );

  assertPackagePolicy(entry, `policy.entry`);

  for (const [key, value] of entries(resources)) {
    assertPackagePolicy(value, `policy.resources["${key}"]`);
  }
};

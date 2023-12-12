// @ts-check

/** @typedef {import('./types.js').AttenuationDefinition} AttenuationDefinition */
/** @typedef {import('./types.js').UnifiedAttenuationDefinition} UnifiedAttenuationDefinition */

const { entries, keys } = Object;
const { isArray } = Array;
const q = JSON.stringify;

const ATTENUATOR_KEY = 'attenuate';
const ATTENUATOR_PARAMS_KEY = 'params';
const WILDCARD_POLICY_VALUE = 'any';
const POLICY_FIELDS_LOOKUP = ['builtins', 'globals', 'packages'];

/**
 *
 * @param {object} packagePolicy
 * @param {string} field
 * @param {string} itemName
 * @returns {boolean | object}
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
  if (packagePolicy[field][itemName]) {
    return packagePolicy[field][itemName];
  }
  return false;
};

/**
 * Checks if the policy value is set to wildcard to allow everything
 *
 * @param {any} policyValue
 * @returns {boolean}
 */
export const isAllowingEverything = policyValue =>
  policyValue === WILDCARD_POLICY_VALUE;

/**
 *
 * @param {AttenuationDefinition} potentialDefinition
 * @returns {boolean}
 */
export const isAttenuationDefinition = potentialDefinition => {
  return (
    (typeof potentialDefinition === 'object' &&
      typeof potentialDefinition[ATTENUATOR_KEY] === 'string') || // object with attenuator name
    isArray(potentialDefinition) // params for default attenuator
  );
};

/**
 *
 * @param {AttenuationDefinition} attenuationDefinition
 * @returns {UnifiedAttenuationDefinition}
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

const isRecordOf = (item, predicate) => {
  if (typeof item !== 'object' || item === null || isArray(item)) {
    return false;
  }
  return entries(item).every(([key, value]) => predicate(value, key));
};
const isBoolean = item => typeof item === 'boolean';
const predicateOr =
  (...predicates) =>
  item =>
    predicates.some(p => p(item));
const isPolicyItem = item =>
  item === undefined ||
  item === WILDCARD_POLICY_VALUE ||
  isRecordOf(item, isBoolean);

/**
 *
 * @param {unknown} allegedPackagePolicy
 * @param {string} path
 * @param {string} [url]
 * @returns {void}
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
 *
 * @param {unknown} allegedPolicy
 * @returns {void}
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

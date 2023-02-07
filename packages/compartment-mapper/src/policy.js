// @ts-check

/** @typedef {import('./types.js').PackageNamingKit} PackageNamingKit */

const { create, entries, values, assign, keys, freeze } = Object;
const q = JSON.stringify;

const copyGlobals = (globals, list) => {
  const copy = create(null);
  if (list && list.length > 0) {
    for (let index = 0; index < list.length; index += 1) {
      const key = list[index];
      // If an endowment is missing, global value is undefined.
      // This is an expected behavior if globals are used for platform feature detection
      copy[key] = globals[key];
    }
  }
  return copy;
};

/**
 * Const string to identify the internal attenuators compartment
 */
export const ATTENUATORS_COMPARTMENT = '<ATTENUATORS>';

const collectAttenuators = (attenuators, policyFragment) => {
  if (policyFragment.attenuate) {
    attenuators.push(policyFragment.attenuate);
  }
  for (const value of values(policyFragment)) {
    if (typeof value === 'object' && value !== null) {
      collectAttenuators(attenuators, value);
    }
  }
};

const attenuatorsCache = new WeakMap();
/**
 * Goes through policy and lists all attenuator specifiers used.
 * Memoization keyed on policy object reference
 *
 * @param {object} policy
 * @returns {Array<string>} attenuators
 */
export const detectAttenuators = policy => {
  if (!policy) {
    return [];
  }
  if (!attenuatorsCache.has(policy)) {
    const attenuators = [];
    collectAttenuators(attenuators, policy);
    attenuatorsCache.set(policy, attenuators);
  }
  return attenuatorsCache.get(policy);
};

/**
 * Generates a string identifying a package for policy lookup purposes.
 *
 * @param {PackageNamingKit} namingKit
 * @returns {string}
 */
const generateCanonicalName = ({ isEntry = false, name, path }) => {
  if (isEntry) {
    throw Error('Entry module cannot be identified with a canonicalName');
  }
  if (name === ATTENUATORS_COMPARTMENT) {
    return ATTENUATORS_COMPARTMENT;
  }
  return path.join('>');
};

const POLICY_FIELDS = ['builtins', 'globals', 'packages'];

/**
 *
 * @param {Object} packagePolicy
 * @param {string} field
 * @param {string} itemName
 * @returns {boolean|Object}
 */
const policyLookupHelper = (packagePolicy, field, itemName) => {
  if (!POLICY_FIELDS.includes(field)) {
    throw Error(`Invalid field ${q(field)}`);
  }
  if (
    typeof packagePolicy !== 'object' ||
    packagePolicy === null ||
    !packagePolicy[field]
  ) {
    return false;
  }

  if (packagePolicy[field] === 'any') {
    return true;
  }
  if (packagePolicy[field][itemName]) {
    return packagePolicy[field][itemName];
  }
  return false;
};

/**
 * Verifies if a module identified by namingKit can be a dependency of a package per packagePolicy.
 * packagePolicy is required, when policy is not set, skipping needs to be handled by the caller.
 *
 * @param {PackageNamingKit} namingKit
 * @param {*} packagePolicy
 * @returns {boolean}
 */
export const dependencyAllowedByPolicy = (namingKit, packagePolicy) => {
  if (namingKit.isEntry) {
    // dependency on entry compartment should never be allowed
    return false;
  }
  const canonicalName = generateCanonicalName(namingKit);
  return !!policyLookupHelper(packagePolicy, 'packages', canonicalName);
};

const validateDependencies = (policy, canonicalName) => {
  const packages = policy.resources[canonicalName].packages;
  if (!packages || packages === 'any') {
    return;
  }

  const packageNames = keys(packages);
  const attenuators = detectAttenuators(policy);
  // Join attenuators with packageNames into a Set to deduplicate and check if all are listed in policy.resources
  const allSpecifiers = new Set([...packageNames, ...attenuators]);
  for (const specifier of allSpecifiers) {
    if (!(specifier in policy.resources)) {
      throw Error(
        `Package ${q(specifier)} is allowed for ${q(
          canonicalName,
        )} to import but its policy is not defined. Please add a policy for ${q(
          specifier,
        )}`,
      );
    }
  }
};

/**
 * Returns the policy applicable to the canonicalName of the package
 *
 * @param {PackageNamingKit} namingKit - a key in the policy resources spec is derived frm these
 * @param {object|undefined} policy - user supplied policy
 * @returns {object|undefined} packagePolicy if policy was specified
 */
export const getPolicyForPackage = (namingKit, policy) => {
  if (!policy) {
    return undefined;
  }
  if (namingKit.isEntry) {
    return policy.entry;
  }
  const canonicalName = generateCanonicalName(namingKit);
  if (canonicalName === ATTENUATORS_COMPARTMENT) {
    return {
      packages: detectAttenuators(policy).reduce((packages, specifier) => {
        packages[specifier] = true;
        return packages;
      }, {}),
    };
  }
  if (policy.resources && policy.resources[canonicalName]) {
    validateDependencies(policy, canonicalName);
    return policy.resources[canonicalName];
  } else {
    console.warn(
      `No policy for '${canonicalName}', omitting from compartment map.`,
    );
    return undefined;
  }
};

const getGlobalsList = packagePolicy => {
  if (!packagePolicy.globals) {
    return [];
  }
  // TODO: handle 'write' policy: https://github.com/endojs/endo/issues/1482
  return entries(packagePolicy.globals)
    .filter(([_key, value]) => value)
    .map(([key, _vvalue]) => key);
};

/**
 * Filters available globals and returns a copy according to the policy
 *
 * @param {object} globals
 * @param {object} packagePolicy
 * @returns {object} limitedGlobals
 */
export const getAllowedGlobals = (globals, packagePolicy) => {
  if (!packagePolicy || packagePolicy.globals === 'any') {
    return globals;
  }
  const list = getGlobalsList(packagePolicy);
  return copyGlobals(globals, list);
};

/**
 * Throws if importing of the specifier is not allowed by the policy
 *
 * @param {string} specifier
 * @param {object} compartmentDescriptor
 * @param {object} [info]
 */
export const assertModulePolicy = (specifier, compartmentDescriptor, info) => {
  const { policy, modules } = compartmentDescriptor;
  if (!policy) {
    return;
  }

  if (!info.exit) {
    if (!modules[specifier]) {
      throw Error(
        `Importing '${specifier}' was not allowed by policy packages:${q(
          policy.packages,
        )}`,
      );
    }
    return;
  }

  if (!policyLookupHelper(policy, 'builtins', specifier)) {
    throw Error(
      `Importing '${specifier}' was not allowed by policy 'builtins':${q(
        policy.builtins,
      )}`,
    );
  }
};

function attenuateModule({ attenuators, name, params, originalModule }) {
  if (!attenuators) {
    throw Error(
      `Attenuation '${name}' in policy doesn't have a corresponding implementation.`,
    );
  }
  const attenuationCompartment = new Compartment(
    {},
    {},
    {
      name,
      resolveHook: moduleSpecifier => moduleSpecifier,
      importHook: async () => {
        const {
          namespace: { attenuate },
        } = await attenuators(name);
        const ns = await attenuate(params, originalModule);
        const staticModuleRecord = freeze({
          imports: [],
          exports: keys(ns),
          execute: moduleExports => {
            assign(moduleExports, ns);
          },
        });
        return staticModuleRecord;
      },
    },
  );
  return attenuationCompartment.module('.');
}

/**
 * Throws if importing of the specifier is not allowed by the policy
 *
 * @param {string} specifier - exit module name
 * @param {object} originalModule - reference to the exit module
 * @param {object} policy - local compartment policy
 * @param {object} attenuators - a key-value where attenuations can be found
 */
export const attenuateModuleHook = (
  specifier,
  originalModule,
  policy,
  attenuators,
) => {
  const policyValue = policyLookupHelper(policy, 'builtins', specifier);
  if (!policy || policyValue === true) {
    return originalModule;
  }

  if (!policyValue) {
    throw Error(
      `Attenuation failed '${specifier}' was not in policy builtins:${q(
        policy.builtins,
      )}`,
    );
  }

  return attenuateModule({
    attenuators,
    name: policyValue.attenuate,
    params: policyValue.params,
    originalModule,
  });
};

const padDiagnosis = text => ` (${text})`;
/**
 * Provide dignostic information for a missing compartment error
 *
 * @param {object}  args
 * @param {string}  args.moduleSpecifier
 * @param {object}  args.compartmentDescriptor
 * @param {string}  args.foreignModuleSpecifier
 * @param {string}  args.foreignCompartmentName
 * @returns {string}
 */
export const diagnoseMissingCompartmentError = ({
  moduleSpecifier,
  compartmentDescriptor,
  foreignModuleSpecifier,
  foreignCompartmentName,
}) => {
  const { policy, name, scopes } = compartmentDescriptor;

  if (policy) {
    if (!policy.packages) {
      return padDiagnosis(
        `There were no allowed packages specified in policy for ${q(name)}`,
      );
    }
    if (name === ATTENUATORS_COMPARTMENT) {
      return padDiagnosis(
        `Attenuator ${q(
          moduleSpecifier,
        )} was imported but there is no policy resources entry defined for it.`,
      );
    }

    const scopeNames = entries(scopes)
      .filter(([_name, scope]) => scope.compartment === foreignCompartmentName)
      .map(([scopeName]) => scopeName);
    if (scopeNames.length === 1 && scopeNames[0] === moduleSpecifier) {
      return padDiagnosis(
        `Package ${q(
          moduleSpecifier,
        )} is missing. Are you sure there is an entry in policy resources specified for it?`,
      );
    } else {
      return padDiagnosis(
        `Package ${q(moduleSpecifier)} resolves to ${q(
          foreignModuleSpecifier,
        )} in ${q(
          foreignCompartmentName,
        )} which seems disallowed by policy. There is likely an override defined that causes another package to be imported as ${q(
          moduleSpecifier,
        )}.`,
      );
    }
  }
  // Omit diagnostics when parent package had no policy - it means there was no policy.
  return '';
};

// @ts-check

/** @typedef {import('./types.js').PolicyIdentityComponents} PolicyIdentityComponents */

const { create, entries, assign, keys, freeze } = Object;
const { stringify } = JSON;

const copyGlobals = (globals, list) => {
  const g = create(null);
  if (list && list.length > 0) {
    for (let k = 0; k < list.length; k += 1) {
      const key = list[k];
      // If an endowment is missing, global value is undeinfed.
      // This is an expected behavior if globals are used for platform feature detection
      g[key] = globals[key];
    }
  }
  return g;
};

/**
 * Const string to identify the internal attenuators compartment
 */
export const ATTENUATORS_COMPARTMENT = '<ATTENUATORS>';

const attenuatorsCache = new WeakMap();
/**
 * Goes through policy and lists all attenuator specifiers used.
 * Memoization keyed on policy object reference
 *
 * @param {*} policy
 * @returns {Array<string>} attenuators
 */
export const detectAttenuators = policy => {
  if (!attenuatorsCache.has(policy)) {
    const attenuators = [];
    // a free recursive visitor implementation for simple objects
    stringify(policy, (key, value) => {
      if (key === 'attenuate' && typeof value === 'string') {
        attenuators.push(value);
      }
      return value;
    });
    attenuatorsCache.set(policy, attenuators);
  }
  return attenuatorsCache.get(policy);
};

/**
 * Generates an ID for the package for policy purposes.
 * Some arguments here are for future proofing - I could imagine using them for IDs instead
 *
 * @param {PolicyIdentityComponents} identityComponents
 * @returns {string}
 */
const generatePolicyId = ({ isEntry = false, name, path }) => {
  if (isEntry) {
    return '<root>';
  }
  if (name === ATTENUATORS_COMPARTMENT) {
    return ATTENUATORS_COMPARTMENT;
  }
  return path.join('>');
};

/**
 * Verifies if a module identified by identityComponents can be a dependency of a package per packagePolicy
 * packagePolicy is required, when policy is not set skipping needs to be handled by the caller
 *
 * @param {PolicyIdentityComponents} identityComponents
 * @param {*} packagePolicy
 * @returns {boolean}
 */
export const dependencyAllowedByPolicy = (
  identityComponents,
  packagePolicy,
) => {
  const policyId = generatePolicyId(identityComponents);
  return packagePolicy.packages && !!packagePolicy.packages[policyId];
};

const validateDependencies = (policy, id) => {
  const packages = policy.resources[id].packages;
  if (!packages) {
    return;
  }

  const packageIds = keys(packages);
  const attenuators = detectAttenuators(policy);
  // join attenuators with packageIds into a Set to deduplicate and check if all are listed in policy.resources
  const allSpecifiers = new Set([...packageIds, ...attenuators]);
  for (const specifier of allSpecifiers) {
    if (!(specifier in policy.resources)) {
      throw Error(
        `Package "${specifier}" is allowed for "${id}" to import but its policy is not defined. Please add a policy for "${specifier}"`,
      );
    }
  }
};

/**
 * Returns the policy applicable to the id - either by taking from user
 * supplied policy or returning localPolicy if user didn't specify one at runtime.
 *
 * @param {PolicyIdentityComponents} identityComponents - a key in the policy resources spec
 * @param {Object|undefined} policy - user supplied policy
 * @returns {Object|undefined} policy fragment if policy was specified
 */
export const getPolicyFor = (identityComponents, policy) => {
  const id = generatePolicyId(identityComponents);
  if (!policy) {
    return undefined;
  }
  if (id === ATTENUATORS_COMPARTMENT) {
    return {
      packages: detectAttenuators(policy).reduce((packages, specifier) => {
        packages[specifier] = true;
        return packages;
      }, {}),
    };
  }
  if (policy.resources && policy.resources[id]) {
    validateDependencies(policy, id);
    return policy.resources[id];
  } else {
    console.warn(`No policy for '${id}', omitting from compartment map.`);
    return undefined;
  }
};

const getGlobalsList = myPolicy => {
  if (!myPolicy.globals) {
    return [];
  }
  // TODO: handle 'write' policy
  return entries(myPolicy.globals)
    .filter(([_k, v]) => v)
    .map(([k, _v]) => k);
};

/**
 * Filters available globals and returns a copy according to the policy
 *
 * @param {Object} globals
 * @param {Object} localPolicy
 * @returns {Object} limitedGlobals
 */
export const getAllowedGlobals = (globals, localPolicy) => {
  if (!localPolicy) {
    return globals;
  }
  const list = getGlobalsList(localPolicy);
  return copyGlobals(globals, list);
};

/**
 * Throws if importing of the specifier is not allowed by the policy
 *
 * @param {string} specifier
 * @param {Object} compartmentDescriptor
 * @param {Object} [info]
 */
export const gatekeepModuleAccess = (
  specifier,
  compartmentDescriptor,
  info,
) => {
  const { policy, modules } = compartmentDescriptor;
  if (!policy) {
    return;
  }

  if (!info.exit) {
    if (!modules[specifier]) {
      throw Error(
        `Importing '${specifier}' was not allowed by policy packages:${JSON.stringify(
          policy.packages,
        )}`,
      );
    }
    return;
  }

  if (!policy.builtins || !policy.builtins[specifier]) {
    throw Error(
      `Importing '${specifier}' was not allowed by policy 'builtins':${JSON.stringify(
        policy.builtins,
      )}`,
    );
  }
};

function attenuateModule({ attenuators, name, params, originalModule }) {
  if (!attenuators) {
    // TODO: figure out what to pass here or where to move this check
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
 * @param {Object} originalModule - reference to the exit module
 * @param {Object} policy - local compartment policy
 * @param {Object} attenuators - a key-value where attenuations can be found
 */
export const attenuateModuleHook = (
  specifier,
  originalModule,
  policy,
  attenuators,
) => {
  if (policy && (!policy.builtins || !policy.builtins[specifier])) {
    throw Error(
      `Attenuation failed '${specifier}' was not in policy builtins:${stringify(
        policy.builtins,
      )}`,
    );
  }
  if (!policy || policy.builtins[specifier] === true) {
    return originalModule;
  }

  return attenuateModule({
    attenuators,
    name: policy.builtins[specifier].attenuate,
    params: policy.builtins[specifier].params,
    originalModule,
  });
};

const padDiagnosis = text => ` (${text})`;
/**
 * Provide dignostic information for a missing compartment error
 *
 * @param {Object}  params
 * @param {string}  params.moduleSpecifier
 * @param {Object}  params.compartmentDescriptor
 * @param {string}  params.foreignModuleSpecifier
 * @param {string}  params.foreignCompartmentName
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
        `There were no allowed packages specified in policy for "${name}"`,
      );
    }
    if (name === ATTENUATORS_COMPARTMENT) {
      return padDiagnosis(
        `Attenuator "${moduleSpecifier}" was imported but there is no policy resources entry defined for it.`,
      );
    }

    const scopeNames = entries(scopes)
      .filter(([_name, scope]) => scope.compartment === foreignCompartmentName)
      .map(([n]) => n);
    if (scopeNames.length === 1 && scopeNames[0] === moduleSpecifier) {
      return padDiagnosis(
        `Package "${moduleSpecifier}" is missing. Are you sure there is an entry in policy resources specified for it?`,
      );
    } else {
      return padDiagnosis(
        `Package "${moduleSpecifier}" resolves to "${foreignModuleSpecifier}" in "${foreignCompartmentName}" which seems disallowed by policy. There is likely an override defined that causes another package to be imported as "${moduleSpecifier}".`,
      );
    }
  }
  // Omit diagnostics when parent package had no policy - it means there was no policy.
  return '';
};

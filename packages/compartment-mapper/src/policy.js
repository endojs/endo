// @ts-check

const { create, entries, assign, keys, freeze } = Object;
const { has } = Reflect;
const { stringify } = JSON;

const copyGlobals = (globals, list) => {
  const g = create(null);
  if (list && list.length > 0) {
    for (let k = 0; k < list.length; k += 1) {
      const key = list[k];
      if (!has(globals, key)) {
        throw Error(
          `Policy specifies a global named ${key} but it has not been endowed to the application.`,
        );
      }
      g[key] = globals[key];
    }
  }
  return g;
};
const adaptId = id => {
  const chunks = id.replace(/\/$/, '').split('/node_modules/');
  if (chunks.length > 1) {
    chunks.shift();
  }
  return chunks.join('>');
};
export const ATTENUATORS_COMPARTMENT = '<ATTENUATORS>';

const attenuatorsCache = new WeakMap();
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

export const generatePolicyId = ({
  location,
  isEntry = false,
  label,
  name,
  path,
}) => {
  if (isEntry) {
    return '<root>';
  }
  if (name === ATTENUATORS_COMPARTMENT) {
    return ATTENUATORS_COMPARTMENT;
  }
  const chunks = location.replace(/\/$/, '').split('/node_modules/');
  if (chunks.length > 1) {
    chunks.shift();
  }
  return chunks.join('>');
};
/**
 * Returns the policy applicable to the id - either by taking from user
 * supplied policy or returning localPolicy if user didn't specify one at runtime.
 *
 * @param {string} id - a key in the policy resources spec
 * @param {Object|undefined} policy - user supplied policy
 * @returns {Object|undefined} policy fragment if policy was specified
 */
export const getPolicyFor = (id, policy) => {
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
    return policy.resources[id];
  } else {
    console.warn(`No policy for '${id}'`);
    return {};
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
 * @param {Object} policy
 * @param {Object} [info]
 */
export const gatekeepModuleAccess = (specifier, policy, info) => {
  const policyChoice = info.exit ? 'builtin' : 'packages';
  if (policy && (!policy[policyChoice] || !policy[policyChoice][specifier])) {
    // console.trace(specifier);
    throw Error(
      `Importing '${specifier}' was not allowed by policy ${policyChoice}:${JSON.stringify(
        policy[policyChoice],
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
  if (policy && (!policy.builtin || !policy.builtin[specifier])) {
    throw Error(
      `Attenuation failed '${specifier}' was not in policy builtin:${stringify(
        policy.builtin,
      )}`,
    );
  }
  if (!policy || policy.builtin[specifier] === true) {
    return originalModule;
  }

  return attenuateModule({
    attenuators,
    name: policy.builtin[specifier].attenuate,
    params: policy.builtin[specifier].params,
    originalModule,
  });
};

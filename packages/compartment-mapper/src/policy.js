// @ts-check

import {
  getAttenuatorFromDefinition,
  isAllowingEverything,
  isAttenuationDefinition,
  policyLookupHelper,
} from './policy-format.js';

const { create, entries, values, assign, keys, freeze } = Object;
const q = JSON.stringify;

/**
 * Const string to identify the internal attenuators compartment
 */
export const ATTENUATORS_COMPARTMENT = '<ATTENUATORS>';

/**
 * Copies properties (optionally limited to a specific list) from one object to another.
 *
 * @param {object} from
 * @param {object} to
 * @param {Array<string | symbol>} [list]
 * @returns {object}
 */
const selectiveCopy = (from, to, list) => {
  if (!list) {
    list = keys(from);
  }
  for (let index = 0; index < list.length; index += 1) {
    const key = list[index];
    // If an endowment is missing, global value is undefined.
    // This is an expected behavior if globals are used for platform feature detection
    to[key] = from[key];
  }
  return to;
};

/**
 * Parses an attenuation definition for attenuator names
 *
 * Note: this function is recursive
 * @param {string[]} attenuators - List of attenuator names; may be mutated
 * @param {import('./types.js').AttenuationDefinition|import('./types.js').Policy} policyFragment
 */
const collectAttenuators = (attenuators, policyFragment) => {
  if ('attenuate' in policyFragment) {
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
 * @param {import('./types.js').Policy} [policy]
 * @returns {Array<string>} attenuators
 */
export const detectAttenuators = policy => {
  if (!policy) {
    return [];
  }
  if (!attenuatorsCache.has(policy)) {
    const attenuators = [];
    if (policy.defaultAttenuator) {
      attenuators.push(policy.defaultAttenuator);
    }
    collectAttenuators(attenuators, policy);
    attenuatorsCache.set(policy, attenuators);
  }
  return attenuatorsCache.get(policy);
};

/**
 * Generates a string identifying a package for policy lookup purposes.
 *
 * @param {import('./types.js').PackageNamingKit} namingKit
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

/**
 * Verifies if a module identified by `namingKit` can be a dependency of a package per `packagePolicy`.
 * `packagePolicy` is required, when policy is not set, skipping needs to be handled by the caller.
 *
 * @param {import('./types.js').PackageNamingKit} namingKit
 * @param {import('./types.js').PackagePolicy} packagePolicy
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

/**
 * Returns the policy applicable to the canonicalName of the package
 *
 * @overload
 * @param {import('./types.js').PackageNamingKit} namingKit - a key in the policy resources spec is derived from these
 * @param {import('./types.js').Policy} policy - user supplied policy
 * @returns {import('./types.js').PackagePolicy} packagePolicy if policy was specified
 */

/**
 * Returns `undefined`
 *
 * @overload
 * @param {import('./types.js').PackageNamingKit} namingKit - a key in the policy resources spec is derived from these
 * @param {import('./types.js').Policy} [policy] - user supplied policy
 * @returns {import('./types.js').PackagePolicy|undefined} packagePolicy if policy was specified
 */

/**
 * Returns the policy applicable to the canonicalName of the package
 *
 * @param {import('./types.js').PackageNamingKit} namingKit - a key in the policy resources spec is derived from these
 * @param {import('./types.js').Policy} [policy] - user supplied policy
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
      defaultAttenuator: policy.defaultAttenuator,
      packages: 'any',
    };
  }
  if (policy.resources && policy.resources[canonicalName] !== undefined) {
    return policy.resources[canonicalName];
  } else {
    // Allow skipping policy entries for packages with no powers.
    return create(null);
  }
};

/**
 * Get list of globals from package policy
 * @param {import('./types.js').PackagePolicy} [packagePolicy]
 * @returns {Array<string>}
 */
const getGlobalsList = packagePolicy => {
  if (!packagePolicy || !packagePolicy.globals) {
    return [];
  }
  return entries(packagePolicy.globals)
    .filter(([_key, value]) => value)
    .map(([key, _vvalue]) => key);
};

const GLOBAL_ATTENUATOR = 'attenuateGlobals';
const MODULE_ATTENUATOR = 'attenuateModule';

/**
 * Imports attenuator per its definition and provider
 * @param {import('./types.js').AttenuationDefinition} attenuationDefinition
 * @param {import('./types.js').DeferredAttenuatorsProvider} attenuatorsProvider
 * @param {string} attenuatorExportName
 * @returns {Promise<Function>}
 */
const importAttenuatorForDefinition = async (
  attenuationDefinition,
  attenuatorsProvider,
  attenuatorExportName,
) => {
  if (!attenuatorsProvider) {
    throw Error(`attenuatorsProvider is required to import attenuators`);
  }
  const { specifier, params, displayName } = getAttenuatorFromDefinition(
    attenuationDefinition,
  );
  const attenuator = await attenuatorsProvider.import(specifier);
  if (!attenuator[attenuatorExportName]) {
    throw Error(
      `Attenuator ${q(displayName)} does not export ${q(attenuatorExportName)}`,
    );
  }
  // TODO: uncurry bind for security?
  const attenuate = attenuator[attenuatorExportName].bind(attenuator, params);
  return attenuate;
};

/**
 * Makes an async provider for attenuators
 * @param {Record<string, Compartment>} compartments
 * @param {Record<string, import('./types.js').CompartmentDescriptor>} compartmentDescriptors
 * @returns {import('./types.js').DeferredAttenuatorsProvider}
 */
export const makeDeferredAttenuatorsProvider = (
  compartments,
  compartmentDescriptors,
) => {
  let importAttenuator;
  let defaultAttenuator;
  // Attenuators compartment is not created when there's no policy.
  // Errors should be thrown when the provider is used.
  if (!compartmentDescriptors[ATTENUATORS_COMPARTMENT]) {
    importAttenuator = async () => {
      throw Error(`No attenuators specified in policy`);
    };
  } else {
    defaultAttenuator =
      compartmentDescriptors[ATTENUATORS_COMPARTMENT].policy.defaultAttenuator;

    // At the time of this function being called, attenuators compartment won't
    // exist yet, we need to defer looking them up in the compartment to the
    // time of the import function being called.
    /**
     *
     * @param {string} attenuatorSpecifier
     * @returns {Promise<import('./types.js').Attenuator>}
     */
    importAttenuator = async attenuatorSpecifier => {
      if (!attenuatorSpecifier) {
        if (!defaultAttenuator) {
          throw Error(`No default attenuator specified in policy`);
        }
        attenuatorSpecifier = defaultAttenuator;
      }
      const { namespace } =
        await compartments[ATTENUATORS_COMPARTMENT].import(attenuatorSpecifier);
      return namespace;
    };
  }

  return {
    import: importAttenuator,
  };
};

/**
 * Attenuates the `globalThis` object
 *
 * @param {object} options
 * @param {import('./types.js').DeferredAttenuatorsProvider} options.attenuators
 * @param {import('./types.js').AttenuationDefinition} options.attenuationDefinition
 * @param {object} options.globalThis
 * @param {object} options.globals
 */
async function attenuateGlobalThis({
  attenuators,
  attenuationDefinition,
  globalThis,
  globals,
}) {
  const attenuate = await importAttenuatorForDefinition(
    attenuationDefinition,
    attenuators,
    GLOBAL_ATTENUATOR,
  );

  // attenuate can either define properties on globalThis on its own,
  // or return an object with properties to transfer onto globalThis.
  // The latter is consistent with how module attenuators work so that
  // one attenuator implementation can be used for both if use of
  // defineProperty is not needed for attenuating globals.

  // Globals attenuator could be made async by adding a single `await`
  // here, but module attenuation must be synchronous, so we make it
  // synchronous too for consistency.

  // For async attenuators see PR https://github.com/endojs/endo/pull/1535

  const result = /* await */ attenuate(globals, globalThis);
  if (typeof result === 'object' && result !== null) {
    assign(globalThis, result);
  }
}

/**
 * Filters available globals and returns a copy according to the policy
 *
 * @param {object} globalThis
 * @param {object} globals
 * @param {import('./types.js').PackagePolicy} packagePolicy
 * @param {import('./types.js').DeferredAttenuatorsProvider} attenuators
 * @param {Array<Promise>} pendingJobs
 * @param {string} name
 * @returns {void}
 */
export const attenuateGlobals = (
  globalThis,
  globals,
  packagePolicy,
  attenuators,
  pendingJobs,
  name = '<unknown>',
) => {
  let freezeGlobalThisUnlessOptedOut = () => {
    freeze(globalThis);
  };
  if (packagePolicy && packagePolicy.noGlobalFreeze) {
    freezeGlobalThisUnlessOptedOut = () => {};
  }
  if (!packagePolicy || isAllowingEverything(packagePolicy.globals)) {
    selectiveCopy(globals, globalThis);
    freezeGlobalThisUnlessOptedOut();
    return;
  }
  if (isAttenuationDefinition(packagePolicy.globals)) {
    const attenuationDefinition = packagePolicy.globals;
    const { displayName } = getAttenuatorFromDefinition(attenuationDefinition);
    const attenuationPromise = Promise.resolve() // delay to next tick while linking is synchronously finalized
      .then(() =>
        attenuateGlobalThis({
          attenuators,
          attenuationDefinition,
          globalThis,
          globals,
        }),
      )
      .then(freezeGlobalThisUnlessOptedOut, error => {
        freezeGlobalThisUnlessOptedOut();
        throw Error(
          `Error while attenuating globals for ${q(name)} with ${q(
            displayName,
          )}: ${q(error.message)}`, // TODO: consider an option to expose stacktrace for ease of debugging
        );
      });
    pendingJobs.push(attenuationPromise);

    return;
  }
  const list = getGlobalsList(packagePolicy);
  selectiveCopy(globals, globalThis, list);
  freezeGlobalThisUnlessOptedOut();
};

/**
 * @param {string} [errorHint]
 * @returns {string}
 */
const diagnoseModulePolicy = errorHint => {
  if (!errorHint) {
    return '';
  }
  return ` (info: ${errorHint})`;
};

/**
 * Options for {@link enforceModulePolicy}
 * @typedef EnforceModulePolicyOptions
 * @property {boolean} [exit] - Whether it is an exit module
 * @property {string} [errorHint] - Error hint message
 */

/**
 * Throws if importing of the specifier is not allowed by the policy
 *
 * @param {string} specifier
 * @param {import('./types.js').CompartmentDescriptor} compartmentDescriptor
 * @param {EnforceModulePolicyOptions} [options]
 */
export const enforceModulePolicy = (
  specifier,
  compartmentDescriptor,
  { exit, errorHint } = {},
) => {
  const { policy, modules, label } = compartmentDescriptor;
  if (!policy) {
    return;
  }

  if (!exit) {
    if (!modules[specifier]) {
      throw Error(
        `Importing ${q(specifier)} in ${q(
          label,
        )} was not allowed by packages policy ${q(
          policy.packages,
        )}${diagnoseModulePolicy(errorHint)}`,
      );
    }
    return;
  }

  if (!policyLookupHelper(policy, 'builtins', specifier)) {
    throw Error(
      `Importing ${q(specifier)} was not allowed by policy builtins:${q(
        policy.builtins,
      )}${diagnoseModulePolicy(errorHint)}`,
    );
  }
};

/**
 * Attenuates a module
 * @param {object} options
 * @param {import('./types.js').DeferredAttenuatorsProvider} options.attenuators
 * @param {import('./types.js').AttenuationDefinition} options.attenuationDefinition
 * @param {import('ses').ThirdPartyStaticModuleInterface} options.originalModuleRecord
 * @returns {Promise<import('ses').ThirdPartyStaticModuleInterface>}
 */
async function attenuateModule({
  attenuators,
  attenuationDefinition,
  originalModuleRecord,
}) {
  const attenuate = await importAttenuatorForDefinition(
    attenuationDefinition,
    attenuators,
    MODULE_ATTENUATOR,
  );

  // An async attenuator maker could be introduced here to return a synchronous attenuator.
  // For async attenuators see PR https://github.com/endojs/endo/pull/1535

  return freeze({
    imports: originalModuleRecord.imports,
    // It seems ok to declare the exports but then let the attenuator trim the values.
    // Seems ok for attenuation to leave them undefined - accessing them is malicious behavior.
    exports: originalModuleRecord.exports,
    execute: (moduleExports, compartment, resolvedImports) => {
      const ns = {};
      originalModuleRecord.execute(ns, compartment, resolvedImports);
      const attenuated = attenuate(ns);
      moduleExports.default = attenuated;
      assign(moduleExports, attenuated);
    },
  });
}

/**
 * Throws if importing of the specifier is not allowed by the policy
 *
 * @param {string} specifier - exit module name
 * @param {import('ses').ThirdPartyStaticModuleInterface} originalModuleRecord - reference to the exit module
 * @param {import('./types.js').PackagePolicy} policy - local compartment policy
 * @param {import('./types.js').DeferredAttenuatorsProvider} attenuators - a key-value where attenuations can be found
 * @returns {Promise<import('ses').ThirdPartyStaticModuleInterface>} - the attenuated module
 */
export const attenuateModuleHook = async (
  specifier,
  originalModuleRecord,
  policy,
  attenuators,
) => {
  const policyValue = policyLookupHelper(policy, 'builtins', specifier);
  if (!policy || policyValue === true) {
    return originalModuleRecord;
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
    attenuationDefinition: policyValue,
    originalModuleRecord,
  });
};

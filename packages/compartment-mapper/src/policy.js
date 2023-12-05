// @ts-check

/** @typedef {import('./types.js').PackageNamingKit} PackageNamingKit */
/** @typedef {import('./types.js').AttenuationDefinition} AttenuationDefinition */
/** @typedef {import('./types.js').FullAttenuationDefinition} FullAttenuationDefinition */
/** @typedef {import('./types.js').ImplicitAttenuationDefinition} ImplicitAttenuationDefinition */
/** @typedef {import('./types.js').Attenuator} Attenuator */
/** @typedef {import('./types.js').DeferredAttenuatorsProvider} DeferredAttenuatorsProvider */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
// get StaticModuleRecord from the ses package's types
/** @typedef {import('ses').ThirdPartyStaticModuleInterface} ThirdPartyStaticModuleInterface */

import {
  policyLookupHelper,
  isAttenuationDefinition,
  getAttenuatorFromDefinition,
  isAllowingEverything,
} from './policy-format.js';

const { entries, values, assign, keys, freeze } = Object;
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

/**
 * Verifies if a module identified by namingKit can be a dependency of a package per packagePolicy.
 * packagePolicy is required, when policy is not set, skipping needs to be handled by the caller.
 *
 * @param {PackageNamingKit} namingKit
 * @param {any} packagePolicy
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
  if (!packages || isAllowingEverything(packages)) {
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
      defaultAttenuator: policy.defaultAttenuator,
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
  return entries(packagePolicy.globals)
    .filter(([_key, value]) => value)
    .map(([key, _vvalue]) => key);
};

const GLOBAL_ATTENUATOR = 'attenuateGlobals';
const MODULE_ATTENUATOR = 'attenuateModule';
/**
 *
 * @param {AttenuationDefinition} attenuationDefinition
 * @param {DeferredAttenuatorsProvider} attenuatorsProvider
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
 *
 * @param {Record<string, Compartment>} compartments
 * @param {Record<string, CompartmentDescriptor>} compartmentDescriptors
 * @returns {DeferredAttenuatorsProvider}
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
     * @returns {Promise<Attenuator>}
     */
    importAttenuator = async attenuatorSpecifier => {
      if (!attenuatorSpecifier) {
        if (!defaultAttenuator) {
          throw Error(`No default attenuator specified in policy`);
        }
        attenuatorSpecifier = defaultAttenuator;
      }
      const { namespace } = await compartments[ATTENUATORS_COMPARTMENT].import(
        attenuatorSpecifier,
      );
      return namespace;
    };
  }

  return {
    import: importAttenuator,
  };
};

/**
 *
 * @param {object} options
 * @param {DeferredAttenuatorsProvider} options.attenuators
 * @param {AttenuationDefinition} options.attenuationDefinition
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
 * @param {object} packagePolicy
 * @param {DeferredAttenuatorsProvider} attenuators
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
 * Throws if importing of the specifier is not allowed by the policy
 *
 * @param {string} specifier
 * @param {object} compartmentDescriptor
 * @param {object} [info]
 */
export const enforceModulePolicy = (specifier, compartmentDescriptor, info) => {
  const { policy, modules } = compartmentDescriptor;
  if (!policy) {
    return;
  }

  if (!info.exit) {
    if (!modules[specifier]) {
      throw Error(
        `Importing ${q(specifier)} was not allowed by policy packages:${q(
          policy.packages,
        )}`,
      );
    }
    return;
  }

  if (!policyLookupHelper(policy, 'builtins', specifier)) {
    throw Error(
      `Importing ${q(specifier)} was not allowed by policy builtins:${q(
        policy.builtins,
      )}`,
    );
  }
};

/**
 *
 * @param {object} options
 * @param {DeferredAttenuatorsProvider} options.attenuators
 * @param {AttenuationDefinition} options.attenuationDefinition
 * @param {ThirdPartyStaticModuleInterface} options.originalModuleRecord
 * @returns {Promise<ThirdPartyStaticModuleInterface>}
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
 * @param {ThirdPartyStaticModuleInterface} originalModuleRecord - reference to the exit module
 * @param {object} policy - local compartment policy
 * @param {DeferredAttenuatorsProvider} attenuators - a key-value where attenuations can be found
 * @returns {Promise<ThirdPartyStaticModuleInterface>} - the attenuated module
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

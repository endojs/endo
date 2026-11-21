/* eslint-disable no-shadow-restricted-names */
/**
 * Provides mechanisms for interacting with Compartment Map runtime policies.
 *
 * @module
 */

/**
 * @import {
 *   Policy,
 *   PackagePolicy,
 *   AttenuationDefinition,
 *   DeferredAttenuatorsProvider,
 *   ImportAttenuatorFn,
 *   ImportNowAttenuatorFn,
 *   CompartmentDescriptor,
 *   Attenuator,
 *   SomePolicy,
 *   PolicyEnforcementField,
 *   SomePackagePolicy,
 *   CompartmentDescriptorWithPolicy,
 *   ModuleConfiguration,
 *   CanonicalName,
 *   UnifiedAttenuationDefinition,
 *   BoundAttenuator,
 * } from './types.js'
 * @import {
 *   ModuleDescriptor,
 *   SourceModuleDescriptor,
 *   VirtualModuleSource,
 * } from 'ses'
 */

import {
  ATTENUATORS_COMPARTMENT,
  ENTRY_COMPARTMENT,
  getAttenuatorFromDefinition,
  isAllowingEverything,
  isAttenuationDefinition,
  policyLookupHelper,
  WILDCARD_POLICY_VALUE,
} from './policy-format.js';

const {
  keys,
  create,
  entries,
  values,
  assign,
  freeze,
  getOwnPropertyDescriptors,
} = Object;
const { ownKeys } = Reflect;
const q = JSON.stringify;

/**
 * Copies properties (optionally limited to a specific list) from one object to another.
 * @template {Record<PropertyKey, any>} T
 * @template {Record<PropertyKey, any>} U
 * @template {Array<Partial<keyof T>>} [K=Array<keyof T>]
 * @param {T} from
 * @param {U} to
 * @param {K} [list]
 * @returns {Omit<U, K[number]> & Pick<T, K[number]>}
 */
const selectiveCopy = (from, to, list) => {
  /** @type {Array<Partial<keyof T>>} */
  let props;
  if (!list) {
    const descs = getOwnPropertyDescriptors(from);
    props = ownKeys(from).filter(key => descs[key].enumerable);
  } else {
    props = list;
  }
  for (let index = 0; index < props.length; index += 1) {
    const key = props[index];
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
 * @param {AttenuationDefinition|Policy} policyFragment
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
 * @param {Policy} [policy]
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
 * Verifies if a module identified by `namingKit` can be a dependency of a package per `packagePolicy`.
 * `packagePolicy` is required, when policy is not set, skipping needs to be handled by the caller.
 *
 * @param {CanonicalName} canonicalName
 * @param {PackagePolicy} packagePolicy
 * @returns {boolean}
 */
export const dependencyAllowedByPolicy = (canonicalName, packagePolicy) => {
  return !!policyLookupHelper(packagePolicy, 'packages', canonicalName);
};

/**
 * Generates the {@link SomePackagePolicy} value to be used in
 * {@link CompartmentDescriptor.policy}
 *
 * @param {CanonicalName | typeof ATTENUATORS_COMPARTMENT | typeof ENTRY_COMPARTMENT} label
 * @param {object} [options] Options
 * @param {SomePolicy} [options.policy] User-supplied policy
 * @returns {SomePackagePolicy|undefined} Package policy from `policy` or empty
 * object; returns `params.packagePolicy` if provided. If entry compartment,
 * returns the `entry` property of the policy verbatim.
 */
export const makePackagePolicy = (label, { policy } = {}) => {
  /** @type {SomePackagePolicy|undefined} */
  let packagePolicy;
  if (!label) {
    throw new TypeError(
      `Invalid arguments: label must be a non-empty string; got ${q(label)}`,
    );
  }
  if (policy) {
    if (label === ATTENUATORS_COMPARTMENT) {
      packagePolicy = {
        defaultAttenuator: policy.defaultAttenuator,
        packages: WILDCARD_POLICY_VALUE,
      };
    } else if (label === ENTRY_COMPARTMENT) {
      packagePolicy = policy.entry;
      // If policy.entry is `undefined`, we return `undefined` which is
      // equivalent to "allow everything".
      return packagePolicy;
    } else if (label) {
      packagePolicy = policy.resources?.[label];
    }
    // An empty object for a package policy is equivalent to "allow nothing"
    return packagePolicy ?? create(null);
  }
  return undefined;
};

/**
 * Get list of globals from package policy
 * @param {PackagePolicy} [packagePolicy]
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
 * Selects the named export of an imported attenuator and binds it to the
 * params of its attenuation definition.
 *
 * @param {Attenuator} attenuator
 * @param {string} attenuatorExportName
 * @param {UnifiedAttenuationDefinition} definition
 * @returns {BoundAttenuator}
 */
const bindAttenuator = (
  attenuator,
  attenuatorExportName,
  { params, displayName },
) => {
  if (!attenuator[attenuatorExportName]) {
    throw Error(
      `Attenuator ${q(displayName)} does not export ${q(attenuatorExportName)}`,
    );
  }
  return attenuator[attenuatorExportName].bind(attenuator, params);
};

/**
 * Imports attenuator per its definition
 * @param {AttenuationDefinition} attenuationDefinition
 * @param {ImportAttenuatorFn} importAttenuator
 * @param {string} attenuatorExportName
 * @returns {Promise<BoundAttenuator>}
 */
const importAttenuatorForDefinition = async (
  attenuationDefinition,
  importAttenuator,
  attenuatorExportName,
) => {
  if (!importAttenuator) {
    throw Error(`importAttenuator is required to import attenuators`);
  }
  const definition = getAttenuatorFromDefinition(attenuationDefinition);
  const attenuator = await importAttenuator(definition.specifier);
  return bindAttenuator(attenuator, attenuatorExportName, definition);
};

/**
 * Synchronously imports attenuator per its definition; the counterpart of
 * {@link importAttenuatorForDefinition} for dynamic requires.
 *
 * @param {AttenuationDefinition} attenuationDefinition
 * @param {ImportNowAttenuatorFn} importAttenuatorNow
 * @param {string} attenuatorExportName
 * @returns {BoundAttenuator}
 */
const importAttenuatorForDefinitionNow = (
  attenuationDefinition,
  importAttenuatorNow,
  attenuatorExportName,
) => {
  if (!importAttenuatorNow) {
    throw Error(`importAttenuatorNow is required to import attenuators`);
  }
  const definition = getAttenuatorFromDefinition(attenuationDefinition);
  const attenuator = importAttenuatorNow(definition.specifier);
  return bindAttenuator(attenuator, attenuatorExportName, definition);
};

/**
 * Makes a provider for attenuators, which can import them asynchronously or
 * (for dynamic requires) synchronously.
 *
 * Consumers should be handed whichever one of the provider's two functions
 * suits them rather than the provider itself, so that a synchronous import hook
 * cannot reach for the asynchronous import and vice versa.
 *
 * @param {Record<string, Compartment>} compartments
 * @param {Record<string, CompartmentDescriptor>} compartmentDescriptors
 * @returns {DeferredAttenuatorsProvider}
 */
export const makeDeferredAttenuatorsProvider = (
  compartments,
  compartmentDescriptors,
) => {
  /** @type {ImportAttenuatorFn} */
  let importAttenuator;
  /** @type {ImportNowAttenuatorFn} */
  let importAttenuatorNow;
  let defaultAttenuator;
  // Attenuators compartment is not created when there's no policy.
  // Errors should be thrown when the provider is used.
  if (!compartmentDescriptors[ATTENUATORS_COMPARTMENT]) {
    importAttenuator = async () => {
      throw Error(`No attenuators specified in policy`);
    };
    importAttenuatorNow = () => {
      throw Error(`No attenuators specified in policy`);
    };
  } else {
    if (!compartmentDescriptors[ATTENUATORS_COMPARTMENT].policy) {
      throw Error(
        `${q(ATTENUATORS_COMPARTMENT)} is missing the required policy; this is likely a bug`,
      );
    }
    defaultAttenuator =
      compartmentDescriptors[ATTENUATORS_COMPARTMENT].policy.defaultAttenuator;

    // At the time of this function being called, attenuators compartment won't
    // exist yet, we need to defer looking them up in the compartment to the
    // time of the import function being called.
    /**
     *
     * @param {string | null} attenuatorSpecifier
     * @returns {Promise<Attenuator>}
     */
    importAttenuator = async attenuatorSpecifier => {
      if (!attenuatorSpecifier) {
        if (!defaultAttenuator) {
          throw Error(`No default attenuator specified in policy`);
        }
        attenuatorSpecifier = defaultAttenuator;
      }
      const attenuatorsCompartment = compartments[ATTENUATORS_COMPARTMENT];
      const result = await attenuatorsCompartment.import(
        /** @type {string} */ (attenuatorSpecifier),
      );
      // A compartment constructed with `__noNamespaceBox__: true` returns the
      // bare namespace from `import` rather than a boxed `{ namespace }`.
      return /** @type {Attenuator} */ (
        // eslint-disable-next-line no-underscore-dangle
        attenuatorsCompartment.__noNamespaceBox__ ? result : result.namespace
      );
    };

    /**
     * An attenuator which has already been imported is served from the
     * attenuators compartment's memo of module instances. Otherwise, the
     * compartment loads it through its `importNowHook`.
     *
     * @param {string | null} attenuatorSpecifier
     * @returns {Attenuator}
     */
    importAttenuatorNow = attenuatorSpecifier => {
      if (!attenuatorSpecifier) {
        if (!defaultAttenuator) {
          throw Error(`No default attenuator specified in policy`);
        }
        attenuatorSpecifier = defaultAttenuator;
      }
      // Unlike `import`, `importNow` never boxes the namespace.
      return /** @type {Attenuator} */ (
        compartments[ATTENUATORS_COMPARTMENT].importNow(
          /** @type {string} */ (attenuatorSpecifier),
        )
      );
    };
  }

  return { import: importAttenuator, importNow: importAttenuatorNow };
};

/**
 * Attenuates the `globalThis` object
 *
 * @param {object} options
 * @param {ImportAttenuatorFn} options.importAttenuator
 * @param {AttenuationDefinition} options.attenuationDefinition
 * @param {object} options.globalThis
 * @param {object} options.globals
 */
async function attenuateGlobalThis({
  importAttenuator,
  attenuationDefinition,
  globalThis,
  globals,
}) {
  const attenuate = await importAttenuatorForDefinition(
    attenuationDefinition,
    importAttenuator,
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
 * @param {PackagePolicy|undefined} packagePolicy
 * @param {ImportAttenuatorFn} importAttenuator
 * @param {Array<Promise>} pendingJobs
 * @param {string} name
 * @returns {void}
 */
export const attenuateGlobals = (
  globalThis,
  globals,
  packagePolicy,
  importAttenuator,
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
          importAttenuator,
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
 * Generates a helpful error message for a policy enforcement failure
 *
 * @param {string} specifier
 * @param {CompartmentDescriptorWithPolicy} referrerCompartmentDescriptor
 * @param {object} options
 * @param {string} [options.resourceCanonicalName]
 * @param {string} [options.errorHint]
 * @param {PolicyEnforcementField} [options.policyField]
 * @returns {string}
 */
const policyEnforcementFailureMessage = (
  specifier,
  { label, policy },
  { resourceCanonicalName, errorHint, policyField = 'packages' } = {},
) => {
  let message = `Importing ${q(specifier)}`;
  if (resourceCanonicalName) {
    message += ` in resource ${q(resourceCanonicalName)}`;
  }
  message += ` in ${q(label)} was not allowed by`;
  if (keys(policy[policyField] ?? {}).length > 0) {
    message += ` ${q(policyField)} policy: ${q(policy[policyField])}`;
  } else {
    message += ` empty ${q(policyField)} policy`;
  }
  if (errorHint) {
    message += ` (info: ${errorHint})`;
  }
  return message;
};

/**
 * @template {ModuleConfiguration} T
 * @param {CompartmentDescriptor<T>} compartmentDescriptor
 * @returns {compartmentDescriptor is CompartmentDescriptorWithPolicy<T>}
 */
const hasPolicy = compartmentDescriptor => !!compartmentDescriptor.policy;

/**
 * Options for {@link enforcePolicyByModule}
 * @typedef EnforceModulePolicyOptions
 * @property {boolean} [exit] - Whether it is an exit module
 * @property {string} [errorHint] - Error hint message
 */

/**
 * Throws if importing of the specifier is not allowed by the policy
 *
 * @param {string} specifier
 * @param {CompartmentDescriptor} compartmentDescriptor
 * @param {EnforceModulePolicyOptions} [options]
 */
export const enforcePolicyByModule = (
  specifier,
  compartmentDescriptor,
  { exit, errorHint } = {},
) => {
  if (!hasPolicy(compartmentDescriptor)) {
    // No policy, no enforcement
    return;
  }
  const { policy, modules } = compartmentDescriptor;

  if (!exit) {
    if (!modules[specifier]) {
      throw Error(
        policyEnforcementFailureMessage(specifier, compartmentDescriptor, {
          errorHint,
        }),
      );
    }

    return;
  }

  if (!policyLookupHelper(policy, 'builtins', specifier)) {
    throw Error(
      policyEnforcementFailureMessage(specifier, compartmentDescriptor, {
        errorHint,
        policyField: 'builtins',
      }),
    );
  }
};

/**
 * Throws if importing `compartmentDescriptor` from `referrerCompartmentDescriptor` is not allowed per package policy
 *
 * @param {CompartmentDescriptor} compartmentDescriptor
 * @param {CompartmentDescriptor} referrerCompartmentDescriptor
 * @param {EnforceModulePolicyOptions} [options]
 */
export const enforcePackagePolicyByCanonicalName = (
  compartmentDescriptor,
  referrerCompartmentDescriptor,
  { errorHint } = {},
) => {
  if (!hasPolicy(referrerCompartmentDescriptor)) {
    throw new Error(
      `Cannot enforce policy via ${q(referrerCompartmentDescriptor.label)}: no package policy defined`,
    );
  }
  const { policy: referrerPolicy } = referrerCompartmentDescriptor;
  const { label: resourceCanonicalName } = compartmentDescriptor;

  if (!policyLookupHelper(referrerPolicy, 'packages', resourceCanonicalName)) {
    throw new Error(
      policyEnforcementFailureMessage(
        resourceCanonicalName,
        referrerCompartmentDescriptor,
        {
          errorHint,
          resourceCanonicalName,
        },
      ),
    );
  }
};

/**
 * Finds the virtual module source of a module descriptor, which is the only
 * kind of source an attenuator can wrap.
 * Other shapes (including NamespaceModuleDescriptor, which is part of
 * StrictModuleDescriptor but has no source to attenuate) pass through
 * unchanged at the call site; this function throws when given a descriptor
 * the attenuator cannot wrap.
 *
 * @param {VirtualModuleSource | SourceModuleDescriptor} moduleDescriptor
 * @returns {VirtualModuleSource}
 */
const getVirtualModuleSource = moduleDescriptor => {
  if ('source' in moduleDescriptor) {
    const { source: moduleSource } = moduleDescriptor;
    if (
      typeof moduleSource !== 'string' &&
      'imports' in moduleSource &&
      'exports' in moduleSource &&
      'execute' in moduleSource
    ) {
      return moduleSource;
    }
  } else if (
    'imports' in moduleDescriptor &&
    'exports' in moduleDescriptor &&
    'execute' in moduleDescriptor
  ) {
    return moduleDescriptor;
  }
  throw new Error(
    `attenuateModule received a non-attenuatable module descriptor: ${q(
      moduleDescriptor,
    )}`,
  );
};

/**
 * Wraps a virtual module source in a module descriptor that applies an
 * attenuator to the module's exports as it executes.
 *
 * Shared by {@link attenuateModule} and {@link attenuateModuleNow} so that
 * static and dynamic loads of an exit module cannot be attenuated differently.
 *
 * @param {VirtualModuleSource} moduleSource
 * @param {BoundAttenuator} attenuate
 * @returns {SourceModuleDescriptor}
 */
const makeAttenuatedModuleDescriptor = (moduleSource, attenuate) =>
  freeze(
    /** @type {SourceModuleDescriptor} */ ({
      // Freeze the returned virtual module source so the attenuator boundary
      // does not hand callers a mutable wrapper they could tamper with after
      // the fact.
      source: freeze(
        /** @type {VirtualModuleSource} */ ({
          imports: moduleSource.imports,
          // It seems ok to declare the exports but then let the attenuator trim the values.
          // Seems ok for attenuation to leave them undefined - accessing them is malicious behavior.
          exports: moduleSource.exports,
          execute: (moduleExports, compartment, resolvedImports) => {
            const ns = {};
            moduleSource.execute(ns, compartment, resolvedImports);
            const attenuated = attenuate(ns);
            moduleExports.default = attenuated;
            assign(moduleExports, attenuated);
          },
        }),
      ),
    }),
  );

/**
 * Attenuates a module descriptor whose source is a virtual module source.
 *
 * @param {object} options
 * @param {ImportAttenuatorFn} options.importAttenuator
 * @param {AttenuationDefinition} options.attenuationDefinition
 * @param {VirtualModuleSource | SourceModuleDescriptor} options.moduleDescriptor
 * @returns {Promise<SourceModuleDescriptor>}
 */
async function attenuateModule({
  importAttenuator,
  attenuationDefinition,
  moduleDescriptor,
}) {
  await null;
  const moduleSource = getVirtualModuleSource(moduleDescriptor);

  // An async attenuator maker could be introduced here to return a synchronous attenuator.
  // For async attenuators see PR https://github.com/endojs/endo/pull/1535
  const attenuate = await importAttenuatorForDefinition(
    attenuationDefinition,
    importAttenuator,
    MODULE_ATTENUATOR,
  );
  return makeAttenuatedModuleDescriptor(moduleSource, attenuate);
}

/**
 * Synchronously attenuates a module descriptor whose source is a virtual
 * module source; the counterpart of {@link attenuateModule} for dynamic
 * requires.
 *
 * @param {object} options
 * @param {ImportNowAttenuatorFn} options.importAttenuatorNow
 * @param {AttenuationDefinition} options.attenuationDefinition
 * @param {VirtualModuleSource | SourceModuleDescriptor} options.moduleDescriptor
 * @returns {SourceModuleDescriptor}
 */
function attenuateModuleNow({
  importAttenuatorNow,
  attenuationDefinition,
  moduleDescriptor,
}) {
  const moduleSource = getVirtualModuleSource(moduleDescriptor);
  const attenuate = importAttenuatorForDefinitionNow(
    attenuationDefinition,
    importAttenuatorNow,
    MODULE_ATTENUATOR,
  );
  return makeAttenuatedModuleDescriptor(moduleSource, attenuate);
}

/**
 * Finds the attenuation which policy demands for an exit module, if any.
 *
 * @param {string} specifier - exit module name
 * @param {PackagePolicy | undefined} policy - local compartment policy
 * @returns {AttenuationDefinition | undefined} The attenuation to apply, or
 * `undefined` if the module is to be used as it is
 * @throws {Error} If policy does not allow the module at all
 */
const getModuleAttenuationDefinition = (specifier, policy) => {
  if (!policy) {
    return undefined;
  }
  const policyValue = policyLookupHelper(policy, 'builtins', specifier);
  if (policyValue === true) {
    return undefined;
  }

  if (!policyValue) {
    throw Error(
      `Attenuation failed '${specifier}' was not in policy builtins:${q(
        policy.builtins,
      )}`,
    );
  }
  return policyValue;
};

/**
 * Throws if importing of the specifier is not allowed by the policy
 *
 * @param {string} specifier - exit module name
 * @param {ModuleDescriptor} moduleDescriptor - reference to the exit module
 * @param {PackagePolicy | undefined} policy - local compartment policy
 * @param {ImportAttenuatorFn} importAttenuator - imports the attenuator which policy names
 * @returns {Promise<ModuleDescriptor>} - the attenuated module descriptor
 */
export const attenuateModuleHook = async (
  specifier,
  moduleDescriptor,
  policy,
  importAttenuator,
) => {
  const attenuationDefinition = getModuleAttenuationDefinition(
    specifier,
    policy,
  );
  if (attenuationDefinition === undefined) {
    return moduleDescriptor;
  }
  // Only virtual module sources and source-bearing descriptors are
  // attenuatable. NamespaceModuleDescriptor (the other half of
  // StrictModuleDescriptor) has no source to wrap. attenuateModule throws
  // if the descriptor is not one of the wrappable shapes.
  const attenuatable =
    /** @type {VirtualModuleSource | SourceModuleDescriptor} */ (
      moduleDescriptor
    );
  return attenuateModule({
    importAttenuator,
    attenuationDefinition,
    moduleDescriptor: attenuatable,
  });
};

/**
 * Synchronous counterpart of {@link attenuateModuleHook}, for exit modules
 * loaded by a dynamic require.
 *
 * Throws if importing of the specifier is not allowed by the policy
 *
 * @param {string} specifier - exit module name
 * @param {ModuleDescriptor} moduleDescriptor - reference to the exit module
 * @param {PackagePolicy | undefined} policy - local compartment policy
 * @param {ImportNowAttenuatorFn} importAttenuatorNow - synchronously imports the attenuator which policy names
 * @returns {ModuleDescriptor} - the attenuated module descriptor
 */
export const attenuateModuleNowHook = (
  specifier,
  moduleDescriptor,
  policy,
  importAttenuatorNow,
) => {
  const attenuationDefinition = getModuleAttenuationDefinition(
    specifier,
    policy,
  );
  if (attenuationDefinition === undefined) {
    return moduleDescriptor;
  }
  // See attenuateModuleHook regarding which descriptors are attenuatable.
  const attenuatable =
    /** @type {VirtualModuleSource | SourceModuleDescriptor} */ (
      moduleDescriptor
    );
  return attenuateModuleNow({
    importAttenuatorNow,
    attenuationDefinition,
    moduleDescriptor: attenuatable,
  });
};

/**
 * Returns an array of "issue" objects for each unknown canonical name referenced
 * in `policy`.
 *
 * @param {Set<CanonicalName>} canonicalNames Set of all known canonical names
 * @param {SomePolicy} policy Policy to validate
 * @returns {Array<{canonicalName: CanonicalName, message: string, path:
 * string[], suggestion?: CanonicalName}>} Array of "issue" objects
 */
export const findUnknownCanonicalNames = (canonicalNames, policy) => {
  /**
   * Finds a suggestion for `badName` if it is a suffix of any canonical name in
   * `canonicalNames`.
   *
   * @param {string} badName Unknown canonical name
   * @returns {CanonicalName | undefined} Canonical name with a suffix of
   * `>${badName}`, or `undefined` if none found
   */
  const findSuggestion = badName => {
    for (const canonicalName of canonicalNames) {
      if (canonicalName.endsWith(`>${badName}`)) {
        return canonicalName;
      }
    }
    return undefined;
  };

  /**
   * @type {Array<{canonicalName: CanonicalName, message: string, path:
   * string[], suggestion?: CanonicalName}>}
   */
  const issues = [];

  // check any packages referenced by entry compartment
  if (typeof policy.entry?.packages === 'object' && policy.entry.packages) {
    for (const entryPackageName of keys(policy.entry?.packages ?? {})) {
      if (!canonicalNames.has(entryPackageName)) {
        const issueMessage = `Resource ${q(entryPackageName)} from entry policy was not found`;
        const suggestion = findSuggestion(entryPackageName);
        const issue = {
          canonicalName: entryPackageName,
          message: issueMessage,
          path: ['entry', 'packages', entryPackageName],
        };
        if (suggestion) {
          issue.suggestion = suggestion;
        }
        issues.push(issue);
      }
    }
  }

  // drill into resources, checking the resource name (key) first
  for (const [resourceName, resourcePolicy] of entries(
    policy.resources ?? {},
  )) {
    if (
      resourceName !== ENTRY_COMPARTMENT &&
      !canonicalNames.has(resourceName)
    ) {
      const issueMessage = `Resource ${q(resourceName)} was not found`;
      const suggestion = findSuggestion(resourceName);
      const issue = {
        canonicalName: resourceName,
        message: issueMessage,
        path: ['resources', resourceName],
      };
      if (suggestion) {
        issue.suggestion = suggestion;
      }
      issues.push(issue);
    }

    // check any packages referenced from within a resource
    if (
      resourcePolicy?.packages &&
      typeof resourcePolicy.packages === 'object'
    ) {
      for (const packageName of keys(resourcePolicy.packages)) {
        if (
          resourceName !== ENTRY_COMPARTMENT &&
          !canonicalNames.has(packageName)
        ) {
          const issueMessage = `Resource ${q(packageName)} from resource ${q(resourceName)} was not found`;
          const suggestion = findSuggestion(packageName);
          const issue = {
            canonicalName: packageName,
            message: issueMessage,
            path: ['resources', resourceName, 'packages', packageName],
          };
          if (suggestion) {
            issue.suggestion = suggestion;
          }
          issues.push(issue);
        }
      }
    }
  }

  return issues;
};

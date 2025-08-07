/* eslint-disable no-continue */

/**
 * Compartment Map Transform implementations
 *
 * @module
 */

import {
  policyLookupHelper,
  ATTENUATORS_COMPARTMENT,
} from '../policy-format.js';

/**
 * @import {CompartmentDescriptor,
 *   CompartmentMapTransformFn,
 *   LogFn,
 *   ModuleDescriptor,
 *   PropertyPolicy,
 *   SomePackagePolicy,
 * } from '../types.js'
 */

/**
 * Dummy logger
 * @type {LogFn}
 */
const noop = () => {};

const { stringify: q } = JSON;
const { entries, values, freeze } = Object;
const { isArray } = Array;

/**
 * Type guard for a {@link PropertyPolicy}
 *
 * @param {unknown} value
 * @returns {value is PropertyPolicy}
 */
const isPropertyPolicy = value =>
  !!value &&
  typeof value === 'object' &&
  !isArray(value) &&
  values(value).every(item => typeof item === 'boolean');

/**
 * A transform which removes {@link ModuleDescriptor ModuleDescriptors} from a
 * {@link CompartmentDescriptor} based on package policy
 *
 * @type {CompartmentMapTransformFn}
 */
export const enforcePolicyTransform = ({
  compartmentMap,
  context: { getPackagePolicy, getCompartmentDescriptor, getCanonicalName },
  options: { log = noop, policy },
}) => {
  const { compartments } = compartmentMap;

  /**
   * Returns `true` if package policy disallows the module
   *
   * @param {SomePackagePolicy|undefined} packagePolicy
   * @param {ModuleDescriptor} moduleDescriptor
   */
  const shouldRemoveModule = (packagePolicy, moduleDescriptor) => {
    // no package policy? allow whatever
    if (!packagePolicy) {
      return false;
    }
    assert(
      moduleDescriptor.compartment,
      `compartment expected in ModuleDescriptor: ${q(moduleDescriptor)}`,
    );

    const compartmentDescriptor = getCompartmentDescriptor(
      moduleDescriptor.compartment,
    );

    // we cannot compute a canonical name, so we can't check policy
    if (!compartmentDescriptor?.path) {
      throw new TypeError(
        `CompartmentDescriptor for ModuleDescriptor ${q(moduleDescriptor.module)} has no path property`,
      );
    }

    const canonicalName = getCanonicalName(compartmentDescriptor);

    assert(canonicalName, 'canonicalName expected');

    return !policyLookupHelper(packagePolicy, 'packages', canonicalName);
  };

  for (const [compartmentName, compartmentDescriptor] of entries(
    compartments,
  )) {
    // we are not going to mess with the ATTENUATORS compartment
    if (compartmentName === ATTENUATORS_COMPARTMENT) {
      continue;
    }

    /**
     * Canonical name of {@link compartmentDescriptor}
     *
     * Only used for logging
     * @type {string|undefined}
     */
    let canonicalName;

    /**
     * Prefer the package policy from `policy`; fall back to
     * {@link CompartmentDescriptor.policy} otherwise
     * @type {SomePackagePolicy|undefined}
     */
    const packagePolicy =
      (policy
        ? getPackagePolicy(compartmentDescriptor, policy)
        : compartmentDescriptor.policy) ?? compartmentDescriptor.policy;

    // bail if this compartment has no associated package policy
    if (!packagePolicy) {
      continue;
    }

    for (const [moduleName, moduleDescriptor] of entries(
      compartmentDescriptor.modules,
    )) {
      const { compartment: moduleDescriptorCompartmentName } = moduleDescriptor;
      // ignore unknown ModuleDescriptors and self-referencing modules
      if (
        !moduleDescriptorCompartmentName ||
        moduleDescriptorCompartmentName === compartmentName
      ) {
        continue;
      }

      if (shouldRemoveModule(packagePolicy, moduleDescriptor)) {
        delete compartmentDescriptor.modules[moduleName];

        canonicalName ??=
          getCanonicalName(compartmentDescriptor) ?? compartmentName;

        const compartmentDescriptorForModule = getCompartmentDescriptor(
          moduleDescriptorCompartmentName,
        );

        /**
         * Only used for logging
         */
        const canonicalNameForModule =
          getCanonicalName(compartmentDescriptorForModule) ?? moduleName;

        log(
          `Removed module descriptor ${q(moduleDescriptor.module)} of ${q(canonicalNameForModule)} from compartment ${q(canonicalName)} per policy`,
        );
      }
    }
  }
  return compartmentMap;
};

/**
 * A transform which adds references to compartments based on package policy.
 *
 * Values are added to {@link CompartmentDescriptor.modules},
 * {@link CompartmentDescriptor.scopes}, and
 * {@link CompartmentDescriptor.compartments}. Each `ModuleDescriptor` in
 * `modules` will have a `fromPolicy` property set to `true`.
 *
 * @type {CompartmentMapTransformFn}
 */
export const createReferencesByPolicyTransform = ({
  compartmentMap,
  context: {
    getCompartmentName,
    getCompartmentDescriptor,
    getCanonicalName,
    getPackagePolicy,
  },
  options: { log = noop, policy, policyOverride },
}) => {
  const { compartments } = compartmentMap;
  const { compartment: entryCompartmentName } = compartmentMap.entry;

  /**
   * Updates the compartment descriptor by adding references to policy
   * compartment descriptors and ensuring proper module and scope mappings
   * between compartments.
   *
   * TODO: It is a bug if we ever add a `ModuleDescriptor` which was previously
   * removed by {@link enforcePolicyTransform}. To avoid leaking abstractions,
   * `enforcePolicyTransform` should probably instead _flag_ a
   * `ModuleDescriptor` instead of outright removing it—and policy enforcement
   * should take this flag into account.
   *
   * @param {string} compartmentDescriptorNameFromPolicy - The name of the policy
   * compartment descriptor.
   * @param {CompartmentDescriptor} compartmentDescriptor - The compartment
   * descriptor to be updated.
   * @param {string} compartmentDescriptorName - The name of the compartment
   * descriptor being updated.
   * @param {string} canonicalName - The canonical name of the compartment
   * descriptor.
   * @param {string} policyCanonicalName - The canonical name of the policy
   * compartment descriptor.
   * @throws {ReferenceError} If the policy compartment descriptor cannot be
   * found.
   */
  const updateCompartmentDescriptor = (
    compartmentDescriptorNameFromPolicy,
    compartmentDescriptor,
    compartmentDescriptorName,
    canonicalName,
    policyCanonicalName,
  ) => {
    const compartmentDescriptorFromPolicy = getCompartmentDescriptor(
      compartmentDescriptorNameFromPolicy,
    );

    assert(
      compartmentDescriptorFromPolicy,
      `No compartment descriptor found for ${q(compartmentDescriptorNameFromPolicy)}`,
    );

    const { name: moduleDescriptorName } = compartmentDescriptorFromPolicy;

    const moduleDescriptor =
      compartmentDescriptor.modules[moduleDescriptorName];

    // NOTE: The keys of `modules` correspond to
    // `CompartmentDescriptor.name`—not the keys of the
    // `CompartmentMapDescriptor.compartments` object.
    if (!moduleDescriptor) {
      const moduleDescriptorFromPolicy =
        compartmentDescriptorFromPolicy.modules[moduleDescriptorName];

      assert(
        moduleDescriptorFromPolicy,
        `No module descriptor found for ${q(moduleDescriptorName)} in compartment ${q(compartmentDescriptorNameFromPolicy)}; policy may be malformed`,
      );

      compartmentDescriptor.modules[moduleDescriptorName] = {
        module:
          compartmentDescriptorFromPolicy.modules[moduleDescriptorName].module,
        compartment: compartmentDescriptorNameFromPolicy,
        fromPolicy: true,
      };
    }

    // defensive
    if (!compartmentDescriptor.compartments) {
      compartmentDescriptor.compartments = new Set();
    }
    // half of bi-directional relationship
    compartmentDescriptor.compartments.add(compartmentDescriptorNameFromPolicy);

    // practically, this should be less common, since scopes are not removed by `enforcePolicyTransform`
    if (!compartmentDescriptor.scopes[moduleDescriptorName]) {
      compartmentDescriptor.scopes[moduleDescriptorName] = {
        compartment: compartmentDescriptorNameFromPolicy,
      };
    }

    // defensive
    if (!compartmentDescriptorFromPolicy.compartments) {
      compartmentDescriptorFromPolicy.compartments = new Set();
    }
    // other half of bi-directional relationship
    compartmentDescriptorFromPolicy.compartments.add(compartmentDescriptorName);

    log(
      `Policy: created reference from compartment ${q(
        canonicalName,
      )} to ${q(policyCanonicalName)}`,
    );
  };

  for (const [compartmentDescriptorName, compartmentDescriptor] of entries(
    compartments,
  )) {
    // we are not going to mess with the ATTENUATORS compartment
    if (compartmentDescriptorName === ATTENUATORS_COMPARTMENT) {
      continue;
    }

    assert(
      compartmentDescriptor,
      `No CompartmentDescriptor for name ${q(compartmentDescriptorName)}`,
    );

    const isEntry = compartmentDescriptorName === entryCompartmentName;

    const packagePolicy = getPackagePolicy(
      compartmentDescriptor,
      policy ?? policyOverride,
    );

    if (isPropertyPolicy(packagePolicy?.packages)) {
      const { packages: packagePolicyPackages } = packagePolicy;

      /**
       * Used for logging only
       */
      const canonicalName =
        getCanonicalName(compartmentDescriptor) ?? compartmentDescriptorName;

      // special case for access to entry compartment
      if (!isEntry && packagePolicy.allowEntry === true) {
        updateCompartmentDescriptor(
          entryCompartmentName,
          compartmentDescriptor,
          compartmentDescriptorName,
          canonicalName,
          entryCompartmentName,
        );
      }

      for (const [policyCanonicalName, policyValue] of entries(
        packagePolicyPackages,
      )) {
        if (policyValue === true) {
          const compartmentDescriptorNameFromPolicy =
            getCompartmentName(policyCanonicalName);

          if (!compartmentDescriptorNameFromPolicy) {
            log(
              `Warning: no compartment name found for ${q(policyCanonicalName)}; package policy may be malformed`,
            );
            continue;
          }

          updateCompartmentDescriptor(
            compartmentDescriptorNameFromPolicy,
            compartmentDescriptor,
            compartmentDescriptorName,
            canonicalName,
            policyCanonicalName,
          );
        }
      }
    }
  }
  return compartmentMap;
};

/**
 * @type {ReadonlyArray<CompartmentMapTransformFn>}
 */
export const defaultCompartmentMapTransforms = freeze([
  enforcePolicyTransform,
  createReferencesByPolicyTransform,
]);

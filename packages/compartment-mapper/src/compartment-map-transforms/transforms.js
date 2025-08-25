/* eslint-disable no-continue */

/**
 * Compartment Map Transform implementations
 *
 * @module
 */

import {
  ATTENUATORS_COMPARTMENT,
  ENTRY_COMPARTMENT,
  WILDCARD_POLICY_VALUE,
} from '../policy-format.js';

/**
 * @import {CompartmentDescriptor,
 *   CompartmentMapTransformFn,
 *   CompartmentModuleDescriptorConfiguration,
 *   FileUrlString,
 *   LogFn,
 *   ModuleDescriptorConfiguration,
 *   PackageCompartmentDescriptor,
 *   PackageCompartmentDescriptorName,
 *   PackageCompartmentMapDescriptor,
 *   PropertyPolicy,
 *   SomePackagePolicy,
 * } from '../types.js'
 */

/**
 * Dummy logger
 * @type {LogFn}
 */
const noop = () => {};

const { quote: q } = assert;
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
 * A transform which removes {@link ModuleDescriptorConfiguration ModuleDescriptors} from a
 * {@link CompartmentDescriptor} based on package policy
 *
 * @type {CompartmentMapTransformFn<PackageCompartmentMapDescriptor>}
 */
export const enforcePolicyTransform = ({
  compartmentMap,
  context: { getPackagePolicy, getCompartmentDescriptor, getCanonicalName },
  options: { log = noop, policy },
}) => {
  if (!policy) {
    log('No policy provided; skipping enforcePolicyTransform');
    return compartmentMap;
  }
  const { compartments } = compartmentMap;

  /**
   * Returns `true` if package policy disallows the module
   *
   * @param {SomePackagePolicy|undefined} packagePolicy
   * @param {CompartmentModuleDescriptorConfiguration} moduleDescriptor
   */
  const shouldRemoveModule = (packagePolicy, moduleDescriptor) => {
    // no package policy? delete it
    if (!packagePolicy) {
      return true;
    }
    assert(
      moduleDescriptor.compartment,
      `compartment expected in ModuleDescriptor: ${q(moduleDescriptor)}`,
    );

    const compartmentDescriptor = getCompartmentDescriptor(
      moduleDescriptor.compartment,
    );

    // we cannot compute a canonical name, so we can't check policy
    if (!compartmentDescriptor) {
      throw new TypeError(
        `CompartmentDescriptor for ModuleDescriptor ${q(moduleDescriptor.module)} cannot be found`,
      );
    }

    const canonicalName = getCanonicalName(compartmentDescriptor);

    assert(canonicalName, 'canonicalName expected');

    return packagePolicy.packages === WILDCARD_POLICY_VALUE
      ? false
      : packagePolicy.packages?.[canonicalName] !== true;
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
    const packagePolicy = getPackagePolicy(compartmentDescriptor, policy);

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
          `Policy: removed module descriptor ${q(moduleDescriptor.module)} of ${q(canonicalNameForModule)} from compartment ${q(canonicalName)}`,
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
 * `modules` will have a `fromTransform` property set to `true`.
 *
 * @type {CompartmentMapTransformFn<PackageCompartmentMapDescriptor>}
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
  if (!policy && !policyOverride) {
    log('No policies provided; skipping createReferencesByPolicyTransform');
    return compartmentMap;
  }
  const { compartments } = compartmentMap;
  const { compartment: entryCompartmentName } = compartmentMap.entry;

  /**
   * Function which adds references to a {@link CompartmentDescriptor} based on
   * package policy.
   * @callback UpdateCompartmentDescriptorFn
   * @param {FileUrlString|typeof ENTRY_COMPARTMENT} compartmentDescriptorNameFromPolicy The name of the policy
   * compartment descriptor.
   * @param {string} policyCanonicalName The canonical name of the policy
   * compartment descriptor.
   * @returns {void}
   */

  /**
   * Factory for {@link UpdateCompartmentDescriptorFn}
   *
   * @param {PackageCompartmentDescriptor} compartmentDescriptor
   * @returns {UpdateCompartmentDescriptorFn}
   */
  const makeUpdateCompartmentDescriptor = compartmentDescriptor => {
    /**
     * Used for logging only
     */
    const { label: canonicalName } = compartmentDescriptor;

    /**
     * Updates the compartment descriptor by adding references to policy
     * compartment descriptors and ensuring proper module and scope mappings
     * between compartments.
     *
     * TODO: It is a bug if we ever add a `ModuleDescriptor` which was previously
     * removed by {@link enforcePolicyTransform}. I don't have a solution for this yet.
     *
     * @type {UpdateCompartmentDescriptorFn}
     * @throws {ReferenceError} If the policy compartment descriptor cannot be
     * found.
     */
    const updateCompartmentDescriptor = (
      compartmentDescriptorNameFromPolicy,
      policyCanonicalName,
    ) => {
      const compartmentDescriptorFromPolicy =
        compartmentDescriptorNameFromPolicy === ENTRY_COMPARTMENT
          ? getCompartmentDescriptor(entryCompartmentName)
          : getCompartmentDescriptor(compartmentDescriptorNameFromPolicy);

      assert(
        compartmentDescriptorFromPolicy,
        `No compartment descriptor found for ${q(compartmentDescriptorNameFromPolicy)}`,
      );

      const { name: moduleDescriptorName } = compartmentDescriptorFromPolicy;

      const moduleDescriptor =
        compartmentDescriptor.modules[moduleDescriptorName];

      let updated = false;
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
            compartmentDescriptorFromPolicy.modules[moduleDescriptorName]
              .module,
          compartment:
            compartmentDescriptorNameFromPolicy === ENTRY_COMPARTMENT
              ? entryCompartmentName
              : compartmentDescriptorNameFromPolicy,
          createdBy: 'transform',
        };
        updated = true;
      }

      // practically, this should be less common, since scopes are not removed by `enforcePolicyTransform`
      if (!compartmentDescriptor.scopes[moduleDescriptorName]) {
        compartmentDescriptor.scopes[moduleDescriptorName] = {
          compartment:
            compartmentDescriptorNameFromPolicy === ENTRY_COMPARTMENT
              ? entryCompartmentName
              : compartmentDescriptorNameFromPolicy,
        };
        updated = true;
      }

      if (updated) {
        log(
          `Policy: created reference from compartment ${q(
            canonicalName,
          )} to ${q(policyCanonicalName)}`,
        );
      }
    };
    return updateCompartmentDescriptor;
  };

  const compartmentEntries =
    /** @type {[PackageCompartmentDescriptorName, PackageCompartmentDescriptor][]} */ (
      entries(compartments)
    );
  for (const [
    compartmentDescriptorName,
    compartmentDescriptor,
  ] of compartmentEntries) {
    // we are not going to mess with the ATTENUATORS compartment
    if (compartmentDescriptorName === ATTENUATORS_COMPARTMENT) {
      continue;
    }

    assert(
      compartmentDescriptor,
      `No CompartmentDescriptor for name ${q(compartmentDescriptorName)}`,
    );

    const packagePolicy = getPackagePolicy(
      compartmentDescriptor,
      policy ?? policyOverride,
    );

    if (isPropertyPolicy(packagePolicy?.packages)) {
      const { packages: packagePolicyPackages } = packagePolicy;

      /**
       * Might be a {@link UpdateCompartmentDescriptorFn}; lazily created.
       * @type {UpdateCompartmentDescriptorFn | undefined}
       */
      let updateCompartmentDescriptor;

      for (const [policyCanonicalName, policyValue] of entries(
        packagePolicyPackages,
      )) {
        // note that `any` is a valid policy value, but we cannot add references to every other CompartmentDescriptor!
        if (policyValue === true) {
          const compartmentDescriptorNameFromPolicy =
            getCompartmentName(policyCanonicalName);

          if (!compartmentDescriptorNameFromPolicy) {
            log(
              `Warning: no compartment name found for ${q(policyCanonicalName)}; package policy may be malformed`,
            );
            continue;
          }

          updateCompartmentDescriptor ??= makeUpdateCompartmentDescriptor(
            compartmentDescriptor,
          );
          updateCompartmentDescriptor(
            compartmentDescriptorNameFromPolicy,
            policyCanonicalName,
          );
        }
      }
    }
  }
  return compartmentMap;
};

/**
 * @type {ReadonlyArray<CompartmentMapTransformFn<PackageCompartmentMapDescriptor>>}
 */
export const defaultCompartmentMapTransforms = freeze([
  enforcePolicyTransform,
  createReferencesByPolicyTransform,
]);

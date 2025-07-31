/* eslint-disable no-continue */

/**
 * Functions for transforming {@link CompartmentMapDescriptor CompartmentMapDescriptors}.
 *
 * @module
 */

import { getPolicyForPackage } from './policy.js';
import {
  ATTENUATORS_COMPARTMENT,
  generateCanonicalName,
  policyLookupHelper,
} from './policy-format.js';

/**
 * @import {CompartmentDescriptor,
 *   CompartmentDescriptorMetadata,
 *   CompartmentMapDescriptor,
 *   CompartmentMapTransformContext,
 *   CompartmentMapTransformFn,
 *   CompartmentMapTransformOptions,
 *   ModuleDescriptor,
 *   PropertyPolicy,
 *   SomePackagePolicy,
 * } from './types.js'
 */

const { stringify: q } = JSON;
const { entries, freeze, create } = Object;
const noop = () => {};

/**
 * Creates a {@link CompartmentMapTransformContext} for use with
 * {@link CompartmentMapTransformFn CompartmentMapTransformFns}.
 *
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {WeakMap<CompartmentDescriptor, CompartmentDescriptorMetadata>} metadataMap
 * @param {Map<string, string>} canonicalNameToCompartmentNameMap
 * @param {CompartmentMapTransformOptions} options
 * @returns {Readonly<CompartmentMapTransformContext>}
 */
const makeCompartmentMapTransformContext = (
  compartmentMap,
  metadataMap,
  canonicalNameToCompartmentNameMap,
  { policy, log: _log = noop },
) => {
  const { compartments } = compartmentMap;
  const entryCompartmentDescriptor =
    compartments[compartmentMap.entry.compartment];

  /** @type {CompartmentMapTransformContext} */
  const context = {
    metadataMap: freeze(metadataMap),
    getCompartmentDescriptor: freeze(name => compartments[name]),
    getCanonicalName: freeze(compartmentDescriptorOrName => {
      /** @type {CompartmentDescriptor|undefined} */
      let compartmentDescriptor;
      if (typeof compartmentDescriptorOrName === 'string') {
        compartmentDescriptor = context.getCompartmentDescriptor(
          compartmentDescriptorOrName,
        );
      } else {
        compartmentDescriptor = compartmentDescriptorOrName;
      }
      if (!compartmentDescriptor?.path) {
        return undefined;
      }
      const metadata = /** @type {CompartmentDescriptorMetadata} */ (
        metadataMap.get(compartmentDescriptor) ?? create(null)
      );
      if (metadata.canonicalName) {
        return metadata.canonicalName;
      }
      const canonicalName = generateCanonicalName({
        isEntry: compartmentDescriptor === entryCompartmentDescriptor,
        path: compartmentDescriptor.path,
        name: compartmentDescriptor.name,
      });
      metadata.canonicalName = canonicalName;
      metadataMap.set(compartmentDescriptor, metadata);
      return canonicalName;
    }),
    getCompartmentName: freeze(canonicalName =>
      canonicalName === ''
        ? compartmentMap.entry.compartment
        : canonicalNameToCompartmentNameMap.get(canonicalName),
    ),
    getPackagePolicy: freeze((compartmentDescriptor, somePolicy = policy) => {
      const { path, name } = compartmentDescriptor;
      if (!path) {
        return undefined;
      }
      return somePolicy
        ? getPolicyForPackage(
            {
              isEntry: compartmentDescriptor === entryCompartmentDescriptor,
              path,
              name,
            },
            somePolicy,
          )
        : compartmentDescriptor.policy;
    }),
  };

  return freeze(context);
};

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
    if (moduleDescriptor.compartment === undefined) {
      throw new TypeError(
        `ModuleDescriptor ${q(moduleDescriptor.module)} has no compartment property`,
      );
    }

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
    if (!canonicalName) {
      throw new TypeError(
        `Cannot compute canonical name for CompartmentDescriptor ${q(compartmentDescriptor)}`,
      );
    }

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
    let compartmentCanonicalName;

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
      // ignore malformed ModuleDescriptors and self-referencing modules
      if (
        !moduleDescriptorCompartmentName ||
        moduleDescriptorCompartmentName === compartmentName
      ) {
        continue;
      }

      if (shouldRemoveModule(packagePolicy, moduleDescriptor)) {
        compartmentCanonicalName ??=
          getCanonicalName(compartmentDescriptor) ?? compartmentName;

        const moduleCompartmentDescriptor = getCompartmentDescriptor(
          moduleDescriptorCompartmentName,
        );

        const moduleCanonicalName =
          getCanonicalName(moduleCompartmentDescriptor) ?? moduleName;

        delete compartmentDescriptor.modules[moduleName];

        log(
          `Removed module descriptor ${q(moduleDescriptor.module)} of ${q(moduleCanonicalName)} from compartment ${q(compartmentCanonicalName)} per policy`,
        );
      }
    }
  }
  return compartmentMap;
};

/**
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

  for (const [compartmentDescriptorName, compartmentDescriptor] of entries(
    compartments,
  )) {
    // we are not going to mess with the ATTENUATORS compartment
    if (compartmentDescriptorName === ATTENUATORS_COMPARTMENT) {
      continue;
    }

    const packagePolicy = policy
      ? getPackagePolicy(compartmentDescriptor, policy)
      : getPackagePolicy(compartmentDescriptor, policyOverride);

    if (!packagePolicy) {
      const canonicalName = getCanonicalName(compartmentDescriptor);
      if (canonicalName && policy?.resources[canonicalName]?.packages) {
        throw Error(
          `Expected package policy for compartment ${q(canonicalName)}`,
        );
      }
      continue;
    }

    if (
      'packages' in packagePolicy &&
      typeof packagePolicy.packages !== 'string' &&
      Object(packagePolicy.packages) === packagePolicy.packages
    ) {
      for (const [canonicalName, policyValue] of entries(
        /** @type {PropertyPolicy} */ (packagePolicy.packages),
      )) {
        if (policyValue === true) {
          const policyCompartmentDescriptorName =
            getCompartmentName(canonicalName);
          if (!policyCompartmentDescriptorName) {
            log(
              `Warning: no compartment descriptor found for canonical name ${q(canonicalName)}`,
            );
            continue;
          }

          const policyCompartmentDescriptor = getCompartmentDescriptor(
            policyCompartmentDescriptorName,
          );
          if (!policyCompartmentDescriptor) {
            log(
              `Warning: no compartment descriptor found for name ${q(
                policyCompartmentDescriptorName,
              )}`,
            );
            continue;
          }
          if (
            !compartmentDescriptor.modules[policyCompartmentDescriptor.name]
          ) {
            if (
              policyCompartmentDescriptor.modules[
                policyCompartmentDescriptor.name
              ]
            ) {
              compartmentDescriptor.modules[policyCompartmentDescriptor.name] =
                {
                  module:
                    policyCompartmentDescriptor.modules[
                      policyCompartmentDescriptor.name
                    ].module,
                  compartment: policyCompartmentDescriptorName,
                  retained: true,
                };
            }
          }

          compartmentDescriptor.compartments.add(
            policyCompartmentDescriptorName,
          );

          if (!compartmentDescriptor.scopes[policyCompartmentDescriptor.name]) {
            compartmentDescriptor.scopes[policyCompartmentDescriptor.name] = {
              compartment: policyCompartmentDescriptorName,
            };
          }

          policyCompartmentDescriptor.compartments.add(
            compartmentDescriptorName,
          );
          policyCompartmentDescriptor.retained = true;

          log(
            `Policy: adding module descriptor for ${q(
              policyCompartmentDescriptor.label,
            )} (${canonicalName}) to compartment ${q(compartmentDescriptor.label)} (${q(getCanonicalName(compartmentDescriptor))})`,
          );
        }
      }
    }
  }
  return compartmentMap;
};

/**
 * Default set of transforms.
 *
 * @public
 */
export const defaultCompartmentMapTransforms = freeze([
  enforcePolicyTransform,
  createReferencesByPolicyTransform,
]);

/**
 * Applies one or more {@link CompartmentMapTransformFn CompartmentMapTransformFns} to a
 * {@link CompartmentMapDescriptor}.
 *
 * @template {CompartmentMapTransformOptions} Options
 * @template {ReadonlyArray<CompartmentMapTransformFn<Options>>} [Transforms=ReadonlyArray<CompartmentMapTransformFn<Options>>]
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {WeakMap<CompartmentDescriptor, CompartmentDescriptorMetadata>} metadataMap
 * @param {Map<string, string>} canonicalNameToCompartmentNameMap
 * @param {Transforms} transforms
 * @param {Options} optionsForTransforms
 * @returns {Promise<CompartmentMapDescriptor>} Transformed compartment map
 * @internal
 */
export const applyCompartmentMapTransforms = async (
  compartmentMap,
  metadataMap,
  canonicalNameToCompartmentNameMap,
  transforms,
  optionsForTransforms,
) => {
  await null;
  assert(optionsForTransforms !== undefined, 'optionsForTransforms expected');

  const context = makeCompartmentMapTransformContext(
    compartmentMap,
    metadataMap,
    canonicalNameToCompartmentNameMap,
    optionsForTransforms,
  );

  for (const transform of transforms ?? defaultCompartmentMapTransforms) {
    // TODO: try/catch here
    // eslint-disable-next-line no-await-in-loop
    compartmentMap = await transform({
      compartmentMap,
      options: optionsForTransforms,
      context,
    });
  }
  return compartmentMap;
};

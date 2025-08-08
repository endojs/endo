/**
 * Functions for transforming {@link CompartmentMapDescriptor CompartmentMapDescriptors}.
 *
 * @module
 */

import { getPolicyForPackage } from '../policy.js';
import { generateCanonicalName } from '../policy-format.js';
import { defaultCompartmentMapTransforms } from './transforms.js';

export { defaultCompartmentMapTransforms };

/**
 * @import {CompartmentDescriptor,
 *   CompartmentDescriptorMetadata,
 *   CompartmentMapDescriptor,
 *   CompartmentMapTransformContext,
 *   CompartmentMapTransformFn,
 *   CompartmentMapTransformOptions,
 GetCanonicalNameFn,
 *   LogFn,
 * } from '../types.js'
 */

const { stringify: q } = JSON;
const { freeze, create } = Object;

/**
 * Dummy logger
 * @type {LogFn}
 */
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
      if (
        !compartmentDescriptor?.path ||
        compartmentDescriptor === entryCompartmentDescriptor
      ) {
        return undefined;
      }
      const metadata = /** @type {CompartmentDescriptorMetadata} */ (
        metadataMap.get(compartmentDescriptor) ?? create(null)
      );
      if (metadata.canonicalName) {
        return metadata.canonicalName;
      }
      const canonicalName = generateCanonicalName({
        isEntry: false,
        path: compartmentDescriptor.path,
        name: compartmentDescriptor.name,
      });
      metadata.canonicalName = canonicalName;
      metadataMap.set(compartmentDescriptor, metadata);
      return canonicalName;
    }),
    getCompartmentName: freeze(canonicalName =>
      canonicalNameToCompartmentNameMap.get(canonicalName),
    ),
    getPackagePolicy: freeze((compartmentDescriptor, somePolicy = policy) => {
      assert(compartmentDescriptor, 'compartmentDescriptor expected');
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
    try {
      // eslint-disable-next-line no-await-in-loop
      compartmentMap = await transform({
        compartmentMap,
        options: optionsForTransforms,
        context,
      });
    } catch (err) {
      throw new Error(
        `Compartment Map Transform ${q(transform.name)} errored during execution: ${err.message}`,
        { cause: err },
      );
    }
  }
  return compartmentMap;
};

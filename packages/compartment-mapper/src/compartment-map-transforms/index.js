/**
 * Functions for transforming {@link CompartmentMapDescriptor CompartmentMapDescriptors}.
 *
 * @module
 */

import { makePackagePolicyForCompartment } from '../policy.js';
import { defaultCompartmentMapTransforms } from './transforms.js';

export { defaultCompartmentMapTransforms };

/**
 * @import {CompartmentMapDescriptor,
 *   CompartmentMapTransformContext,
 *   CompartmentMapTransformFn,
 *   CompartmentMapTransformOptions,
 *   LogFn,
 *   CompartmentDescriptorFromMap,
 *   PackageCompartmentMapDescriptor,
 * } from '../types.js'
 * @import {CanonicalNameMap} from '../types/node-modules.js'
 */

const { quote: q } = assert;
const { freeze } = Object;

/**
 * Dummy logger
 * @type {LogFn}
 */
const noop = () => {};

/**
 * Creates a {@link CompartmentMapTransformContext} for use with
 * {@link CompartmentMapTransformFn CompartmentMapTransformFns}.
 *
 * @template {CompartmentMapDescriptor<any, any>} T
 * @param {T} compartmentMap
 * @param {CanonicalNameMap<T>} canonicalNameToCompartmentNameMap
 * @param {CompartmentMapTransformOptions} options
 *
 * @returns {Readonly<CompartmentMapTransformContext<T>>}
 */
const makeCompartmentMapTransformContext = (
  compartmentMap,
  canonicalNameToCompartmentNameMap,
  { policy, log: _log = noop },
) => {
  const { compartments } = compartmentMap;

  /** @type {CompartmentMapTransformContext<T>} */
  const context = {
    getCompartmentDescriptor: freeze(name => {
      assert(name, 'name argument expected');
      return compartments[name];
    }),
    getCanonicalName: freeze(compartmentDescriptorOrName => {
      /** @type {CompartmentDescriptorFromMap<T>|undefined} */
      let compartmentDescriptor;
      if (typeof compartmentDescriptorOrName === 'string') {
        compartmentDescriptor = context.getCompartmentDescriptor(
          compartmentDescriptorOrName,
        );
      } else {
        compartmentDescriptor = compartmentDescriptorOrName;
      }
      return compartmentDescriptor?.label;
    }),
    getCompartmentName: freeze(canonicalName => {
      assert(canonicalName, 'canonicalName argument expected');
      return canonicalNameToCompartmentNameMap.get(canonicalName);
    }),
    getPackagePolicy: freeze((compartmentDescriptor, somePolicy = policy) => {
      assert(compartmentDescriptor, 'compartmentDescriptor argument expected');
      if (somePolicy === undefined) {
        return undefined;
      }
      const { name, label } = compartmentDescriptor;
      return makePackagePolicyForCompartment({
        name,
        label,
        policy: somePolicy,
      });
    }),
  };

  return freeze(context);
};

/**
 * Applies one or more {@link CompartmentMapTransformFn CompartmentMapTransformFns} to a
 * {@link CompartmentMapDescriptor}.
 * @template {ReadonlyArray<CompartmentMapTransformFn<CompartmentMap>>} Transforms
 * @template {PackageCompartmentMapDescriptor} CompartmentMap
 * @template {CompartmentMapTransformOptions} [Options=CompartmentMapTransformOptions]
 * @param {CompartmentMap} compartmentMap
 * @param {CanonicalNameMap<CompartmentMap>} canonicalNameMap
 * @param {Transforms} transforms
 * @param {Options} optionsForTransforms
 * @returns {Promise<CompartmentMapDescriptor>} Transformed compartment map
 * @internal
 */
export const applyCompartmentMapTransforms = async (
  compartmentMap,
  canonicalNameMap,
  transforms,
  optionsForTransforms,
) => {
  await null;
  assert(optionsForTransforms !== undefined, 'optionsForTransforms expected');

  const context = makeCompartmentMapTransformContext(
    compartmentMap,
    canonicalNameMap,
    optionsForTransforms,
  );

  for (const transform of transforms ?? defaultCompartmentMapTransforms) {
    try {
      // eslint-disable-next-line no-await-in-loop
      compartmentMap = await transform(
        freeze({
          compartmentMap,
          options: optionsForTransforms,
          context,
        }),
      );
    } catch (err) {
      throw new Error(
        `Compartment Map Transform ${q(transform.name)} errored during execution: ${err.message}`,
        { cause: err },
      );
    }
  }
  return compartmentMap;
};

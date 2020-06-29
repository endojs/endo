import { assert } from './assert.js';
import { getOwnPropertyDescriptor } from './commons.js';

/**
 * getNamedIntrinsic()
 * Get the intrinsic from the global object.
 */
export function getNamedIntrinsic(root, name) {
  // Assumption: the intrinsic name matches a global object with the same name.
  const desc = getOwnPropertyDescriptor(root, name);

  // Abort if an accessor is found on the object instead of a data property.
  // We should never get into this non standard situation.
  assert(
    !('get' in desc || 'set' in desc),
    `unexpected accessor on global property: ${name}`,
  );

  return desc.value;
}

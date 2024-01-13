const { getOwnPropertyDescriptors, defineProperties } = Object;

/**
 * Like `Object.assign` but at the reflective level of property descriptors
 * rather than property values.
 *
 * Unlike `Object.assign`, this includes all own properties, whether enumerable
 * or not. An original accessor property is copied by sharing its getter and
 * setter, rather than calling the getter to obtain a value. If an original
 * property is non-configurable, a property of the same name on a later original
 * that would conflict instead causes the call to `objectMetaAssign` to throw an
 * error.
 *
 * Returns the enhanced `target` after hardening.
 *
 * @param {any} target
 * @param {any[]} originals
 * @returns {any}
 */
export const objectMetaAssign = (target, ...originals) => {
  for (const original of originals) {
    defineProperties(target, getOwnPropertyDescriptors(original));
  }
  return harden(target);
};
harden(objectMetaAssign);

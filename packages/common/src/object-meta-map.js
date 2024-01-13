const { getOwnPropertyDescriptors, create, fromEntries } = Object;
const { ownKeys } = Reflect;

/**
 * Like `objectMap`, but at the reflective level of property descriptors
 * rather than property values.
 *
 * Except for hardening, the edge case behavior is mostly the opposite of
 * the `objectMap` edge cases.
 *    * No matter how mutable the original object, the returned object is
 *      hardened.
 *    * All own properties of the original are mapped, even if symbol-named
 *      or non-enumerable.
 *    * If any of the original properties were accessors, the descriptor
 *      containing the getter and setter are given to `metaMapFn`.
 *    * The own properties of the returned are according to the descriptors
 *      returned by `metaMapFn`.
 *    * The returned object will always be a plain object whose state is
 *      only these mapped own properties. It will inherit from the third
 *      argument if provided, defaulting to `Object.prototype` if omitted.
 *
 * Because a property descriptor is distinct from `undefined`, we bundle
 * mapping and filtering together. When the `metaMapFn` returns `undefined`,
 * that property is omitted from the result.
 *
 * @template {Record<PropertyKey, any>} O
 * @param {O} original
 * @param {(
 *   desc: TypedPropertyDescriptor<O[keyof O]>,
 *   key: keyof O
 * ) => (PropertyDescriptor | undefined)} metaMapFn
 * @param {any} [proto]
 * @returns {any}
 */
export const objectMetaMap = (
  original,
  metaMapFn,
  proto = Object.prototype,
) => {
  const descs = getOwnPropertyDescriptors(original);
  const keys = ownKeys(original);

  const descEntries = /** @type {[PropertyKey,PropertyDescriptor][]} */ (
    keys
      .map(key => [key, metaMapFn(descs[key], key)])
      .filter(([_key, optDesc]) => optDesc !== undefined)
  );
  return harden(create(proto, fromEntries(descEntries)));
};
harden(objectMetaMap);

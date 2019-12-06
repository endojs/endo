export default function getNamedIntrinsics(unsafeGlobal, whitelist) {
  const { defineProperty, getOwnPropertyDescriptor, ownKeys } = Reflect;

  const namedIntrinsics = {};

  const propertyNames = ownKeys(whitelist.namedIntrinsics);

  for (const name of propertyNames) {
    const desc = getOwnPropertyDescriptor(unsafeGlobal, name);
    if (desc) {
      // Abort if an accessor is found on the unsafe global object
      // instead of a data property. We should never get into this
      // non standard situation.
      if ('get' in desc || 'set' in desc) {
        throw new TypeError(`unexpected accessor on global property: ${name}`);
      }

      defineProperty(namedIntrinsics, name, desc);
    }
  }

  return namedIntrinsics;
}

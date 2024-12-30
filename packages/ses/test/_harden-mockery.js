export const mockHardened = new WeakSet();
/** @type {import("../types.js").Harden & {isFake?: true}} */
export const mockHarden = x => {
  if (Object(x) !== x) {
    return x;
  }
  // @ts-expect-error x may not satisfy WeakKey
  mockHardened.add(x);
  return x;
};
mockHarden.isFake = true;
Object.freeze(mockHarden);

// eslint-disable-next-line no-undef
globalThis.harden = mockHarden;

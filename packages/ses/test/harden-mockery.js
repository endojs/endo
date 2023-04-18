export const mockHardened = new WeakSet();
export const mockHarden = x => {
  if (Object(x) !== x) {
    return x;
  }
  mockHardened.add(x);
  return x;
};
mockHarden.isFake = true;
Object.freeze(mockHarden);

// eslint-disable-next-line no-undef
globalThis.harden = mockHarden;

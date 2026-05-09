// Browser-compatible replacement for the small slice of `node:crypto`
// that `@endo/ocapn` uses. The simulator's vite config aliases
// `node:crypto` to this file.
//
// Only `randomBytes` is exported; the full surface of the Node module
// is not implemented.

export const randomBytes = n => {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
};

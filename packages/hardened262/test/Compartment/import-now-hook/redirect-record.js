/*---
flags: []
---*/

const compartment = new Compartment({
  __options__: true,
  resolveHook(specifier, referrer) {
    if (referrer === './src/index.js') {
      if (specifier === './peer.js') {
        return './src/peer.js';
      }
    }
    throw new Error(
      `Unexpected specifier ${specifier} for referrer ${referrer}`,
    );
  },
  importNowHook(specifier) {
    if (specifier === './src/peer.js') {
      return {
        record: new ModuleSource('export const meaning = 42'),
      };
    }
    if (specifier === '.') {
      return {
        record: new ModuleSource('export * from "./peer.js"'),
        specifier: './src/index.js',
      };
    }
    throw new Error(`Unexpected specifier ${specifier}`);
  },
});

assert.sameValue(compartment.importNow('.').meaning, 42);
assert.sameValue(compartment.importNow('./src/index.js').meaning, 42);
assert.sameValue(
  compartment.importNow('.'),
  compartment.importNow('./src/index.js'),
  'identities do not match',
);

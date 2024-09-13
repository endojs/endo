/*---
flags: []
---*/

const compartment = new Compartment({
  __options__: true,
  importNowHook(specifier) {
    if (specifier === '.') {
      return {
        namespace: './src/index.js',
        compartment,
      };
    }
    if (specifier === './src/index.js') {
      return {
        source: new ModuleSource('export const meaning = 42;'),
        compartment,
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

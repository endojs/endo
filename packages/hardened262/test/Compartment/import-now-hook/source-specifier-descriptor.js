/*---
flags: []
---*/

const compartment = new Compartment({
  __options__: true,
  resolveHook(specifier, referrer) {
    if (referrer === './src/index.js' && specifier === './peer.js') {
      return './src/peer.js';
    }
    throw new Error('Unexpected specifier');
  },
  importNowHook(specifier) {
    if (specifier === '.') {
      return {
        source: new ModuleSource('export { meaning } from "./peer.js";'),
        specifier: './src/index.js',
      };
    }
    if (specifier === './src/peer.js') {
      return {
        source: new ModuleSource('export const meaning = 42;'),
      };
    }
    throw new Error(`Unexpected specifier ${specifier}`);
  },
});

assert.sameValue(compartment.importNow('.').meaning, 42);

let threw = false;
try {
  compartment.importNow('./src/index.js');
} catch (error) {
  threw = true;
}
assert(threw, 'did not throw when importing ./src/index.js directly');

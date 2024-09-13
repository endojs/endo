/*---
flags: []
---*/

const compartment = new Compartment({
  __options__: true,
  __noNamespaceBox__: true,
  resolveHook: specifier => specifier,
  importHook() {
    return { source: new ModuleSource('export default 42') };
  },
});

compartment.import('x').then(namespace => {
  assert.sameValue(namespace.default, 42, 'default export not 42');
});

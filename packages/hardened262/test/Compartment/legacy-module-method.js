/*---
flags: [onlySesNode]
---*/
const compartment = new Compartment({
  __options__: true,
  resolveHook(x) {
    return x;
  },
  importHook() {
    return { source: new ModuleSource('export default 42') };
  },
  importNowHook() {
    return { source: new ModuleSource('export default 42') };
  },
});

const m = compartment.module('x');
const n = compartment.module('x');
const o = compartment.importNow('x');

assert.sameValue(m, n);
assert.sameValue(m, o);
assert.sameValue(m.default, 42);

compartment.import('x').then(({ namespace: p }) => {
  assert.sameValue(m, p);
});

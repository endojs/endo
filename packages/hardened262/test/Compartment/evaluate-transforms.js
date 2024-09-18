/*---
features: [Compartment]
flags: [noXs]
---*/
const compartment = new Compartment({
  __options__: true,
  transforms: [source => source.replace(/foo/g, 'bar')],
});
assert.sameValue(compartment.evaluate('"foo"'), 'bar');

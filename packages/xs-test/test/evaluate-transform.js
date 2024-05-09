import 'ses';
const c = new Compartment(
  {},
  {},
  {
    transforms: [source => source.replace(/foo/g, 'bar')],
  },
);
assert.equal(c.evaluate('"foo"'), 'bar');

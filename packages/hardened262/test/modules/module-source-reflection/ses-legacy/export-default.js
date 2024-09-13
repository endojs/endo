/*---
flags: []
---*/

const source = new ModuleSource(`
  export default 42;
`);

assert.sameValue(source.imports.join(','), [].join(','));
assert.sameValue(source.exports.join(','), ['default'].join(','));
assert.sameValue(source.reexports.join(','), [].join(','));

/*---
flags: []
---*/

const source = new ModuleSource(`
  import "a";
  import "a";
`);

assert.sameValue(source.imports.join(','), ['a'].join(','));
assert.sameValue(source.reexports.join(','), [].join(','));
assert.sameValue(source.exports.join(','), [].join(','));

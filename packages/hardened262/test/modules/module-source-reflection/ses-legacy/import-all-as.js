/*---
flags: []
---*/

const source = new ModuleSource(`
  import * as a from "a";
`);

assert.sameValue(source.imports.join(','), ['a'].join(','));
assert.sameValue(source.reexports.join(','), [].join(','));
assert.sameValue(source.exports.join(','), [].join(','));

/*---
description: |
  Currently failing on XS.
  Currently failing on SES.
flags: [onlyStrict,noXs,noSesXs,noSesNode]
includes: [propertyHelper.js]
---*/

var descriptor = Object.getOwnPropertyDescriptor(
  ModuleSource.prototype,
  'needsImport',
);

assert.sameValue(
  typeof descriptor.get,
  'function',
  'typeof descriptor.get is function',
);
assert.sameValue(
  typeof descriptor.set,
  'undefined',
  'typeof descriptor.set is undefined',
);

verifyNotEnumerable(ModuleSource.prototype, 'needsImport');
verifyConfigurable(ModuleSource.prototype, 'needsImport');

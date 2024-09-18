/*---
description: |
  Currently failing with SES, pending a fix.
includes: [propertyHelper.js]
features: [Symbol.toStringTag]
flags: [noSesXs,noSesNode,noXs]
---*/

verifyProperty(Compartment.prototype, Symbol.toStringTag, {
  value: 'Compartment',
  writable: false,
  enumerable: false,
  configurable: true,
});

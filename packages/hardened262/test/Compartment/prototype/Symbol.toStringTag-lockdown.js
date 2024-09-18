/*---
description: |
  Currently failing with SES, pending work to fix.
includes: [propertyHelper.js]
features: [Symbol.toStringTag]
flags: [noSloppy,onlyLockdown,noXs,noSesNode,noSesXs]
---*/

verifyProperty(Compartment.prototype, Symbol.toStringTag, {
  value: 'Compartment',
  writable: false,
  enumerable: false,
  configurable: false,
});

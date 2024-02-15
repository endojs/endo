/*---
description:
includes: [propertyHelper.js]
features: [Symbol.toStringTag,Compartment,lockdown,ses-xs-parity]
---*/

lockdown();

assert.sameValue(Compartment.prototype[Symbol.toStringTag], 'Compartment');

verifyNotEnumerable(Compartment.prototype, Symbol.toStringTag);
verifyNotWritable(Compartment.prototype, Symbol.toStringTag);
verifyNotConfigurable(Compartment.prototype, Symbol.toStringTag);

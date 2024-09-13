/*---
flags: []
---*/
const o = { p: {} };
Object.freeze(o, true);
assert(!Object.isFrozen(o.p));

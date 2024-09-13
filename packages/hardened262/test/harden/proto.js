/*---
flags: [onlyLockdown]
---*/
const o = {};
const p = Object.create(o);
harden(p);
assert(Object.isFrozen(p));
assert(Object.isFrozen(o));

/*---
flags: [onlyLockdown]
---*/
const o = {};
const p = Object.create(o);
const q = Object.create(p);
harden(q);
assert(Object.isFrozen(q));
assert(Object.isFrozen(p));
assert(Object.isFrozen(o));

/*---
flags: [onlyLockdown]
---*/
const o = {};
const p = { o };
harden(p);
assert(Object.isFrozen(p));
assert(Object.isFrozen(o));

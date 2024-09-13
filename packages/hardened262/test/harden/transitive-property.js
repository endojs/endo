/*---
flags: [onlyLockdown]
---*/
const o = {};
const p = { o };
const q = { p };
harden(q);
assert(Object.isFrozen(q));
assert(Object.isFrozen(p));
assert(Object.isFrozen(o));

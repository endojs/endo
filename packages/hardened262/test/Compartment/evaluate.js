/*---
flags: []
---*/

const parent = new Compartment();

assert.sameValue(parent.evaluate('42'), 42);

const child = new parent.globalThis.Compartment();

assert.sameValue(child.evaluate('42'), 42);

assert([] instanceof parent.globalThis.Array);
assert([] instanceof child.globalThis.Array);

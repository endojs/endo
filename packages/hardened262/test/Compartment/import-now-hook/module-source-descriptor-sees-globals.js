/*---
flags: []
---*/

const compartment = new Compartment(
  {},
  {},
  {
    resolveHook: specifier => specifier,
    importNowHook() {
      return undefined;
    },
  },
);

let threw = false;
try {
  compartment.importNow('x');
} catch (error) {
  threw = true;
}
assert(threw, 'must throw, did not throw');

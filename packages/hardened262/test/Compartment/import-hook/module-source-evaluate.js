/*---
flags: []
---*/

let message;
const print = _message => (message = _message);

const c1 = new Compartment({
  __options__: true,
  __noNamespaceBox__: true,
  globals: {
    print,
  },
  importHook: async () => {
    return new ModuleSource(`
      const c3 = new Compartment({ print });
      c3.evaluate('print("hi")');
    `);
  },
});

const c2 = new Compartment({
  __options__: true,
  importHook: async () => {
    return { namespace: '', compartment: c1 };
  },
});

c2.import('.').then(
  () => {
    assert.sameValue(message, 'hi');
  },
  error => assert.fail(error),
);

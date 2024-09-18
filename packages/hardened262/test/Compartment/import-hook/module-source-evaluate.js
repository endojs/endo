/*---
flags: [async]
---*/

let message;
const print = _message => (message = _message);

const c1 = new Compartment({
  __options__: true,
  __noNamespaceBox__: true,
  globals: {
    print,
  },
  loadHook: async () => {
    return {
      source: new ModuleSource(`
        const c3 = new Compartment({ globals: { print }, __options__: true });
        c3.evaluate('print("hi")');
      `),
    };
  },
});

const c2 = new Compartment({
  __options__: true,
  loadHook: async () => {
    return { namespace: '', compartment: c1 };
  },
});

c2.import('.').then(() => {
  assert.sameValue(message, 'hi');
});

/*---
flags: []
---*/

const compartment = new Compartment(
  {},
  {},
  {
    resolveHook: x => x,
    importHook() {
      throw new Error('no');
    },
    importNowHook(specifier) {
      if (specifier === 'entry') {
        return {
          imports: ['dep'],
          exports: ['a'],
          execute(env, compartment, resolutions) {
            const dep = compartment.importNow(resolutions['dep']).default;
            env.a = dep;
          },
        };
      } else if (specifier === 'dep') {
        return new ModuleSource(`
          export default 10;
        `);
      }
    },
  },
);

assert.sameValue(10, compartment.importNow('entry').a);

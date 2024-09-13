/*---
flags: [onlySesXs]
---*/

const c = new Compartment({
  __options__: true,
  resolveHook: specifier => specifier,
  importNowHook(specifier) {
    if (specifier === 'dependency') {
      return {
        source: new ModuleSource(`
          export const a = 10;
          export const b = 20;
        `),
      };
    }
    if (specifier === 'entry') {
      return {
        source: {
          bindings: [
            { importAllFrom: 'dependency', as: '_0' },
            { export: 'x' },
          ],
          execute(env) {
            env.x = env._0;
          },
        },
      };
    }
  },
});

assert.sameValue(c.importNow('dependency').a, 10);
assert.sameValue(c.importNow('dependency').b, 20);
assert.sameValue(c.importNow('entry').x.a, 10);
assert.sameValue(c.importNow('entry').x.b, 20);

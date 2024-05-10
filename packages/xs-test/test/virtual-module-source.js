import 'ses';
import { StaticModuleRecord as ModuleSource } from '@endo/static-module-record';
const print = globalThis.print ?? console.log;
const c = new Compartment(
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
          execute(env, c, resolutions) {
            const dep = c.importNow(resolutions['dep']).default;
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
assert.equal(10, c.importNow('entry').a);

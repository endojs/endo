import 'ses';
import { StaticModuleRecord as ModuleSource } from '@endo/static-module-record';

lockdown();

const print = globalThis.print ?? console.log;

const c1 = new Compartment(
  {
    print,
  },
  {},
  {
    resolveHook: s => s,
    importHook: async () => {
      return new ModuleSource(`
        const c3 = new Compartment({ print });
        c3.evaluate('print("hi")');
      `);
    },
  },
);

const c2 = new Compartment(
  {},
  {},
  {
    resolveHook: s => s,
    importHook: async () => {
      return { specifier: '', compartment: c1 };
    },
  },
);

c2.import('.').catch(assert.fail);

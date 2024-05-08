// This is a test fixture for XS validation (yarn test:xs with Moddable's xst
// on the PATH)
// This must be bundled with the -C xs condition to produce an artifact
// (tmp/test-xs.js) suitable for running with xst.
import { NativeModuleSource, NativeCompartment } from './_native.js';
// Eslint does not know about package reflexive imports (importing your own
// package), which in this case is necessary to go through the conditional
// export in package.json.
// eslint-disable-next-line import/no-extraneous-dependencies
import '@endo/module-source/shim.js';
import 'ses';

lockdown();

// spot checks
assert(Object.isFrozen(Object));

const source = new ModuleSource(`
  import name from 'imported';
  export * from 'reexported';
  export default 42;
  throw new Error('unreached');
`);
assert(source.imports[0] === 'imported');
assert(source.exports[0] === 'default');
assert(source.reexports[0] === 'reexported');

assert(source instanceof NativeModuleSource);

const compartment = new NativeCompartment({
  modules: {
    '.': {
      source: new ModuleSource(`
        export default 42;
      `),
    },
  },
});
assert(compartment.importNow('.').default === 42);

// to be continued with XS-specific adapters for Compartment in SES...

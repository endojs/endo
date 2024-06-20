// These tests exercise the Compartment importHook.

/* eslint max-lines: 0 */

import test from 'ava';
import { StaticModuleRecord } from '@endo/static-module-record';
import '../index.js';

test('import hook returns module source', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importHook(specifier) {
        if (specifier === './index.js') {
          return new StaticModuleRecord('export default 42');
        }
        return undefined;
      },
    },
  );
  const { namespace: index } = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('import hook returns module record descriptor with module source', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importHook(specifier) {
        if (specifier === './index.js') {
          return new StaticModuleRecord('export default 42');
        }
        return undefined;
      },
    },
  );
  const { namespace: index } = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('import hook returns virtual module source', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importHook(specifier) {
        if (specifier === './index.js') {
          return {
            imports: [],
            exports: ['default'],
            execute(env) {
              env.default = 42;
            },
          };
        }
        return undefined;
      },
    },
  );
  const { namespace: index } = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('import hook returns virtual module record descriptor', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importHook(specifier) {
        if (specifier === './index.js') {
          return {
            record: {
              imports: [],
              exports: ['default'],
              execute(env) {
                env.default = 42;
              },
            },
          };
        }
        return undefined;
      },
    },
  );
  const { namespace: index } = await compartment.import('./index.js');
  t.is(index.default, 42);
});

// This case requires the module loader to take care not to attempt to
// coerce the module namespace object to a promise.
test('import hook returns module namespace using module method', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importHook(specifier) {
        if (specifier === '.') {
          return compartment.module('./index.js');
        }
        if (specifier === './index.js') {
          return new StaticModuleRecord('export default 42');
        }
        return undefined;
      },
    },
  );
  // Unlike import, importNow does not box the namespace.
  const { namespace: index } = await compartment.import('.');
  t.is(index.default, 42);
});

test('import hook returns module namespace using import method', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importHook(specifier) {
        if (specifier === '.') {
          return compartment.import('./index.js');
        }
        if (specifier === './index.js') {
          return new StaticModuleRecord('export default 42');
        }
        return undefined;
      },
    },
  );
  // Unlike import, importNow does not box the namespace.
  const { namespace: index } = await compartment.import('.');
  t.is(index.default, 42);
});

test('import hook returns compartment and specifier module descriptor', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importHook(specifier) {
        if (specifier === '.') {
          return { compartment, specifier: './index.js' };
        }
        if (specifier === './index.js') {
          return new StaticModuleRecord('export default 42');
        }
        return undefined;
      },
    },
  );
  const { namespace: index } = await compartment.import('.');
  t.is(index.default, 42);
});

test('import hook returns record and specifier module descriptor', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importHook(specifier) {
        if (specifier === '.') {
          return {
            record: new StaticModuleRecord('export default 42'),
            specifier: './index.js',
          };
        }
        return undefined;
      },
    },
  );
  const { namespace: index } = await compartment.import('.');
  t.is(index.default, 42);
});

test('import hook returns record and specifier module descriptor and import specifiers resolve from response specifier', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './src/peer.js': new StaticModuleRecord('export const number = 42'),
    },
    // options:
    {
      resolveHook(importSpecifier, moduleSpecifier) {
        if (
          moduleSpecifier === './src/index.js' &&
          importSpecifier === './peer.js'
        ) {
          return './src/peer.js';
        }
        return importSpecifier;
      },
      importHook(specifier) {
        if (specifier === '.') {
          return {
            record: new StaticModuleRecord('export * from "./peer.js"'),
            specifier: './src/index.js',
          };
        }
        return undefined;
      },
    },
  );
  const { namespace: index } = await compartment.import('.');
  t.is(index.number, 42);
});

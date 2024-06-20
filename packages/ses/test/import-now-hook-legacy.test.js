// These tests exercise legacy module descriptor shapes for the Compartment
// importNowHook.

/* eslint max-lines: 0 */

import test from 'ava';
import { StaticModuleRecord } from '@endo/static-module-record';
import '../index.js';

test('import now hook returns precompiled module source', t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importNowHook(specifier) {
        if (specifier === './index.js') {
          return new StaticModuleRecord('export default 42');
        }
        return undefined;
      },
    },
  );
  const index = compartment.importNow('./index.js');
  t.is(index.default, 42);
});

test('import now hook returns virtual module source', t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importNowHook(specifier) {
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
  const index = compartment.importNow('./index.js');
  t.is(index.default, 42);
});

test('import now hook returns virtual module record descriptor', t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importNowHook(specifier) {
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
  const index = compartment.importNow('./index.js');
  t.is(index.default, 42);
});

test('import now hook returns namespace using module method', t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importNowHook(specifier) {
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
  const index = compartment.importNow('.');
  t.is(index.default, 42);
});

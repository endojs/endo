// These tests exercise the Compartment moduleMapHook for legacy module
// descriptor shapes.

/* eslint max-lines: 0 */

import test from 'ava';
import { StaticModuleRecord } from '@endo/static-module-record';
import '../index.js';

test('module map hook returns module source', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      moduleMapHook(specifier) {
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

test('module map hook returns module record descriptor', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      moduleMapHook(specifier) {
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

test('module map hook returns virtual module source', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      moduleMapHook(specifier) {
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

test('module map hook returns virtual module record descriptor', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      moduleMapHook(specifier) {
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

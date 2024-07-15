// These tests exercise the Compartment module map for legacy module
// descriptor shapes.

import test from 'ava';
import { ModuleSource } from '@endo/module-source';
import '../index.js';

test('module map primed with module source', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': new ModuleSource('export default 42'),
    },
    // options:
    {
      resolveHook: specifier => specifier,
    },
  );
  const { namespace: index } = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('module map primed with module record descriptor', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        record: new ModuleSource('export default 42'),
      },
    },
    // options:
    {
      resolveHook: specifier => specifier,
    },
  );
  const { namespace: index } = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('module map primed with virtual module source', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        imports: [],
        exports: ['default'],
        execute(env) {
          env.default = 42;
        },
      },
    },
    // options:
    {
      resolveHook: specifier => specifier,
    },
  );
  const { namespace: index } = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('module map primed with virtual module record descriptor', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        record: {
          imports: [],
          exports: ['default'],
          execute(env) {
            env.default = 42;
          },
        },
      },
    },
    // options:
    {
      resolveHook: specifier => specifier,
    },
  );
  const { namespace: index } = await compartment.import('./index.js');
  t.is(index.default, 42);
});

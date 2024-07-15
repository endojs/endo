// These tests exercise the Compartment module map.

import test from 'ava';
import { StaticModuleRecord as ModuleSource } from '@endo/static-module-record';
import '../index.js';

test('module map primed with module source descriptor with precompiled module source', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        source: new ModuleSource('export default 42'),
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

test('module map primed with module source descriptor with virtual module source', async t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        source: {
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

test('module map primed with parent compartment module source descriptor with string reference to parent compartment', async t => {
  const parent = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './meaning.js': {
        source: {
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

  const compartment = new parent.globalThis.Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        source: './meaning.js',
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

test('module map primed with parent compartment module source reference with different specifier', async t => {
  const parent = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './meaningful.js': {
        source: {
          imports: [],
          exports: ['meaning'],
          execute() {
            throw new Error('should not execute');
          },
        },
      },
      './meaning.js': {
        source: {
          imports: ['./meaningful.js'],
          exports: ['default'],
          execute(env, c, resolutions) {
            // eslint-disable-next-line no-use-before-define
            t.is(c, compartment);
            const { meaning } = c.importNow(resolutions['./meaningful.js']);
            env.default = meaning;
          },
        },
      },
    },
    // options:
    {
      name: 'parent',
      resolveHook(relative, specifier) {
        t.is(relative, './meaningful.js');
        t.is(specifier, './meaning.js');
        return relative;
      },
    },
  );

  const compartment = new parent.globalThis.Compartment(
    // endowments:
    {},
    // modules:
    {
      './lib/meaningful.js': {
        source: {
          imports: [],
          exports: ['meaning'],
          execute(env) {
            env.meaning = 42;
          },
        },
      },
      './index.js': {
        source: './meaning.js',
        specifier: './lib/meaning.js',
      },
    },
    // options:
    {
      name: 'child',
      resolveHook(relative, specifier) {
        t.is(relative, './meaningful.js');
        t.is(specifier, './lib/meaning.js');
        return './lib/meaningful.js';
      },
    },
  );
  const { namespace: index } = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('module map primed with module source descriptor for parent compartment with string reference', async t => {
  const parent = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    // options:
    {
      name: 'parent',
    },
  );

  const {
    namespace: { default: parentObject },
  } = await parent.import('./object.js');
  t.is(parentObject.meaning, 42);

  const compartment = new parent.globalThis.Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        source: './object.js',
        // implies parent compartment
      },
    },
    // options:
    {
      name: 'child',
    },
  );

  const {
    namespace: { default: childObject },
  } = await compartment.import('./index.js');
  t.is(childObject.meaning, 42);
  // Separate instances
  t.not(childObject, parentObject);
});

test('module map primed with parent compartment module namespace descriptor', async t => {
  const parent = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    // options:
    {
      name: 'parent',
    },
  );

  const {
    namespace: { default: parentObject },
  } = await parent.import('./object.js');
  t.is(parentObject.meaning, 42);

  const compartment = new parent.globalThis.Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        namespace: './object.js',
        // implies parent compartment
      },
    },
    // options:
    {
      name: 'child',
    },
  );

  const {
    namespace: { default: childObject },
  } = await compartment.import('./index.js');
  t.is(childObject.meaning, 42);
  // Same instances
  t.is(childObject, parentObject);
});

test('module map primed with module source descriptor with string reference to parent compartment', async t => {
  const compartment1 = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    // options:
    {
      name: 'compartment1',
    },
  );

  const {
    namespace: { default: object1 },
  } = await compartment1.import('./object.js');
  t.is(object1.meaning, 42);

  const compartment2 = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        source: './object.js',
        compartment: compartment1,
      },
    },
    // options:
    {
      name: 'child',
    },
  );

  const {
    namespace: { default: object2 },
  } = await compartment2.import('./index.js');
  t.is(object2.meaning, 42);
  // Separate instances
  t.not(object1, object2);
});

test('module map primed with other compartment module namespace descriptor', async t => {
  const compartment1 = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    // options:
    {
      name: 'compartment1',
    },
  );

  const {
    namespace: { default: object1 },
  } = await compartment1.import('./object.js');
  t.is(object1.meaning, 42);

  const compartment2 = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        namespace: './object.js',
        compartment: compartment1,
      },
    },
    // options:
    {
      name: 'child',
    },
  );

  const {
    namespace: { default: object2 },
  } = await compartment2.import('./index.js');
  t.is(object2.meaning, 42);
  // Same instances
  t.is(object1, object2);
});

test('module map primed with module namespace descriptor and namespace object', async t => {
  const compartment1 = new Compartment(
    {},
    {
      a: {
        source: new ModuleSource(`export default 42`),
      },
    },
    {},
  );
  const { namespace: namespace1 } = await compartment1.import('a');
  const compartment2 = new Compartment(
    {},
    {
      z: { namespace: namespace1 },
    },
    {},
  );
  const { namespace: namespace2 } = await compartment2.import('z');
  t.is(namespace2.default, 42);
  t.is(namespace1, namespace2);
});

test('module map primed with module namespace descriptor and non-namespace object', async t => {
  const compartment = new Compartment(
    {},
    {
      1: { namespace: { meaning: 42 } },
    },
    {},
  );
  const { namespace } = await compartment.import('1');
  t.is(namespace.meaning, 42);
});

test('module map precedes module map hook', t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {
      './index.js': {
        source: new ModuleSource(`
          export default 42;
        `),
      },
    },
    // options:
    {
      moduleMapHook() {
        throw new Error('not reached');
      },
    },
  );

  const { default: meaning } = compartment.importNow('./index.js');
  t.is(meaning, 42);
});

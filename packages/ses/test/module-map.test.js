// These tests exercise the Compartment module map.

import test from 'ava';
import { ModuleSource } from '@endo/module-source';
import '../index.js';

test('module map primed with module source descriptor with precompiled module source', async t => {
  const compartment = new Compartment({
    modules: {
      './index.js': {
        source: new ModuleSource('export default 42'),
      },
    },
    resolveHook: specifier => specifier,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const index = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('module map primed with module source descriptor with virtual module source', async t => {
  const compartment = new Compartment({
    modules: {
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
    resolveHook: specifier => specifier,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const index = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('module map primed with module source descriptor with no-imports virtual module source', async t => {
  const compartment = new Compartment({
    modules: {
      './index.js': {
        source: {},
      },
    },
    resolveHook: specifier => specifier,
    __noNamespaceBox__: true,
    __options__: true,
  });
  await t.throwsAsync(() => compartment.import('./index.js'), {
    message: /Invalid module source: 'imports' must be an array/,
  });
});

test('module map primed with module source descriptor with imports-with-non-string virtual module source', async t => {
  const compartment = new Compartment({
    modules: {
      './index.js': {
        source: {
          imports: [1],
        },
      },
    },
    resolveHook: specifier => specifier,
    __noNamespaceBox__: true,
    __options__: true,
  });
  await t.throwsAsync(() => compartment.import('./index.js'), {
    message: /Invalid module source: 'imports' must be an array of strings/,
  });
});

test('module map primed with module source descriptor with no-exports virtual module source', async t => {
  const compartment = new Compartment({
    modules: {
      './index.js': {
        source: {
          imports: [],
        },
      },
    },
    resolveHook: specifier => specifier,
    __noNamespaceBox__: true,
    __options__: true,
  });
  await t.throwsAsync(() => compartment.import('./index.js'), {
    message: /Invalid module source: 'exports' must be an array/,
  });
});

test('module map primed with module source descriptor with no-execute virtual module source', async t => {
  const compartment = new Compartment({
    modules: {
      './index.js': {
        source: {
          imports: [],
          exports: [],
        },
      },
    },
    resolveHook: specifier => specifier,
    __noNamespaceBox__: true,
    __options__: true,
  });
  await t.throwsAsync(() => compartment.import('./index.js'), {
    message: /Invalid module source/,
  });
});

test('module map primed with parent compartment module source descriptor with string reference to parent compartment', async t => {
  const parent = new Compartment({
    modules: {
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
    resolveHook: specifier => specifier,
    __options__: true,
  });

  const compartment = new parent.globalThis.Compartment({
    modules: {
      './index.js': {
        source: './meaning.js',
      },
    },
    resolveHook: specifier => specifier,
    __noNamespaceBox__: true,
    __options__: true,
  });
  const index = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('module map primed with parent compartment module source reference with different specifier', async t => {
  const parent = new Compartment({
    modules: {
      './meaningful.js': {
        source: {
          imports: [],
          exports: ['meaning'],
          execute() {
            throw Error('should not execute');
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
    name: 'parent',
    resolveHook(relative, specifier) {
      t.is(relative, './meaningful.js');
      t.is(specifier, './meaning.js');
      return relative;
    },
    __options__: true,
  });

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
      __noNamespaceBox__: true,
    },
  );
  const index = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('module map primed with module source descriptor for parent compartment with string reference', async t => {
  const parent = new Compartment({
    name: 'parent',
    modules: {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: parentObject } = await parent.import('./object.js');
  t.is(parentObject.meaning, 42);

  const compartment = new parent.globalThis.Compartment({
    name: 'child',
    modules: {
      './index.js': {
        source: './object.js',
        // implies parent compartment
      },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: childObject } = await compartment.import('./index.js');
  t.is(childObject.meaning, 42);
  // Separate instances
  t.not(childObject, parentObject);
});

test('module map primed with parent compartment module namespace descriptor', async t => {
  const parent = new Compartment({
    name: 'parent',
    modules: {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: parentObject } = await parent.import('./object.js');
  t.is(parentObject.meaning, 42);

  const compartment = new parent.globalThis.Compartment({
    name: 'child',
    modules: {
      './index.js': {
        namespace: './object.js',
        // implies parent compartment
      },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: childObject } = await compartment.import('./index.js');
  t.is(childObject.meaning, 42);
  // Same instances
  t.is(childObject, parentObject);
});

test('module map primed with module source descriptor with string reference to parent compartment', async t => {
  const compartment1 = new Compartment({
    name: 'compartment1',
    modules: {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object1 } = await compartment1.import('./object.js');
  t.is(object1.meaning, 42);

  const compartment2 = new Compartment({
    name: 'child',
    modules: {
      './index.js': {
        source: './object.js',
        compartment: compartment1,
      },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object2 } = await compartment2.import('./index.js');
  t.is(object2.meaning, 42);
  // Separate instances
  t.not(object1, object2);
});

test('module map primed with other compartment module namespace descriptor', async t => {
  const compartment1 = new Compartment({
    name: 'compartment1',
    modules: {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object1 } = await compartment1.import('./object.js');
  t.is(object1.meaning, 42);

  const compartment2 = new Compartment({
    name: 'child',
    modules: {
      './index.js': {
        namespace: './object.js',
        compartment: compartment1,
      },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object2 } = await compartment2.import('./index.js');
  t.is(object2.meaning, 42);
  // Same instances
  t.is(object1, object2);
});

test('module map primed with module namespace descriptor and namespace object', async t => {
  const compartment1 = new Compartment({
    modules: {
      a: {
        source: new ModuleSource(`export default 42`),
      },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });
  const namespace1 = await compartment1.import('a');
  const compartment2 = new Compartment({
    modules: {
      z: { namespace: namespace1 },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });
  const namespace2 = await compartment2.import('z');
  t.is(namespace2.default, 42);
  t.is(namespace1, namespace2);
});

test('module map primed with module namespace descriptor and non-namespace object', async t => {
  const compartment = new Compartment({
    modules: {
      1: { namespace: { meaning: 42 } },
    },
    __noNamespaceBox__: true,
    __options__: true,
  });
  const namespace = await compartment.import('1');
  t.is(namespace.meaning, 42);
});

test('module map precedes module map hook', t => {
  const compartment = new Compartment({
    modules: {
      './index.js': {
        source: new ModuleSource(`
          export default 42;
        `),
      },
    },
    moduleMapHook() {
      throw Error('not reached');
    },
    __options__: true,
  });

  const { default: meaning } = compartment.importNow('./index.js');
  t.is(meaning, 42);
});

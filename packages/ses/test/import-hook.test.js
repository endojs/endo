// @ts-nocheck
// These tests exercise the Compartment importHook.

/* eslint max-lines: 0 */

import test from 'ava';
import { ModuleSource } from '@endo/module-source';
import '../index.js';

test('import hook returns module source descriptor with precompiled module source', async t => {
  const compartment = new Compartment({
    resolveHook: specifier => specifier,
    importHook(specifier) {
      if (specifier === './index.js') {
        return {
          source: new ModuleSource('export default 42'),
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });
  const index = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('import hook returns module source descriptor with virtual module source', async t => {
  const compartment = new Compartment({
    resolveHook: specifier => specifier,
    importHook(specifier) {
      if (specifier === './index.js') {
        return {
          source: {
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
    __noNamespaceBox__: true,
    __options__: true,
  });
  const index = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('import hook returns parent compartment module source descriptor with string reference to parent compartment', async t => {
  const parent = new Compartment({
    resolveHook: specifier => specifier,
    importHook(specifier) {
      if (specifier === './meaning.js') {
        return {
          source: {
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
    __options__: true,
  });

  const compartment = new parent.globalThis.Compartment(
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
            source: './meaning.js',
          };
        }
        return undefined;
      },
      __noNamespaceBox__: true,
    },
  );
  const index = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('import hook returns parent compartment module source reference with different specifier', async t => {
  const parent = new Compartment({
    name: 'parent',
    resolveHook(relative, specifier) {
      t.is(relative, './meaningful.js');
      t.is(specifier, './meaning.js');
      return relative;
    },
    importHook(specifier) {
      if (specifier === './meaningful.js') {
        return {
          source: {
            imports: [],
            exports: ['meaning'],
            execute() {
              throw new Error('should not execute');
            },
          },
        };
      } else if (specifier === './meaning.js') {
        return {
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
        };
      }
      return undefined;
    },
    __options__: true,
  });

  const compartment = new parent.globalThis.Compartment({
    name: 'child',
    resolveHook(relative, specifier) {
      t.is(relative, './meaningful.js');
      t.is(specifier, './lib/meaning.js');
      return './lib/meaningful.js';
    },
    importHook(specifier) {
      if (specifier === './lib/meaningful.js') {
        return {
          source: {
            imports: [],
            exports: ['meaning'],
            execute(env) {
              env.meaning = 42;
            },
          },
        };
      } else if (specifier === './index.js') {
        return {
          source: './meaning.js',
          specifier: './lib/meaning.js',
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });
  const index = await compartment.import('./index.js');
  t.is(index.default, 42);
});

test('import hook returns module source descriptor for parent compartment with string reference', async t => {
  const parent = new Compartment({
    name: 'parent',
    importHook(specifier) {
      if (specifier === './object.js') {
        return {
          source: new ModuleSource('export default { meaning: 42 }'),
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: parentObject } = await parent.import('./object.js');
  t.is(parentObject.meaning, 42);

  const compartment = new parent.globalThis.Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'child',
      importHook(specifier) {
        if (specifier === './index.js') {
          return {
            source: './object.js',
            // implies parent compartment
          };
        }
        return undefined;
      },
      __noNamespaceBox__: true,
    },
  );

  const { default: childObject } = await compartment.import('./index.js');
  t.is(childObject.meaning, 42);
  // Separate instances
  t.not(childObject, parentObject);
});

test('import hook returns parent compartment module namespace descriptor', async t => {
  const parent = new Compartment({
    name: 'parent',
    importHook(specifier) {
      if (specifier === './object.js') {
        return {
          source: new ModuleSource('export default { meaning: 42 }'),
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: parentObject } = await parent.import('./object.js');
  t.is(parentObject.meaning, 42);

  const compartment = new parent.globalThis.Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'child',
      importHook(specifier) {
        if (specifier === './index.js') {
          return {
            namespace: './object.js',
            // implies parent compartment
          };
        }
        return undefined;
      },
      __noNamespaceBox__: true,
    },
  );

  const { default: childObject } = await compartment.import('./index.js');
  t.is(childObject.meaning, 42);
  // Same instances
  t.is(childObject, parentObject);
});

test('import hook returns module source descriptor with string reference to parent compartment', async t => {
  const compartment1 = new Compartment({
    name: 'compartment1',
    importHook(specifier) {
      if (specifier === './object.js') {
        return {
          source: new ModuleSource('export default { meaning: 42 }'),
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object1 } = await compartment1.import('./object.js');
  t.is(object1.meaning, 42);

  const compartment2 = new Compartment({
    name: 'child',
    importHook(specifier) {
      if (specifier === './index.js') {
        return {
          source: './object.js',
          compartment: compartment1,
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object2 } = await compartment2.import('./index.js');
  t.is(object2.meaning, 42);
  // Separate instances
  t.not(object1, object2);
});

test('import hook returns other compartment module namespace descriptor', async t => {
  const compartment1 = new Compartment({
    name: 'compartment1',
    importHook(specifier) {
      if (specifier === './object.js') {
        return {
          source: new ModuleSource('export default { meaning: 42 }'),
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object1 } = await compartment1.import('./object.js');
  t.is(object1.meaning, 42);

  const compartment2 = new Compartment({
    name: 'child',
    importHook(specifier) {
      if (specifier === './index.js') {
        return {
          namespace: './object.js',
          compartment: compartment1,
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object2 } = await compartment2.import('./index.js');
  t.is(object2.meaning, 42);
  // Same instances
  t.is(object1, object2);
});

test('import hook returns module namespace descriptor and namespace object', async t => {
  const compartment1 = new Compartment({
    importHook(specifier) {
      if (specifier === 'a') {
        return {
          source: new ModuleSource(`export default 42`),
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });
  const namespace1 = await compartment1.import('a');
  const compartment2 = new Compartment({
    importHook(specifier) {
      if (specifier === 'z') {
        return { namespace: namespace1 };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });
  const namespace2 = await compartment2.import('z');
  t.is(namespace2.default, 42);
  t.is(namespace1, namespace2);
});

test('import hook returns module namespace descriptor and non-namespace object', async t => {
  const compartment = new Compartment({
    importHook(specifier) {
      if (specifier === '1') {
        return { namespace: { meaning: 42 } };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });
  const namespace = await compartment.import('1');
  t.is(namespace.meaning, 42);
});

test('import hook returns module source descriptor for specifier in own compartment', async t => {
  const compartment = new Compartment({
    modules: {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    importHook(specifier) {
      if (specifier === './index.js') {
        return {
          source: './object.js',
          compartment,
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object1 } = await compartment.import('./object.js');
  t.is(object1.meaning, 42);
  const { default: object2 } = await compartment.import('./index.js');
  t.is(object2.meaning, 42);
  // Separate instances
  t.not(object1, object2);
});

test('import hook returns module source descriptor for specifier in own compartment and overridden base specifier that collides', async t => {
  const compartment = new Compartment({
    modules: {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    importHook(specifier) {
      if (specifier === './index.js') {
        return {
          source: './object.js',
          specifier: './object.js',
          compartment,
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object1 } = await compartment.import('./object.js');
  t.is(object1.meaning, 42);
  const { default: object2 } = await compartment.import('./index.js');
  t.is(object2.meaning, 42);
  // Fails to obtain separate instance due to specifier collison.
  t.is(object1, object2);
});

test('import hook returns module namespace descriptor for specifier in own compartment', async t => {
  const compartment = new Compartment({
    modules: {
      './object.js': {
        source: new ModuleSource('export default { meaning: 42 }'),
      },
    },
    importHook(specifier) {
      if (specifier === './index.js') {
        return {
          namespace: './object.js',
          compartment,
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: object1 } = await compartment.import('./object.js');
  t.is(object1.meaning, 42);
  const { default: object2 } = await compartment.import('./index.js');
  t.is(object2.meaning, 42);
  // Same instances
  t.is(object1, object2);
});

test('module map hook precedes import hook', async t => {
  const compartment = new Compartment({
    moduleMapHook(specifier) {
      if (specifier === './index.js') {
        return {
          source: new ModuleSource(`
              export default 42;
            `),
        };
      }
      return undefined;
    },
    importHook() {
      throw new Error('not reached');
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: meaning } = await compartment.import('./index.js');
  t.is(meaning, 42);
});

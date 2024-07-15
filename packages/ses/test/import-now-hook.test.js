// These tests exercise the Compartment importNowHook.

/* eslint max-lines: 0 */

import test from 'ava';
import { ModuleSource } from '@endo/module-source';
import '../index.js';

test('import now hook returns module source descriptor with precompiled module source', t => {
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
          return { source: new ModuleSource('export default 42') };
        }
        return undefined;
      },
    },
  );
  const index = compartment.importNow('./index.js');
  t.is(index.default, 42);
});

test('import now hook returns module source descriptor with virtual module source', t => {
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
    },
  );
  const index = compartment.importNow('./index.js');
  t.is(index.default, 42);
});

test('import now hook returns parent compartment module source descriptor with string reference to parent compartment', t => {
  const parent = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      resolveHook: specifier => specifier,
      importNowHook(specifier) {
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
    },
  );

  const compartment = new parent.globalThis.Compartment(
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
            source: './meaning.js',
          };
        }
        return undefined;
      },
    },
  );
  const index = compartment.importNow('./index.js');
  t.is(index.default, 42);
});

test('import now hook returns parent compartment module source reference with different specifier', t => {
  const parent = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'parent',
      resolveHook(relative, specifier) {
        t.is(relative, './meaningful.js');
        t.is(specifier, './meaning.js');
        return relative;
      },
      importNowHook(specifier) {
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
    },
  );

  const compartment = new parent.globalThis.Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'child',
      resolveHook(relative, specifier) {
        t.is(relative, './meaningful.js');
        t.is(specifier, './lib/meaning.js');
        return './lib/meaningful.js';
      },
      importNowHook(specifier) {
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
    },
  );
  const index = compartment.importNow('./index.js');
  t.is(index.default, 42);
});

test('import now hook returns module source descriptor for parent compartment with string reference', t => {
  const parent = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'parent',
      importNowHook(specifier) {
        if (specifier === './object.js') {
          return {
            source: new ModuleSource('export default { meaning: 42 }'),
          };
        }
        return undefined;
      },
    },
  );

  const { default: parentObject } = parent.importNow('./object.js');
  t.is(parentObject.meaning, 42);

  const compartment = new parent.globalThis.Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'child',
      importNowHook(specifier) {
        if (specifier === './index.js') {
          return {
            source: './object.js',
            // implies parent compartment
          };
        }
        return undefined;
      },
    },
  );

  const { default: childObject } = compartment.importNow('./index.js');
  t.is(childObject.meaning, 42);
  // Separate instances
  t.not(childObject, parentObject);
});

test('import now hook returns parent compartment module namespace descriptor', t => {
  const parent = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'parent',
      importNowHook(specifier) {
        if (specifier === './object.js') {
          return {
            source: new ModuleSource('export default { meaning: 42 }'),
          };
        }
        return undefined;
      },
    },
  );

  const { default: parentObject } = parent.importNow('./object.js');
  t.is(parentObject.meaning, 42);

  const compartment = new parent.globalThis.Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'child',
      importNowHook(specifier) {
        if (specifier === './index.js') {
          return {
            namespace: './object.js',
            // implies parent compartment
          };
        }
        return undefined;
      },
    },
  );

  const { default: childObject } = compartment.importNow('./index.js');
  t.is(childObject.meaning, 42);
  // Same instances
  t.is(childObject, parentObject);
});

test('import now hook returns module source descriptor with string reference to parent compartment', t => {
  const compartment1 = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'compartment1',
      importNowHook(specifier) {
        if (specifier === './object.js') {
          return {
            source: new ModuleSource('export default { meaning: 42 }'),
          };
        }
        return undefined;
      },
    },
  );

  const { default: object1 } = compartment1.importNow('./object.js');
  t.is(object1.meaning, 42);

  const compartment2 = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'child',
      importNowHook(specifier) {
        if (specifier === './index.js') {
          return {
            source: './object.js',
            compartment: compartment1,
          };
        }
        return undefined;
      },
    },
  );

  const { default: object2 } = compartment2.importNow('./index.js');
  t.is(object2.meaning, 42);
  // Separate instances
  t.not(object1, object2);
});

test('import now hook returns other compartment module namespace descriptor', t => {
  const compartment1 = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'compartment1',
      importNowHook(specifier) {
        if (specifier === './object.js') {
          return {
            source: new ModuleSource('export default { meaning: 42 }'),
          };
        }
        return undefined;
      },
    },
  );

  const { default: object1 } = compartment1.importNow('./object.js');
  t.is(object1.meaning, 42);

  const compartment2 = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      name: 'child',
      importNowHook(specifier) {
        if (specifier === './index.js') {
          return {
            namespace: './object.js',
            compartment: compartment1,
          };
        }
        return undefined;
      },
    },
  );

  const { default: object2 } = compartment2.importNow('./index.js');
  t.is(object2.meaning, 42);
  // Same instances
  t.is(object1, object2);
});

test('import now hook returns module namespace descriptor and namespace object', t => {
  const compartment1 = new Compartment(
    {},
    {},
    {
      importNowHook(specifier) {
        if (specifier === 'a') {
          return {
            source: new ModuleSource(`export default 42`),
          };
        }
        return undefined;
      },
    },
  );
  const namespace1 = compartment1.importNow('a');
  const compartment2 = new Compartment(
    {},
    {},
    {
      importNowHook(specifier) {
        if (specifier === 'z') {
          return { namespace: namespace1 };
        }
        return undefined;
      },
    },
  );
  const namespace2 = compartment2.importNow('z');
  t.is(namespace2.default, 42);
  t.is(namespace1, namespace2);
});

test('import now hook returns module namespace descriptor and non-namespace object', t => {
  const compartment = new Compartment(
    {},
    {},
    {
      importNowHook(specifier) {
        if (specifier === '1') {
          return { namespace: { meaning: 42 } };
        }
        return undefined;
      },
    },
  );
  const namespace = compartment.importNow('1');
  t.is(namespace.meaning, 42);
});

test('import now hook returns module source descriptor for specifier in own compartment', t => {
  const compartment = new Compartment(
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
      importNowHook(specifier) {
        if (specifier === './index.js') {
          return {
            source: './object.js',
            compartment,
          };
        }
        return undefined;
      },
    },
  );

  const { default: object1 } = compartment.importNow('./object.js');
  t.is(object1.meaning, 42);
  const { default: object2 } = compartment.importNow('./index.js');
  t.is(object2.meaning, 42);
  // Separate instances
  t.not(object1, object2);
});

test('import now hook returns module source descriptor for specifier in own compartment and overridden base specifier that collides', t => {
  const compartment = new Compartment(
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
      importNowHook(specifier) {
        if (specifier === './index.js') {
          return {
            source: './object.js',
            specifier: './object.js',
            compartment,
          };
        }
        return undefined;
      },
    },
  );

  const { default: object1 } = compartment.importNow('./object.js');
  t.is(object1.meaning, 42);
  const { default: object2 } = compartment.importNow('./index.js');
  t.is(object2.meaning, 42);
  // Fails to obtain separate instance due to specifier collison.
  t.is(object1, object2);
});

test('import now hook returns module namespace descriptor for specifier in own compartment', t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
      importNowHook(specifier) {
        if (specifier === './index.js') {
          return {
            namespace: './object.js',
            compartment,
          };
        } else if (specifier === './object.js') {
          return {
            source: new ModuleSource('export default { meaning: 42 }'),
          };
        }
        return undefined;
      },
    },
  );

  const { default: object1 } = compartment.importNow('./object.js');
  t.is(object1.meaning, 42);
  const { default: object2 } = compartment.importNow('./index.js');
  t.is(object2.meaning, 42);
  // Same instances
  t.is(object1, object2);
});

test('module map hook precedes import now hook', t => {
  const compartment = new Compartment(
    // endowments:
    {},
    // modules:
    {},
    // options:
    {
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
      importNowHook() {
        throw new Error('not reached');
      },
    },
  );

  const { default: meaning } = compartment.importNow('./index.js');
  t.is(meaning, 42);
});

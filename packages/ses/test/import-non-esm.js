import tap from 'tap';
import { resolveNode } from './node.js';
import '../ses.js';

const { test } = tap;

test('import a non-ESM', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async () => {
    return {
      imports: [],
      execute(exports) {
        exports.meaning = 42;
      },
    };
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const module = compartment.module('.');
  const {
    namespace: { meaning },
  } = await compartment.import('.');

  t.equal(meaning, 42, 'exports seen');
  t.equal(module.meaning, 42, 'exports seen through deferred proxy');
});

test('non-ESM imports non-ESM by name', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return {
        imports: ['./odd'],
        execute(exports) {
          exports.even = n => n % 2 === 0;
        },
      };
    }
    if (specifier === './odd') {
      return {
        imports: ['./even'],
        execute(exports, compartment) {
          const { even } = compartment.importNow('./even');
          exports.odd = n => !even(n);
        },
      };
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('non-ESM imports non-ESM as default', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return {
        imports: ['./odd'],
        execute(exports) {
          exports.default = n => n % 2 === 0;
        },
      };
    }
    if (specifier === './odd') {
      return {
        imports: ['./even'],
        execute(exports, compartment) {
          const { default: even } = compartment.importNow('./even');
          exports.default = n => !even(n);
        },
      };
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { default: odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('ESM imports non-ESM as default', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return {
        imports: ['./odd'],
        execute(exports) {
          exports.default = n => n % 2 === 0;
        },
      };
    }
    if (specifier === './odd') {
      return StaticModuleRecord(
        `
        import even from './even';
        export default n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { default: odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('ESM imports non-ESM by name', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return {
        imports: ['./odd'],
        execute(exports) {
          exports.even = n => n % 2 === 0;
        },
      };
    }
    if (specifier === './odd') {
      return StaticModuleRecord(
        `
        import { even } from './even';
        export const odd = n => !even(n);
      `,
        'https://example.com/odd',
      );
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('non-ESM imports ESM as default', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return StaticModuleRecord(
        `
        export default n => n % 2 === 0;
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return {
        imports: ['./even'],
        execute(exports, compartment) {
          const { default: even } = compartment.importNow('./even');
          exports.default = n => !even(n);
        },
      };
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { default: odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('non-ESM imports ESM by name', async t => {
  t.plan(2);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './even') {
      return StaticModuleRecord(
        `
        export const even = n => n % 2 === 0;
      `,
        'https://example.com/even',
      );
    }
    if (specifier === './odd') {
      return {
        imports: ['./even'],
        execute(exports, compartment) {
          const { even } = compartment.importNow('./even');
          exports.odd = n => !even(n);
        },
      };
    }
    throw new Error(`Cannot load module ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  const {
    namespace: { odd },
  } = await compartment.import('./odd');

  t.equal(odd(1), true);
  t.equal(odd(2), false);
});

test('cross import ESM and non-ESMs', async t => {
  t.plan(5);

  const resolveHook = resolveNode;
  const importHook = async specifier => {
    if (specifier === './src/main.js') {
      return {
        imports: ['./other.js', './helper.mjs'],
        execute(_exports, compartment, resolvedImports) {
          const direct = compartment.importNow(resolvedImports['./other.js']);
          const indirect = compartment.importNow(
            resolvedImports['./helper.mjs'],
          );
          t.equal(direct.a, 10);
          t.equal(direct.b, 20);
          t.equal(indirect.a, 10);
          t.equal(indirect.b, 20);
          t.equal(indirect.c, 30);
        },
      };
    }
    if (specifier === './src/helper.mjs') {
      return new StaticModuleRecord(`
        export * from './other.js';
        import d from './default.js';
        export const c = d;
      `);
    }
    if (specifier === './src/other.js') {
      return {
        imports: [],
        execute(exports) {
          exports.a = 10;
          exports.b = 20;
        },
      };
    }
    if (specifier === './src/default.js') {
      return {
        imports: [],
        execute(exports) {
          exports.default = 30;
        },
      };
    }
    throw new Error(`Cannot load module for specifier ${specifier}`);
  };

  const compartment = new Compartment({}, {}, { resolveHook, importHook });
  await compartment.import('./src/main.js');
});

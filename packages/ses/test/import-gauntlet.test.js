// These tests exercise all forms of import and export between a pair of
// modules using a single Compartment.

import test from 'ava';
import '../index.js';
import { resolveNode, makeNodeImporter } from './node.js';

test('import for side effect', async t => {
  t.plan(0);

  const makeImportHook = makeNodeImporter({
    'https://example.com/import-for-side-effect.js': `
      // empty
    `,
    'https://example.com/main.js': `
      import './import-for-side-effect.js';
    `,
  });

  const compartment = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  await compartment.import('./main.js');
});

test('import all from module', async t => {
  t.plan(2);

  const makeImportHook = makeNodeImporter({
    'https://example.com/import-all-from-me.js': `
      export const a = 10;
      export const b = 20;
    `,
    'https://example.com/main.js': `
      import * as bar from './import-all-from-me.js';
      export default bar;
    `,
  });

  const compartment = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.is(namespace.default.a, 10);
  t.is(namespace.default.b, 20);
});

test('import named exports from me', async t => {
  t.plan(2);

  const makeImportHook = makeNodeImporter({
    'https://example.com/import-named-exports-from-me.js': `
      export const fizz = 10;
      export const buzz = 20;
    `,
    'https://example.com/main.js': `
      import { fizz, buzz } from './import-named-exports-from-me.js';
      export default { fizz, buzz };
    `,
  });

  const compartment = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.is(namespace.default.fizz, 10);
  t.is(namespace.default.buzz, 20);
});

test('import color from module', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/import-named-export-and-rename.js': `
      export const color = 'blue';
    `,
    'https://example.com/main.js': `
      import { color as colour } from './import-named-export-and-rename.js';
      export const color = colour;
    `,
  });

  const compartment = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.is(namespace.color, 'blue');
});

test('import and reexport', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/import-and-reexport-name-from-me.js': `
      export const qux = 42;
    `,
    'https://example.com/main.js': `
      export { qux } from './import-and-reexport-name-from-me.js';
    `,
  });

  const compartment = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.is(namespace.qux, 42);
});

test('import and export all', async t => {
  t.plan(2);

  const makeImportHook = makeNodeImporter({
    'https://example.com/import-and-export-all-from-me.js': `
      export const alpha = 0;
      export const omega = 23;
    `,
    'https://example.com/main.js': `
      export * from './import-and-export-all-from-me.js';
    `,
  });

  const compartment = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.is(namespace.alpha, 0);
  t.is(namespace.omega, 23);
});

test('live binding', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/import-live-export.js': `
      export let quuux = null;
      // Live binding of an exported variable.
      quuux = 'Hello, World!';
    `,
    'https://example.com/main.js': `
      import { quuux } from './import-live-export.js';
      export default quuux;
    `,
  });

  const compartment = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.is(namespace.default, 'Hello, World!');
});

test('live binding through reexporting intermediary', async t => {
  t.plan(2);

  const makeImportHook = makeNodeImporter({
    'https://example.com/import-live-export.js': `
      export let quuux = null;
      export function live() {
        // Live binding of an exported variable.
        quuux = 'Hello, World!';
      }
    `,
    'https://example.com/reexport-live-export.js': `
      export * from './import-live-export.js';
    `,
    'https://example.com/main.js': `
      import { quuux, live } from './reexport-live-export.js';
      t.is(quuux, null);
      live();
      t.is(quuux, 'Hello, World!');
    `,
  });

  const compartment = new Compartment(
    { t },
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  await compartment.import('./main.js');
});

test('export name as default', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/meaning.js': `
      const meaning = 42;
      export { meaning as default };
    `,
    'https://example.com/main.js': `
      import meaning from './meaning.js';
      t.is(meaning, 42);
    `,
  });

  const compartment = new Compartment(
    { t },
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  await compartment.import('./main.js');
});

test('export-as with duplicated export name', async t => {
  t.plan(4);

  const makeImportHook = makeNodeImporter({
    'https://example.com/abc.js': `
      export const answer = 42;
    `,
    'https://example.com/xyz.js': `
      export const answer = 1337;
    `,
    'https://example.com/qwe.js': `
      export default 3791;
    `,
    'https://example.com/reexport.js': `
      export { answer as answer1 } from './abc.js';
      export { answer as answer2 } from './xyz.js';
      export { answer as answer3 } from './xyz.js';
      export { default as answer4 } from './qwe.js';
    `,
    'https://example.com/main.js': `
      import { answer1, answer2, answer3, answer4 } from './reexport.js';
      // t.log({ answer1, answer2, answer3, answer4 })
      t.is(answer1, 42);
      t.is(answer2, 1337);
      t.is(answer3, 1337);
      t.is(answer4, 3791);
    `,
  });

  const compartment = new Compartment(
    { t },
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  await compartment.import('./main.js');
});

// throws SyntaxError: This experimental syntax requires enabling the parser plugin: "exportDefaultFrom". (4:13)
test.failing('reexport with implicit default syntax', async t => {
  t.plan(2);
  const makeImportHook = makeNodeImporter({
    'https://example.com/qwe.js': `
      export default 3791;
    `,
    'https://example.com/reexport.js': `
      export a, { default as b } from './qwe.js';
    `,
    'https://example.com/main.js': `
      import { a, b } from './reexport.js';
      t.is(a, 3791);
      t.is(b, 3791);
    `,
  });

  const compartment = new Compartment(
    { t },
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
    },
  );

  await compartment.import('./main.js');
});

test('importHook returning a RedirectStaticModuleInterface with a specified compartment', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/alias-target.js': `
      const meaning = 42;
      export { meaning as default };
    `,
    'https://example.com/main.js': `
      import meaning from './meaning.js';
      t.is(meaning, 42);
    `,
  });
  const importHook = makeImportHook('https://example.com');
  const aliasRegistry = {
    './meaning.js': './alias-target.js',
  };

  const compartment = new Compartment(
    { t },
    {},
    {
      resolveHook: resolveNode,
      importHook: async moduleSpecifier => {
        const aliasTarget = aliasRegistry[moduleSpecifier];
        if (aliasTarget !== undefined) {
          const record = {
            specifier: aliasTarget,
            compartment,
          };
          return record;
        }
        return importHook(moduleSpecifier);
      },
    },
  );

  await compartment.import('./main.js');
});

// while this test demonstrates different behavior between module source and
// the module's precompiled functor, that is not the intention of the
// feature and just serves to show that the precompiled functor is used.
test('importHook returning a ModuleInstance with a precompiled functor', async t => {
  t.plan(2);

  const makeImportHook = makeNodeImporter({
    'https://example.com/precompiled.js': `
      export const a = 0;
      export let b = 0;
      b = 666;
      throw Error('this should not run');
    `,
    'https://example.com/main.js': `
      import { a, b } from './precompiled.js';
      t.is(a, 123);
      t.is(b, 456);
    `,
  });
  const importHook = makeImportHook('https://example.com');

  const compartment = new Compartment(
    { t },
    {},
    {
      resolveHook: resolveNode,
      importHook: async moduleSpecifier => {
        if (moduleSpecifier === './precompiled.js') {
          const baseRecord = await importHook(moduleSpecifier);
          return {
            ...baseRecord,
            __syncModuleFunctor__: ({ onceVar, liveVar }) => {
              onceVar.a(123);
              liveVar.b(456);
            },
          };
        }
        return importHook(moduleSpecifier);
      },
    },
  );

  await compartment.import('./main.js');
});

test('this in module scope must be undefined', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/index.js': `
      t.is(this, undefined, 'this must be undefined in module scope');
    `,
  });
  const importHook = makeImportHook('https://example.com');

  const compartment = new Compartment(
    { t },
    {},
    {
      resolveHook: resolveNode,
      importHook,
    },
  );

  await compartment.import('./index.js');
});

// These tests exercise the Compartment import interface and linkage
// between compartments.

import tap from 'tap';
import { Compartment } from '../src/main.js';
import { resolveNode, makeNodeImporter } from './node.js';
import { makeImporter, makeStaticRetriever } from './import-commons.js';

const { test } = tap;

// This test demonstrates a system of modules in a single Compartment
// that uses fully qualified URLs as module specifiers and module locations,
// not distinguishing one from the other.
test('import within one compartment, web resolution', async t => {
  const retrieve = makeStaticRetriever({
    'https://example.com/packages/example/half.js': `
      export default 21;
    `,
    'https://example.com/packages/example/': `
      import half from 'half.js';
      export const meaning = double(half);
    `,
  });
  const locate = moduleSpecifier => moduleSpecifier;
  const resolveHook = (spec, referrer) => new URL(spec, referrer).toString();
  const importHook = makeImporter(locate, retrieve);

  const compartment = new Compartment(
    // endowments:
    {
      double: n => n * 2,
    },
    // module map:
    {},
    // options:
    {
      resolveHook,
      importHook,
    },
  );

  const { namespace } = await compartment.import(
    'https://example.com/packages/example/',
  );

  t.equal(namespace.meaning, 42, 'dynamically imports the meaning');
});

// This case demonstrates the same arrangement except that the Compartment uses
// Node.js module specifier resolution.
test('import within one compartment, node resolution', async t => {
  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/example/half.js': `
      export default 21;
    `,
    'https://example.com/packages/example/main.js': `
      import half from './half.js';
      export const meaning = double(half);
    `,
  });

  const compartment = new Compartment(
    // endowments:
    {
      double: n => n * 2,
    },
    // module map:
    {},
    // options:
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/example'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.equal(namespace.meaning, 42, 'dynamically imports the meaning');
});

// This demonstrates a pair of linked Node.js compartments.
test('two compartments, three modules, one endowment', async t => {
  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/example/half.js': `
      if (typeof double !== 'undefined') {
        throw new Error('Unexpected leakage of double(n) endowment: ' + typeof double);
      }
      export default 21;
    `,
    'https://example.com/packages/example/main.js': `
      import half from './half.js';
      import double from 'double';
      export const meaning = double(half);
    `,
    'https://example.com/packages/double/main.js': `
      export default double;
    `,
  });

  const doubleCompartment = new Compartment(
    // endowments:
    {
      double: n => n * 2,
    },
    // module map:
    {},
    // options:
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/double'),
    },
  );

  const compartment = new Compartment(
    // endowments:
    {},
    // module map:
    {
      // Notably, this is the first case where we thread a depencency between
      // two compartments, using the sigil of one's namespace to indicate
      // linkage before the module has been loaded.
      double: doubleCompartment.module('./main.js'),
    },
    // options:
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/example'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.equal(namespace.meaning, 42, 'dynamically imports the meaning');
});

// This demonstrates the use of a module map to create an internal
// module specifier alias.
test('aliases within a compartment', async t => {
  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/meaning/main.js': `
      export const meaning = 42;
    `,
  });

  const compartment = new Compartment(
    // endowments:
    {},
    // module map:
    {
      alias: './main.js',
    },
    // options:
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/meaning'),
    },
  );

  const { namespace } = await compartment.import('alias');

  t.equal(namespace.meaning, 42, 'dynamically imports the meaning');
});

test('module exports namespace is not extensible', async t => {
  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/empty/main.js': ``,
  });

  const compartment = new Compartment(
    // endowments:
    {},
    // module map:
    {},
    // options:
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/empty'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.throws(() => {
    namespace.meaning = 10;
  }, /Cannot add property meaning, object is not extensible/);
});

test('import for side effect', async t => {
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
      resolveHook: resolve,
      importHook: makeImportHook('https://example.com'),
    },
  );

  await compartment.import('./main.js');

  t.end();
});

test('import all from module', async t => {
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
      resolveHook: resolve,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.equal(namespace.default.a, 10);
  t.equal(namespace.default.b, 20);

  t.end();
});

test('import named exports from me', async t => {
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
      resolveHook: resolve,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.equal(namespace.default.fizz, 10);
  t.equal(namespace.default.buzz, 20);

  t.end();
});

test('import all from module', async t => {
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
      resolveHook: resolve,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.equal(namespace.color, 'blue');

  t.end();
});

test('import and reexport', async t => {
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
      resolveHook: resolve,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.equal(namespace.qux, 42);

  t.end();
});

test('import and export all', async t => {
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
      resolveHook: resolve,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.equal(namespace.alpha, 0);
  t.equal(namespace.omega, 23);

  t.end();
});

test('live binding', async t => {
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
      resolveHook: resolve,
      importHook: makeImportHook('https://example.com'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.equal(namespace.default, 'Hello, World!');

  t.end();
});

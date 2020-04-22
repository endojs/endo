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

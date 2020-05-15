// These tests exercise the Compartment import interface and linkage
// between compartments, and Compartment endowments.

/* eslint max-lines: 0 */

import tap from 'tap';
import { Compartment } from '../src/main.js';
import { resolveNode, makeNodeImporter } from './node.js';
import { makeImporter, makeStaticRetriever } from './import-commons.js';

const { test } = tap;

// This test demonstrates a system of modules in a single Compartment
// that uses fully qualified URLs as module specifiers and module locations,
// not distinguishing one from the other.
test('import within one compartment, web resolution', async t => {
  t.plan(1);

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
  t.plan(1);

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
  t.plan(1);

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

test('module exports namespace as an object', async t => {
  t.plan(7);

  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/meaning/main.js': `
      export const meaning = 42;
    `,
  });

  const compartment = new Compartment(
    // endowments:
    {},
    // module map:
    {},
    // options:
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/meaning'),
    },
  );

  const { namespace } = await compartment.import('./main.js');

  t.equals(
    namespace.meaning,
    42,
    'exported constant must have a namespace property',
  );

  t.throws(() => {
    namespace.alternateMeaning = 10;
  }, /^Cannot set property/);

  // The first should not throw.
  t.ok(Reflect.preventExtensions(namespace), 'extensions must be preventable');
  // The second should agree.
  t.ok(
    Reflect.preventExtensions(namespace),
    'preventing extensions must be idempotent',
  );

  const desc = Object.getOwnPropertyDescriptor(namespace, 'meaning');
  t.equals(
    typeof desc,
    'object',
    'property descriptor for defined export must be an object',
  );
  t.equals(desc.set, undefined, 'constant export must not be writeable');

  t.equal(
    Object.getPrototypeOf(namespace),
    null,
    'module exports namespace prototype must be null',
  );
});

test('modules are memoized', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/example/c-s-lewis.js': `
      export const entity = {};
    `,
    'https://example.com/packages/example/clive-hamilton.js': `
      import { entity } from './c-s-lewis.js';
      export default entity;
    `,
    'https://example.com/packages/example/n-w-clerk.js': `
      import { entity } from './c-s-lewis.js';
      export default entity;
    `,
    'https://example.com/packages/example/main.js': `
      import clive from './clive-hamilton.js';
      import clerk from './n-w-clerk.js';
      export default { clerk, clive };
    `,
  });

  const compartment = new Compartment(
    // endowments:
    {},
    // module map:
    {},
    // options:
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/example'),
    },
  );

  const { namespace } = await compartment.import('./main.js');
  const { clive, clerk } = namespace;

  t.ok(clive === clerk, 'diamond dependency must refer to the same module');
});

test('compartments with same sources do not share instances', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/arm/main.js': `
      export default {};
    `,
  });

  const leftCompartment = new Compartment(
    {}, // endowments
    {}, // module map
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/arm'),
    },
  );

  const rightCompartment = new Compartment(
    {}, // endowments
    {}, // module map
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/arm'),
    },
  );

  const [
    {
      namespace: { default: leftArm },
    },
    {
      namespace: { default: rightArm },
    },
  ] = await Promise.all([
    leftCompartment.import('./main.js'),
    rightCompartment.import('./main.js'),
  ]);

  t.ok(
    leftArm !== rightArm,
    'different compartments with same sources do not share instances',
  );
});

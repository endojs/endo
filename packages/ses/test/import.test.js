// These tests exercise the Compartment import interface and linkage
// between compartments, and Compartment endowments.

/* eslint max-lines: 0 */

import tap from 'tap';
import { Compartment } from '../src/compartment-shim.js';
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

const trimModuleSpecifierPrefix = (moduleSpecifier, prefix) => {
  if (moduleSpecifier === prefix) {
    return './index.js';
  }
  if (moduleSpecifier.startsWith(`${prefix}/`)) {
    return `./${moduleSpecifier.slice(prefix.length + 1)}`;
  }
  return undefined;
};

test('module map hook', async t => {
  t.plan(2);

  const makeImportHook = makeNodeImporter({
    'https://example.com/main.js': `
      import dependency from 'dependency';
      import utility from 'dependency/utility.js';

      t.equal(dependency, "dependency");
      t.equal(utility, "utility");
    `,
    'https://example.com/dependency/index.js': `
      export default "dependency";
    `,
    'https://example.com/dependency/utility.js': `
      export default "utility";
    `,
  });

  const dependency = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/dependency'),
    },
  );

  const compartment = new Compartment(
    { t },
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
      moduleMapHook: moduleSpecifier => {
        const remainder = trimModuleSpecifierPrefix(
          moduleSpecifier,
          'dependency',
        );
        if (remainder) {
          return dependency.module(remainder);
        }
        return undefined;
      },
    },
  );

  await compartment.import('./main.js');
});

test('mutual dependency between compartments', async t => {
  t.plan(12);

  const makeImportHook = makeNodeImporter({
    'https://example.com/main.js': `
      import isEven from "even";
      import isOdd from "odd";

      for (const n of [0, 2, 4]) {
        t.ok(isEven(n), \`\${n} should be even\`);
        t.ok(!isOdd(n), \`\${n} should not be odd\`);
      }
      for (const n of [1, 3, 5]) {
        t.ok(isOdd(n), \`\${n} should be odd\`);
        t.ok(!isEven(n), \`\${n} should not be even\`);
      }
    `,
    'https://example.com/even/index.js': `
      import isOdd from "odd";
      export default n => n === 0 || isOdd(n - 1);
    `,
    'https://example.com/odd/index.js': `
      import isEven from "even";
      export default n => n !== 0 && isEven(n - 1);
    `,
  });

  const moduleMapHook = moduleSpecifier => {
    // Mutual dependency ahead:
    // eslint-disable-next-line no-use-before-define
    for (const [prefix, compartment] of Object.entries({ even, odd })) {
      const remainder = trimModuleSpecifierPrefix(moduleSpecifier, prefix);
      if (remainder) {
        return compartment.module(remainder);
      }
    }
    return undefined;
  };

  const even = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/even'),
      moduleMapHook,
    },
  );

  const odd = new Compartment(
    {},
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/odd'),
      moduleMapHook,
    },
  );

  const compartment = new Compartment(
    { t },
    {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com'),
      moduleMapHook,
    },
  );

  await compartment.import('./main.js');
});

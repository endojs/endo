// @ts-nocheck
// These tests exercise the Compartment import interface and linkage
// between compartments, and Compartment endowments.

/* eslint max-lines: 0 */

import test from 'ava';
import { ModuleSource } from '@endo/module-source';
import '../index.js';
import { resolveNode, makeNodeImporter } from './_node.js';
import { makeImporter, makeStaticRetriever } from './_import-commons.js';

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

  const compartment = new Compartment({
    globals: {
      double: n => n * 2,
    },
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import(
    'https://example.com/packages/example/',
  );

  t.is(namespace.meaning, 42, 'dynamically imports the meaning');
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

  const compartment = new Compartment({
    globals: {
      double: n => n * 2,
    },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/packages/example'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

  t.is(namespace.meaning, 42, 'dynamically imports the meaning');
});

// This demonstrates a pair of linked Node.js compartments.
test('two compartments, three modules, one endowment', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/example/half.js': `
      if (typeof double !== 'undefined') {
        throw Error('Unexpected leakage of double(n) endowment: ' + typeof double);
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

  const doubleCompartment = new Compartment({
    globals: {
      double: n => n * 2,
    },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/packages/double'),
    __options__: true,
  });

  const compartment = new Compartment({
    modules: {
      // Notably, this is the first case where we thread a depencency between
      // two compartments, using the sigil of one's namespace to indicate
      // linkage before the module has been loaded.
      double: {
        namespace: './main.js',
        compartment: doubleCompartment,
      },
    },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/packages/example'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

  t.is(namespace.meaning, 42, 'dynamically imports the meaning');
});

test('module exports namespace as an object', async t => {
  t.plan(7);

  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/meaning/main.js': `
      export const meaning = 42;
    `,
  });

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/packages/meaning'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

  t.is(
    namespace.meaning,
    42,
    'exported constant must have a namespace property',
  );

  t.throws(
    () => {
      namespace.alternateMeaning = 10;
    },
    { message: /^Cannot set property/ },
  );

  // The first should not throw.
  t.truthy(
    Reflect.preventExtensions(namespace),
    'extensions must be preventable',
  );
  // The second should agree.
  t.truthy(
    Reflect.preventExtensions(namespace),
    'preventing extensions must be idempotent',
  );

  const desc = Object.getOwnPropertyDescriptor(namespace, 'meaning');
  t.is(
    typeof desc,
    'object',
    'property descriptor for defined export must be an object',
  );
  t.is(desc.set, undefined, 'constant export must not be writeable');

  t.is(
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

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/packages/example'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');
  const { clive, clerk } = namespace;

  t.truthy(clive === clerk, 'diamond dependency must refer to the same module');
});

test('compartments with same sources do not share instances', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/arm/main.js': `
      export default {};
    `,
  });

  const leftCompartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/packages/arm'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const rightCompartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/packages/arm'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const [{ default: leftArm }, { default: rightArm }] = await Promise.all([
    leftCompartment.import('./main.js'),
    rightCompartment.import('./main.js'),
  ]);

  t.truthy(
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

      t.is(dependency, "dependency");
      t.is(utility, "utility");
    `,
    'https://example.com/dependency/index.js': `
      export default "dependency";
    `,
    'https://example.com/dependency/utility.js': `
      export default "utility";
    `,
  });

  const dependency = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/dependency'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    moduleMapHook: moduleSpecifier => {
      const remainder = trimModuleSpecifierPrefix(
        moduleSpecifier,
        'dependency',
      );
      if (remainder) {
        return {
          namespace: remainder,
          compartment: dependency,
        };
      }
      return undefined;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  await compartment.import('./main.js');
});

test('mutual dependency between compartments', async t => {
  t.plan(12);

  const makeImportHook = makeNodeImporter({
    'https://example.com/main.js': `
      import isEven from "even";
      import isOdd from "odd";

      for (const n of [0, 2, 4]) {
        t.truthy(isEven(n), \`\${n} should be even\`);
        t.truthy(!isOdd(n), \`\${n} should not be odd\`);
      }
      for (const n of [1, 3, 5]) {
        t.truthy(isOdd(n), \`\${n} should be odd\`);
        t.truthy(!isEven(n), \`\${n} should not be even\`);
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
        return {
          compartment,
          namespace: remainder,
        };
      }
    }
    return undefined;
  };

  const even = new Compartment({
    name: 'https://example.com/even',
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/even'),
    moduleMapHook,
    __noNamespaceBox__: true,
    __options__: true,
  });

  const odd = new Compartment({
    name: 'https://example.com/odd',
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com/odd'),
    moduleMapHook,
    __noNamespaceBox__: true,
    __options__: true,
  });

  const compartment = new Compartment({
    globals: { t },
    name: 'https://example.com',
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    moduleMapHook,
    __noNamespaceBox__: true,
    __options__: true,
  });

  await compartment.import('./main.js');
});

test('import redirect shorthand', async t => {
  // The following use of Math.random() is informative but does not
  // affect the outcome of the test, just makes the nature of the error
  // obvious in test output.
  // The containing objects should be identical.
  // The contained value should incidentally be identical.
  // The test depends on the former.

  const makeImportHook = makeNodeImporter({
    'https://example.com/main/index.js': `
      export const unique = {n: Math.random()};
      export const meaning = 42;
    `,
  });

  const wrappedImportHook = makeImportHook('https://example.com');

  const importHook = async specifier => {
    await null;
    const candidates = [specifier, `${specifier}.js`, `${specifier}/index.js`];
    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const record = await wrappedImportHook(candidate).catch(_ => undefined);
      // return a RedirectStaticModuleInterface with an explicit record
      if (record !== undefined) {
        return { record, specifier };
      }
    }
    throw Error(`Cannot find module ${specifier}`);
  };

  const compartment = new Compartment({
    globals: { Math },
    resolveHook: resolveNode,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main');
  t.is(
    namespace.meaning,
    42,
    'dynamically imports the meaning through a redirect',
  );

  // TODO The following commented test does not pass, and might not be valid.
  // Web browsers appear to have taken the stance that they will load a static
  // module record once per *response url* and create unique a unique module
  // instance per *request url*.
  //
  // const { namespace: aliasNamespace } = await compartment.import(
  //   './main/index.js',
  // );
  // t.strictEqual(
  //   namespace.unique,
  //   aliasNamespace.unique,
  //   'alias modules have identical instance',
  // );
});

test('import reflexive module alias', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/index.js': `
      import self from 'self';
      export default 10;
      t.is(self, 10);
    `,
  });

  const wrappedImportHook = makeImportHook('https://example.com');

  const importHook = async specifier => {
    await null;
    const candidates = [specifier, `${specifier}.js`, `${specifier}/index.js`];
    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const record = await wrappedImportHook(candidate).catch(_ => undefined);
      if (record !== undefined) {
        // return a RedirectStaticModuleInterface with an explicit record
        return { record, specifier };
      }
    }
    throw Error(`Cannot find module ${specifier}`);
  };

  const moduleMapHook = specifier => {
    if (specifier === 'self') {
      return {
        // eslint-disable-next-line no-use-before-define
        compartment,
        namespace: './index.js',
      };
    }
    return undefined;
  };

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook,
    moduleMapHook,
    __noNamespaceBox__: true,
    __options__: true,
  });

  await compartment.import('./index.js');
});

test('child compartments are modular', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/index.js': `
      export default 42;
    `,
  });

  const parent = new Compartment();
  const compartment = new parent.globalThis.Compartment(
    {}, // endowments
    {}, // module map
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/'),
    },
  );

  const {
    namespace: { default: meaning },
  } = await compartment.import('./index.js');

  t.is(meaning, 42, 'child compartments have module support');
});

test('import.meta populated from module record', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/index.js': `
      const myloc = import.meta.url;
      export default myloc;
    `,
  });

  const compartment = new Compartment({
    name: 'https://example.com',
    globals: { t },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com', {
      meta: { url: 'https://example.com/index.js' },
    }),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: metaurl } = await compartment.import('./index.js');
  t.is(metaurl, 'https://example.com/index.js');
});

test('importMetaHook', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/index.js': `
      const myloc = import.meta.url;
      export default myloc;
    `,
  });

  const compartment = new Compartment({
    name: 'https://example.com',
    globals: { t },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    importMetaHook: (_moduleSpecifier, meta) => {
      meta.url = 'https://example.com/index.js';
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: metaurl } = await compartment.import('./index.js');
  t.is(metaurl, 'https://example.com/index.js');
});

test('importMetaHook and meta from record', async t => {
  t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/index.js': `
      const myloc = import.meta.url;
      export default myloc;
    `,
  });

  const compartment = new Compartment({
    name: 'https://example.com',
    globals: { t },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com', {
      meta: { url: 'https://example.com/index.js' },
    }),
    importMetaHook: (_moduleSpecifier, meta) => {
      meta.url += '?foo';
      meta.isStillMutableHopefully = 1;
    },
    __noNamespaceBox__: true,
    __options__: true,
  });

  const { default: metaurl } = await compartment.import('./index.js');
  t.is(metaurl, 'https://example.com/index.js?foo');
});

test('dynamic import from source', async t => {
  const c = new Compartment({
    __options__: true,
    __noNamespaceBox__: true,
    resolveHook: s => s,
    modules: {
      '-': {
        source: new ModuleSource(`
          export const dynamic = import('-');
        `),
      },
    },
  });
  const namespace = await c.import('-');
  const namespace2 = await namespace.dynamic;
  t.is(namespace, namespace2);
});

test('rejects immediately when error aggregation is disabled', async t => {
  t.plan(1);

  const importHook = specifier => {
    if (specifier === './meaning.mjs') {
      return new ModuleSource(
        `
        export { meaning as default } from './missing.mjs';
      `,
        'https://example.com/meaning.mjs',
      );
    }
    if (specifier === './main.js') {
      return new ModuleSource(
        `
        import meaning from './meaning.mjs';
        t.is(meaning, 42);
      `,
        'https://example.com/main.js',
      );
    }
    throw Error(`Cannot load module for specifier ${specifier}`);
  };

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook,
    noAggregateLoadErrors: true,
    __options__: true,
  });

  await t.throwsAsync(() => compartment.import('./main.js'), {
    message: `Cannot load module for specifier ./missing.mjs`,
    name: 'Error',
  });
});

test('rejects w/ aggregate error when error aggregation is enabled', async t => {
  t.plan(1);

  const importHook = specifier => {
    if (specifier === './meaning.mjs') {
      return new ModuleSource(
        `
        export { meaning as default } from './missing.mjs';
      `,
        'https://example.com/meaning.mjs',
      );
    }
    if (specifier === './main.js') {
      return new ModuleSource(
        `
        import meaning from './meaning.mjs';
        t.is(meaning, 42);
      `,
        'https://example.com/main.js',
      );
    }
    throw Error(`Cannot load module for specifier ${specifier}`);
  };

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook,
    noAggregateLoadErrors: false,
    __options__: true,
  });

  await t.throwsAsync(() => compartment.import('./main.js'), {
    message: /1 underlying failures/,
  });
});

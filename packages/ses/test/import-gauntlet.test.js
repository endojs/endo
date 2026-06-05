// @ts-nocheck
// These tests exercise all forms of import and export between a pair of
// modules using a single Compartment.

import test from 'ava';
import '../index.js';
import { resolveNode, makeNodeImporter } from './_node.js';

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

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __options__: true,
  });

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

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

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

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

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

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

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

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

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

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

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

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

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

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __options__: true,
  });

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

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __options__: true,
  });

  await compartment.import('./main.js');
});

// Regression for endojs/endo#59. A module reached more than once via
// `export *` and a renaming reexport with a different `exported` name
// formerly raised a spurious "does not provide an export named X"
// SyntaxError (latterly a `TypeError: notify is not a function`):
// the export-renamer's `export { y as x } from './star-reexporter.js'`
// was wired before star-reexporter's star-import from export-renamer had
// populated star-reexporter's notifier for `y`. The same fixture shape is
// also exercised through compartment-mapper's scaffold and pinned to
// Node.js's reference behavior; see
// packages/compartment-mapper/test/cycle-rename.test.js and
// packages/compartment-mapper/test/cycle-rename-node-parity.test.js.
test('cyclic star export with renaming reexport (issue #59)', async t => {
  t.plan(3);

  const makeImportHook = makeNodeImporter({
    'https://example.com/star-reexporter.js': `
      export * from './export-renamer.js';
    `,
    'https://example.com/export-renamer.js': `
      export { y as x } from './star-reexporter.js';
      export var y = 45;
    `,
    'https://example.com/main.js': `
      import { x } from './star-reexporter.js';
      import * as ns1 from './star-reexporter.js';
      import * as ns2 from './export-renamer.js';
      export const captured = x;
      export const namespace1 = { x: ns1.x, y: ns1.y };
      export const namespace2 = { x: ns2.x, y: ns2.y };
    `,
  });

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

  t.is(namespace.captured, 45);
  t.deepEqual(namespace.namespace1, { x: 45, y: 45 });
  t.deepEqual(namespace.namespace2, { x: 45, y: 45 });
});

// Companion regression for endojs/endo#59 addressing the question raised on
// endojs/endo#3276: is a situation possible where all calls to the deferring
// notify happen before `upstreamNotify` can be obtained (the unused-live-binding
// case)? This variant uses `export var y` without an assignment, so the live
// binding is declared but never updated. Node.js reads every projection of the
// cycle as `undefined` for this shape (verified directly with `node`); the SES
// linker must match. The deferring closure may resolve through a later wireUp
// or stay pending; either way the namespace reads must agree with Node.js.
test('cyclic star export with renaming reexport, unused live binding', async t => {
  t.plan(3);

  const makeImportHook = makeNodeImporter({
    'https://example.com/star-reexporter.js': `
      export * from './export-renamer.js';
    `,
    'https://example.com/export-renamer.js': `
      export { y as x } from './star-reexporter.js';
      export var y;
    `,
    'https://example.com/main.js': `
      import { x } from './star-reexporter.js';
      import * as ns1 from './star-reexporter.js';
      import * as ns2 from './export-renamer.js';
      export const captured = x;
      export const namespace1 = { x: ns1.x, y: ns1.y };
      export const namespace2 = { x: ns2.x, y: ns2.y };
    `,
  });

  const compartment = new Compartment({
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await compartment.import('./main.js');

  t.is(namespace.captured, undefined);
  t.deepEqual(namespace.namespace1, { x: undefined, y: undefined });
  t.deepEqual(namespace.namespace2, { x: undefined, y: undefined });
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

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __options__: true,
  });

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

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook: makeImportHook('https://example.com'),
    __options__: true,
  });

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

  const compartment = new Compartment({
    globals: { t },
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
    __options__: true,
  });

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

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook: async moduleSpecifier => {
      await null;
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
    __options__: true,
  });

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

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook,
    __options__: true,
  });

  await compartment.import('./index.js');
});

test('re-exported names should be available in imported modules', async t => {
  t.plan(3);

  const makeImportHook = makeNodeImporter({
    'https://example.com/index.js': `
      export { a } from './a.js';   
      import { deferredTest } from './c.js';
      export let b = 'b';
      export const assertLiveBinding = () => deferredTest();
    `,
    'https://example.com/a.js': `
      export const a = 'a';
    `,
    'https://example.com/c.js': `
      import { a, b } from './index.js';
      t.is(a, 'a', 're-exported name "a" from importing module should be string "a"');
      t.pass("b is a known export even in a cycle and an attempt to import it doesn't fail with error")
      export const deferredTest = () =>
        t.is(b, 'b', 'exported name "b" should be string "b" after the cycle was resolved');
    `,
  });
  const importHook = makeImportHook('https://example.com');

  const compartment = new Compartment({
    globals: { t },
    resolveHook: resolveNode,
    importHook,
    __options__: true,
  });

  const { namespace } = await compartment.import('./index.js');
  namespace.assertLiveBinding();
});

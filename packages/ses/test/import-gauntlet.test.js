// @ts-nocheck
// These tests exercise all forms of import and export between a pair of
// modules using a single Compartment.

import { test } from 'node:test';
import assert from 'node:assert';
import '../index.js';
import { resolveNode, makeNodeImporter } from './_node.js';

test('re-exported names should be available in imported modules', async () => {
  // t.plan(1);

  const makeImportHook = makeNodeImporter({
    'https://example.com/index.js': `
      export { a } from './a.js';   
      import './c.js';
    `,
    'https://example.com/a.js': `
      export const a = 'a';
    `,
    'https://example.com/c.js': `
      import { a } from './index.js';
      assert.equal(a, 'a', 're-exported name "a" from importing module should be string "a"');
    `,
  });
  const importHook = makeImportHook('https://example.com');

  const compartment = new Compartment({
    globals: { assert },
    resolveHook: resolveNode,
    importHook,
    __options__: true,
  });

  await compartment.import('./index.js');
});

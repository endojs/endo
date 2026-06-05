/**
 * Node.js parity test for the cyclic CommonJS reexporter scenario. This
 * test runs the same three-module pure-CommonJS fixture under plain Node.js
 * (no SES, no compartment mapper) and asserts the same expected values
 * asserted in cycle-cjs-reexporter.test.js. Parity is verified by
 * construction: if both tests pass, the compartment mapper's CommonJS
 * cycle behavior matches Node.js for this case.
 */

import test from 'ava';
import { assertCycleCjsReexporter } from './_cycle-cjs-reexporter-assertions.js';

test('cyclic CommonJS reexporter - node parity', async t => {
  t.plan(3);
  // Dynamic ESM import of a CommonJS module: Node exposes the module's
  // module.exports as the namespace's default export. Re-use the shared
  // assertion module by projecting through `default`.
  const moduleNamespace = await import(
    new URL(
      'fixtures-cycle-cjs-reexporter/node_modules/app/main.js',
      import.meta.url,
    ).href
  );
  assertCycleCjsReexporter(t, moduleNamespace.default);
});

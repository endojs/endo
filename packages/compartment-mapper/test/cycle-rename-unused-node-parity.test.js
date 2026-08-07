/**
 * Node.js parity test for the unused-live-binding shape of the cyclic
 * star-export regression (endojs/endo#59). This test runs the same fixture
 * under plain Node.js (no SES, no compartment mapper) and asserts the same
 * expected values asserted in cycle-rename-unused.test.js. Parity is
 * verified by construction: if both tests pass, the compartment mapper's
 * linker behavior matches Node.js for this case.
 */

import test from 'ava';
import { assertCycleRenameUnused } from './_cycle-rename-unused-assertions.js';

test('cyclic star export with renaming reexport, unused live binding (issue #59) - node parity', async t => {
  t.plan(3);
  const namespace = await import(
    new URL(
      'fixtures-cycle-rename-unused/node_modules/app/main.js',
      import.meta.url,
    ).href
  );
  assertCycleRenameUnused(t, namespace);
});

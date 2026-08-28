/**
 * Node.js parity test for the cyclic star-export with renaming reexport
 * regression (endojs/endo#59). This test runs the same three-module fixture
 * under plain Node.js (no SES, no compartment mapper) and asserts the same
 * expected values asserted in cycle-rename.test.js. Parity is verified by
 * construction: if both tests pass, the compartment mapper's linker
 * behavior matches Node.js for this case.
 */

import test from 'ava';
import { assertCycleRename } from './_cycle-rename-assertions.js';

test('cyclic star export with renaming reexport (issue #59) - node parity', async t => {
  t.plan(3);
  const namespace = await import(
    new URL('fixtures-cycle-rename/node_modules/app/main.js', import.meta.url)
      .href
  );
  assertCycleRename(t, namespace);
});

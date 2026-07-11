// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import fc from 'fast-check';

import { readTrackedFileAt } from '../../src/eval/outcome-kit.js';

test('tracked-file lookup rejects malformed relative paths', async t => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom('', '..', '/file', 'dir//file', 'dir/../file'),
      async path => {
        await t.throwsAsync(
          () =>
            readTrackedFileAt({
              git: undefined,
              readText: async () => '',
              ref: 'HEAD',
              path,
            }),
          { message: /non-empty relative path/ },
        );
      },
    ),
  );
});

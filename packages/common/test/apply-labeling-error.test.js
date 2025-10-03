import test from '@endo/ses-ava/test.js';

import { Fail } from '@endo/errors';
import { applyLabelingError } from '../apply-labeling-error.js';

test('test applyLabelingError', async t => {
  await null;
  t.is(
    applyLabelingError(x => x * 2, [8]),
    16,
  );
  t.is(
    applyLabelingError(x => x * 2, [8], 'foo'),
    16,
  );
  t.is(await applyLabelingError(async x => x * 2, [8], 'foo'), 16);
  t.throws(() => applyLabelingError(x => Fail`${x}`, ['e']), {
    // Tolerate both redacted and unredacted error messages
    message: /^(\(a string\)|"e")$/,
  });
  t.throws(() => applyLabelingError(x => Fail`${x}`, ['e'], 'foo'), {
    message: /^foo: (\(a string\)|"e")$/,
  });
  await t.throwsAsync(
    async () => applyLabelingError(x => Fail`${x}`, ['e'], 'foo'),
    {
      message: /^foo: (\(a string\)|"e")$/,
    },
  );
});

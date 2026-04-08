import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { M, mustMatch } from '../src/patterns/patternMatchers.js';

test('mismatch to see stack', t => {
  const err = t.throws(
    () =>
      mustMatch(
        harden({ arr: ['foo', ['bar', 'BAR'], ['qux', 'quux']] }),
        harden({ arr: ['foo', ['bar', 'BAR'], [M.string(), 'qux']] }),
      ),
    { name: 'Error' },
  );
  t.log('err', err);
});

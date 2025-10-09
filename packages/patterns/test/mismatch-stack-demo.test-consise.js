import test from '@endo/ses-ava/test.js';

import { M, mustMatch } from '../src/patterns/patternMatchers.js';

test('mismatch to see stack', t => {
  let err;
  try {
    mustMatch(
      harden({ arr: ['foo', ['bar', 'BAR'], ['qux', 'quux']] }),
      harden({ arr: ['foo', ['bar', 'BAR'], [M.string(), 'qux']] }),
    );
  } catch (er) {
    err = er;
  }
  t.log('err', err);
  t.is(err.name, 'Error');
});

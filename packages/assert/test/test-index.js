// Sets up a SES environment with 'assert' global
import { test } from './prepare-test-env-ava.js';

import { Fail } from '../index.js';

test('Fail', t => {
  t.notThrows(() => true || Fail`Should not be thrown`);
  t.throws(() => false || Fail`Should be thrown`, {
    message: 'Should be thrown',
  });
});

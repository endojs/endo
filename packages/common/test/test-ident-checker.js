import { test } from './prepare-test-env-ava.js';
import { identChecker } from '../src/ident-checker.js';

test('test identChecker', async t => {
  t.is(identChecker(true, 'x'), true);
  t.is(identChecker(false, 'x'), false);
});

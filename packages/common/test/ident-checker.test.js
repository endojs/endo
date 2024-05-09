import test from '@endo/ses-ava/prepare-endo.js';
import { identChecker } from '../ident-checker.js';

test('test identChecker', async t => {
  t.is(identChecker(true, 'x'), true);
  t.is(identChecker(false, 'x'), false);
});

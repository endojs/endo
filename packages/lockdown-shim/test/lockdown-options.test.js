import test from 'tape';
import { lockdown } from '../src/main.js';

test('lockdown throws with non-recognized options', t => {
  t.plan(2);

  t.throws(
    () => lockdown({ noTameMath: true, abc: true }),
    'throws with value true',
  );
  t.throws(
    () => lockdown({ noTameMath: true, abc: false }),
    'throws with value false',
  );
});

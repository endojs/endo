import test from '@endo/ses-ava';
import { throwLabeled } from '../throw-labeled.js';

test('test throwLabeled', async t => {
  t.throws(() => throwLabeled(Error('e'), 'foo'), {
    message: 'foo: e',
  });
});

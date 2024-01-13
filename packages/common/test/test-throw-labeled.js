import { test } from './prepare-test-env-ava.js';
import { throwLabeled } from '../src/throw-labeled.js';

test('test throwLabeled', async t => {
  t.throws(() => throwLabeled(Error('e'), 'foo'), {
    message: 'foo: e',
  });
});

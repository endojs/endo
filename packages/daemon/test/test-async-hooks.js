import test from 'ava';
import { makeAsyncHooks } from '../src/async-hooks.js';

test('execute', async t => {
  const hooks = makeAsyncHooks();
  const results = [];
  hooks.add(async () => {
    results.push(1);
  });
  hooks.add(async () => {
    results.push(2);
  });
  hooks.add(async () => {
    results.push(3);
  });

  await hooks.execute();

  t.deepEqual(results.sort(), [1, 2, 3]);
});

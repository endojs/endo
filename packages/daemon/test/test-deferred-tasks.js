import test from 'ava';
import { makeDeferredTasks } from '../src/deferred-tasks.js';

test('execute', async t => {
  const tasks = makeDeferredTasks();
  const results = [];
  tasks.push(async () => {
    results.push(1);
  });
  tasks.push(async () => {
    results.push(2);
  });
  tasks.push(async () => {
    results.push(3);
  });

  await tasks.execute();

  t.deepEqual(results.sort(), [1, 2, 3]);
});

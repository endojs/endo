import test from 'tape';
import '../../ses.js';
import { when } from '../../src/error/deep-stacks.js';

lockdown();

test('deep-stacks when', t => {
  let r;
  const p = new Promise(res => (r = res));
  const q = when(p, v1 => when(v1 + 1, v2 => assert.equal(v2, 22)));
  r(33);
  return q.catch(reason => {
    console.log('expected failure', reason);
    return t.end();
  });
});

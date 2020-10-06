import test from 'tape';
import '../../ses.js';
import { E } from '../../src/error/deep-stacks.js';

lockdown();

const carol = harden({
  bar: () => assert.fail('Wut?'),
});

const bob = harden({
  foo: carolP => E(carolP).bar(),
});

const alice = harden({
  test: () => E(bob).foo(carol),
});

test('deep-stacks E', t => {
  const q = alice.test();
  return q.catch(reason => {
    console.log('expected failure', reason);
    return t.end();
  });
});

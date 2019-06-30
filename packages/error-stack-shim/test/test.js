import { test } from 'tape-promise/tape';

import { getStack, getStackString } from '../src/getStack';

test('getStack well formed', t => {
  const err1 = new Error('foo');
  const stack = getStack(err1);

  t.true(Array.isArray(stack.frames));
  t.true(typeof stack.string === 'string');
  t.equal(stack.string, getStackString(err1));
  t.equal(stack.string, err1.stack);

  console.log('error: ', err1);
  console.log('error.stack: ', err1.stack);
  console.log('trace: ', stack.string);
  console.log('json: ', JSON.stringify(stack.frames[0], undefined, ' '));

  t.end();
});

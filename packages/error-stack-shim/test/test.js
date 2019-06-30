import { test } from 'tape-promise/tape';

import { getStack, getStackString } from '../src/getStack';

test('getStack well formed', t => {
  // Note: define err1 and err2 on consecutive lines
  const err1 = new Error('foo');
  const err2 = new TypeError('bar');
  const stack1 = getStack(err1);
  const stack2 = getStack(err2);

  t.true(Array.isArray(stack1.frames));
  t.true(typeof stack1.string === 'string');
  t.equal(stack1.string, getStackString(err1));
  t.equal(stack1.string, err1.stack);
  t.equal(Error, Error.prototype.constructor);

  const frame1 = stack1.frames[0];
  const frame2 = stack2.frames[0];

  console.log('trace: ', stack1.string);
  console.log(frame1);

  t.equal(frame1.name, frame2.name);
  t.equal(frame1.span[0][0] + 1, frame2.span[0][0]);
  t.equal(frame1.source, frame2.source);
  t.true(frame1.source.endsWith('error-stack-shim/test/test.js'));

  t.end();
});

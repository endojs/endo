// eslint doesn't realize that this file
// (agoric-evaluate/test/test-evaluate.js) is a test, since it lives in a
// non-"test" subdirectory.
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from 'tape';
import evaluate from '../src/main';

test('basic', t => {
  t.deepEqual(evaluate('1+2'), 3);
  t.deepEqual(evaluate('(a,b) => a+b')(1, 2), 3);
  t.deepEqual(evaluate('(function(a,b) { return a+b; })')(1, 2), 3);
  t.end();
});

test('endowments', t => {
  t.deepEqual(evaluate('1+a', { a: 2 }), 3);
  t.deepEqual(evaluate('(a,b) => a+b+c', { c: 3 })(1, 2), 6);
  t.deepEqual(evaluate('(function(a,b) { return a+b+c; })', { c: 3 })(1, 2), 6);
  t.deepEqual(evaluate('1+a+b', { a: 2, b: 3 }), 6);
  t.end();
});

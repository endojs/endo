import test from 'ava';
import { assert } from '../../src/error/assert.js';

const { Fail, quote: q } = assert;

const obj = {
  y: 8,
  a: 1,
  x: 7,
};

test('prop order', t => {
  t.throws(() => Fail`oops: ${q(obj)}`, {
    message: 'oops: {"a":1,"x":7,"y":8}',
  });
});

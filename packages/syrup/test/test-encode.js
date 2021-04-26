// @ts-check

import test from 'ava';
import { encodeSyrup } from '../src/encode.js';
import { table } from './table.js';

test('affirmative encode cases', t => {
  for (const { syrup, value } of table) {
    // We test with a length guess of 1 to maximize the probability
    // of discovering a fault in the buffer resize code.
    const actual = encodeSyrup(value, { length: 1 });
    let string = '';
    for (const cc of Array.from(actual)) {
      string += String.fromCharCode(cc);
    }
    t.deepEqual(syrup, string, `for ${JSON.stringify(syrup)} ${value}`);
  }
});

test('negative zero', t => {
  t.deepEqual(encodeSyrup(0), encodeSyrup(-0));
});

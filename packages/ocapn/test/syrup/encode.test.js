// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { encodeSyrup } from '../../src/syrup/encode.js';
import { table } from './_table.js';

test('affirmative encode cases', t => {
  for (const { syrup, value } of table) {
    // We test with a length guess of 1 to maximize the probability
    // of discovering a fault in the buffer resize code.
    const actual = encodeSyrup(value, { length: 1 });
    let string = '';
    for (const cc of Array.from(actual)) {
      string += String.fromCharCode(cc);
    }
    t.deepEqual(syrup, string, `for ${JSON.stringify(syrup)} ${String(value)}`);
  }
});

test('negative zero', t => {
  t.deepEqual(encodeSyrup(0), encodeSyrup(-0));
});

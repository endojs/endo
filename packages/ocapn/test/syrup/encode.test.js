// @ts-check

import test from '@endo/ses-ava/test.js';
import { encodeSyrup } from '../../src/syrup/js-representation.js';
import { table } from './_table.js';
import { throws } from '../_util.js';

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

test('invalid string characters (unpaired surrogate)', t => {
  const invalidString = String.fromCharCode(0xd800);
  throws(t, () => encodeSyrup(invalidString), {
    message: 'SyrupAnyCodec: write failed at index 0 of <unknown>',
    cause: {
      message: 'String: write failed at index 0 of <unknown>',
      cause: {
        message:
          'writeString: Expected well-formed string, got "\\ud800" at index 0',
      },
    },
  });
});

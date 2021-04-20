import test from 'ava';
import { encodeSyrup } from '../src/encode.js';
import { table } from './table.js';

test('affirmative encode cases', t => {
  for (const { syrup, value, nonCanonical } of table) {
    if (!nonCanonical) {
      const actual = encodeSyrup(value);
      let string = '';
      for (const cc of actual) {
        string += String.fromCharCode(cc);
      }
      t.deepEqual(string, syrup, `for ${JSON.stringify(syrup)} ${value}`);
    }
  }
});

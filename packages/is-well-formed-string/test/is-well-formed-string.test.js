import 'ses';
import test from 'ava';
import { isWellFormedString } from '../index.js';
import { cases } from './cases.js';

// On any engine that carries the built-in, this exercises the native arm; the
// fallback arm is driven over the same table by `fallback.test.js`.
test('the exported predicate satisfies the shared contract', t => {
  for (const [label, input, expected] of cases) {
    t.is(isWellFormedString(input), expected, label);
  }
});

test('this engine selects the arm these tests assume', t => {
  // Guards the split: were the built-in ever absent from the test engine, both
  // files would silently drive the same arm and the two-arm coverage claim
  // would quietly become false without any test failing.
  t.is(typeof String.prototype.isWellFormed, 'function');
});

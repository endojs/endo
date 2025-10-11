// modeled on packages/marshal/test/string-rank-unicode-order.test.js
import '@endo/marshal/tools/prepare-unicode-code-point-order.js';
import test from '@endo/ses-ava/test.js';

import {
  multiplanarStrings,
  sorted,
} from '@endo/marshal/tools/marshal-test-data.js';
import { compareKeys } from '../src/keys/compareKeys.js';

const {
  bmpLow,
  loneSurrogate,
  loneSurrogate$bmpLow,
  loneSurrogate$bmpHigh,
  bmpHigh,
  surrogatePair,
} = multiplanarStrings;

test('unicode code point order', t => {
  const strs = harden(Object.values(multiplanarStrings));

  // @ts-expect-error We know that for strings, `compareKeys` never returns
  // NaN because it never judges strings to be incomparable. Thus, the
  // KeyComparison it returns happens to also be a RankComparison we can
  // sort with.
  const keySorted = sorted(strs, compareKeys);

  t.deepEqual(keySorted, [
    bmpLow,
    loneSurrogate,
    loneSurrogate$bmpLow,
    loneSurrogate$bmpHigh,
    bmpHigh,
    surrogatePair,
  ]);
});

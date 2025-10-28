import '../tools/prepare-utf16-code-unit-order.js';
import test from '@endo/ses-ava/test.js';

import { compareRank } from '../src/rankOrder.js';
import {
  compareByUtf16CodeUnit,
  multiplanarStrings,
  sorted,
  stringsByUtf16CodeUnit,
} from '../tools/marshal-test-data.js';
import { encodePassable } from './encodePassable-for-testing.js';

const {
  bmpLow,
  loneSurrogate,
  loneSurrogate$bmpLow,
  loneSurrogate$bmpHigh,
  bmpHigh,
  surrogatePair,
} = multiplanarStrings;

test('string ranking by UTF-16 code unit', t => {
  const strs = harden(Object.values(multiplanarStrings));

  const rankSorted = sorted(strs, compareRank);
  t.deepEqual(rankSorted, [
    bmpLow,
    loneSurrogate,
    loneSurrogate$bmpLow,
    surrogatePair,
    loneSurrogate$bmpHigh,
    bmpHigh,
  ]);

  const nativeEncComp = (left, right) =>
    compareByUtf16CodeUnit(encodePassable(left), encodePassable(right));
  const nativeEncSorted = sorted(strs, nativeEncComp);
  t.deepEqual(nativeEncSorted, stringsByUtf16CodeUnit);

  const rankEncComp = (left, right) =>
    compareRank(encodePassable(left), encodePassable(right));
  const rankEncSorted = sorted(strs, rankEncComp);
  t.deepEqual(rankEncSorted, rankSorted);
});

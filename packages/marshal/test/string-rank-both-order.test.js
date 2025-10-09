import '../tools/prepare-error-if-order-choice-matters.js';
import test from '@endo/ses-ava/test.js';

import { compareRank } from '../src/rankOrder.js';
import {
  compareByUtf16CodeUnit,
  multiplanarStrings,
  sorted,
  stringsByUtf16CodeUnit,
} from '../tools/marshal-test-data.js';
import { encodePassable } from './encodePassable-for-testing.js';

const { loneSurrogate$bmpHigh, bmpHigh, surrogatePair } = multiplanarStrings;

test('string ranking by code point/UTF-16 code unit agreement', t => {
  const strs = harden(Object.values(multiplanarStrings));

  t.throws(() => sorted(strs, compareRank), {
    message: msg => {
      t.log(msg);
      if (!msg.startsWith('Comparisons differed: ')) return false;
      if (!msg.endsWith('-1 vs 1') && !msg.endsWith('1 vs -1')) return false;
      if (!msg.includes(JSON.stringify(surrogatePair))) return false;
      return (
        msg.includes(JSON.stringify(loneSurrogate$bmpHigh)) ||
        msg.includes(JSON.stringify(bmpHigh))
      );
    },
  });

  const nativeEncComp = (left, right) =>
    compareByUtf16CodeUnit(encodePassable(left), encodePassable(right));
  const nativeEncSorted = sorted(strs, nativeEncComp);
  t.deepEqual(nativeEncSorted, stringsByUtf16CodeUnit);
});

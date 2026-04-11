import util from 'node:util';
import test from 'ava';

import { sanitizeFormatData } from '../../src/error/console.js';
import { sanitizeBeforeAfterData } from './_console-sanitize-test-data.js';

test('sanitizeFormatData', t => {
  for (const [
    beforeArgs,
    afterArgs,
    beforeStr,
    afterStr,
  ] of sanitizeBeforeAfterData) {
    t.deepEqual(sanitizeFormatData(beforeArgs), afterArgs);
    if (typeof util?.format === 'function') {
      t.is(util.format(...beforeArgs), beforeStr);
      t.is(util.format(...afterArgs), afterStr);
    } else {
      t.log('no util.format, so limited test');
    }
  }
});

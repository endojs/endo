// @ts-nocheck So many errors that the suppressions hamper readability.
// TODO fix and then turn at-ts-check back on
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { makeMarshal } from '@endo/marshal';
import { mustCompress, mustDecompress } from '../src/patterns/compress.js';
import { runTests } from './compress-tests.js';

test('compression', t => {
  const testCompress = (specimen, pattern, compressed, message = undefined) => {
    if (!message) {
      t.deepEqual(
        mustCompress(harden(specimen), harden(pattern)),
        harden(compressed),
      );
    }
  };
  runTests(testCompress);
});

test('test mustCompress', t => {
  const testCompress = (specimen, pattern, compressed, message = undefined) => {
    if (message === undefined) {
      t.deepEqual(
        mustCompress(harden(specimen), harden(pattern), 'test mustCompress'),
        harden(compressed),
      );
    } else {
      t.throws(
        () =>
          mustCompress(harden(specimen), harden(pattern), 'test mustCompress'),
        { message },
      );
    }
  };
  runTests(testCompress);
});

test('decompression', t => {
  const testDecompress = (
    specimen,
    pattern,
    compressed,
    message = undefined,
  ) => {
    if (message === undefined) {
      t.deepEqual(
        mustDecompress(harden(compressed), harden(pattern)),
        harden(specimen),
      );
    }
  };
  runTests(testDecompress);
});

test('demo compression ratio', t => {
  const { toCapData } = makeMarshal(() => 's', undefined, {
    serializeBodyFormat: 'smallcaps',
  });

  const testCompress = (specimen, pattern, compressed, message = undefined) => {
    harden(specimen);
    harden(pattern);
    harden(compressed);
    if (message === undefined) {
      const { body: big } = toCapData(specimen);
      const { body: small } = toCapData(compressed);
      const ratio = small.length / big.length;
      console.log('\n', big, '\n', small, '\n', ratio);
      const { body: patt } = toCapData(pattern);
      console.log('Pattern: ', patt);
      t.assert(ratio <= 2.0);
    }
  };
  runTests(testCompress);
});

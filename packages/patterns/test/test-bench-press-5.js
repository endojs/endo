/* global process */
// @ts-check

import { test } from './prepare-test-env-ava-unsafe-fast.js';

// eslint-disable-next-line import/order
import { makeMarshal } from '@endo/marshal';
import { mustCompress, mustDecompress } from '../src/patterns/compress.js';
import { runTests } from './compress-tests-5.js';

const STAMP = new Date().toISOString();

/**
 * @param {string} name
 * @param {(reps: number) => any} fn
 * @param {number} [reps]
 */
const bench = (name, fn, reps = 1_000_000) => {
  const label = `${STAMP}--${name}`;
  console.profile(label);
  const [secBefore, nanoBefore] = process.hrtime();
  const result = fn(reps);
  const [secAfter, nanoAfter] = process.hrtime();
  console.profileEnd(label);
  const secDiff = secAfter - secBefore;
  const nanoDiff = secDiff * 1_000_0000_000 + nanoAfter - nanoBefore;
  console.log(`${STAMP}, ${name}, `, nanoDiff / (reps * 1_000));
  return result;
};

const REPS = 1_000_000;

test.serial('demo noop speed baseline', t => {
  bench('noopM', reps => {
    let result;
    for (let i = 0; i < reps; i += 1) {
      result = 1;
    }
    return result;
  });

  const r = bench(
    'noopK',
    reps => {
      let result;
      for (let i = 0; i < reps; i += 1) {
        result = 1;
      }
      return result;
    },
    REPS,
  );
  t.is(r, 1);
});

test.serial('demo compression speed ratio', t => {
  const { toCapData } = makeMarshal(undefined, undefined, {
    serializeBodyFormat: 'smallcaps',
  });

  let num = 4;

  const testCompress = (
    specimen,
    pattern,
    _compressed,
    message = undefined,
  ) => {
    num += 1;
    if (message !== undefined) {
      return;
    }
    harden(specimen);
    harden(pattern);
    const { body: big } = bench(
      `toCapData-K-big-${num}`,
      reps => {
        let result;
        for (let i = 0; i < reps; i += 1) {
          result = toCapData(specimen);
        }
        return result;
      },
      REPS,
    );

    const { body: small } = bench(
      `toCapData-K-compress-${num}`,
      reps => {
        let result;
        for (let i = 0; i < reps; i += 1) {
          const compressed = mustCompress(specimen, pattern);
          result = toCapData(compressed);
        }
        return result;
      },
      REPS,
    );

    const ratio = small.length / big.length;
    t.assert(ratio <= 2.0);
  };
  runTests(testCompress);
});

test.serial('demo decompression speed ratio', t => {
  const { toCapData, fromCapData } = makeMarshal(undefined, undefined, {
    serializeBodyFormat: 'smallcaps',
  });

  let num = 4;

  const testDeompress = (
    specimen,
    pattern,
    compressed,
    message = undefined,
  ) => {
    num += 1;
    if (message !== undefined) {
      return;
    }
    harden(specimen);
    harden(pattern);
    harden(compressed);
    const bigCapData = toCapData(specimen);
    const smallCapData = toCapData(compressed);
    const s1 = bench(
      `fromCapData-K-big-${num}`,
      reps => {
        let result;
        for (let i = 0; i < reps; i += 1) {
          result = fromCapData(bigCapData);
        }
        return result;
      },
      REPS,
    );
    t.deepEqual(s1, specimen);

    const s2 = bench(
      `fromCapData-K-decompress-${num}`,
      reps => {
        let result;
        for (let i = 0; i < reps; i += 1) {
          const c = fromCapData(smallCapData);
          result = mustDecompress(c, pattern);
        }
        return result;
      },
      REPS,
    );
    t.deepEqual(s2, specimen);
  };
  runTests(testDeompress);
});

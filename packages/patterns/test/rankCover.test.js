// @ts-nocheck
import test from '@endo/ses-ava/test.js';

import { fc } from '@fast-check/ava';
import { makeArbitraries } from '@endo/pass-style/tools.js';

import { q } from '@endo/errors';
import {
  compareRank,
  makePassableKit,
  provideStaticRanks,
} from '@endo/marshal';

import { isKey } from '../src/keys/checkKey.js';
import { getRankCover, kindOf, M } from '../src/patterns/patternMatchers.js';

/** @import {Implementation} from 'ava'; */

/** Avoid wasting time on overly large data structures. */
const maxLength = 100;

const formats = ['legacyOrdered', 'compactOrdered'];

const isInteriorRange = (inner, outer) =>
  compareRank(outer[0], inner[0]) <= 0 && compareRank(inner[1], outer[1]) <= 0;

const {
  arbKey,
  arbPassable,
  arbLiftedPassable: arbPassableAndPattern,
} = makeArbitraries(fc, {
  excludePassStyles: ['byteArray'],
  arbLiftingDetail: fc.oneof(
    { withCrossShrink: true },
    { arbitrary: fc.constant(false), weight: 80 },
    { arbitrary: fc.constant(true), weight: 20 },
  ),
  lift: ([x, patt = x], shouldMakeMatcher) => {
    try {
      const matchKind = shouldMakeMatcher ? kindOf(harden(x)) : undefined;
      if (matchKind) return M.kind(matchKind);
    } catch (_err) {
      // eslint-disable-next-line no-empty
    }
    return patt;
  },
});

/**
 * @param {string} titlePrefix
 * @param {Implementation<[encodePassable: (val: Passable) => string]>} testFn
 */
const testAcrossFormats = (titlePrefix, testFn) => {
  for (const format of formats) {
    /** @type {Map<Passable, string> } */
    const ids = new Map();
    const encodePrefixed = (prefix, val) => {
      const foundId = ids.get(val);
      if (foundId) return foundId;
      const n = Math.floor(Math.random() * 10_000);
      const newId = `${prefix}${n.toString().padStart(4, '0')}`;
      ids.set(val, newId);
      return newId;
    };
    const { encodePassable } = makePassableKit({
      format,
      encodeRemotable: r => encodePrefixed('r', r),
      encodePromise: p => encodePrefixed('?', p),
      encodeError: e => encodePrefixed('!', e),
    });
    test(`${titlePrefix} - ${format}`, async t => testFn(t, encodePassable));
  }
};

testAcrossFormats('static ranks', async (t, encodePassable) => {
  t.snapshot(provideStaticRanks(encodePassable));
});

testAcrossFormats(
  'getRankCover for Keys is tight',
  async (t, encodePassable) => {
    await fc.assert(
      fc.property(arbKey, x => {
        const encoded = encodePassable(x);
        return t.deepEqual(getRankCover(x, encodePassable), [encoded, encoded]);
      }),
    );
  },
);

testAcrossFormats(
  'getRankCover(pattern, encodePassable) covers matching specimens',
  async (t, encodePassable) => {
    await fc.assert(
      fc.property(arbPassableAndPattern, ([specimen, patt]) => {
        const encoded = encodePassable(specimen);
        const [lower, upper] = getRankCover(patt, encodePassable);
        const lowerOk = compareRank(lower, encoded) <= 0;
        const upperOk = compareRank(encoded, upper) <= 0;
        if (lowerOk && upperOk) {
          t.pass();
          return;
        }

        const boundsRepr = `[${q(lower)}, ${q(upper)}]`;
        // eslint-disable-next-line no-nested-ternary
        const failedBounds = lowerOk ? 'UPPER' : upperOk ? 'LOWER' : 'BOTH';
        t.fail(
          `***SPECIMEN*** ${q(specimen)} ***as*** ${q(encoded)} failed ${failedBounds} bound(s) of ***PATTERN*** ${q(patt)} ***as*** ${boundsRepr}`,
        );
      }),
    );
  },
);

testAcrossFormats(
  'getRankCover(arrayWithInitialKey, encodePassable) is tighter than "any copyArray"',
  async (t, encodePassable) => {
    const coverAnyCopyArray =
      provideStaticRanks(encodePassable).copyArray.cover;
    t.true(
      Array.isArray(coverAnyCopyArray) &&
        coverAnyCopyArray.length === 2 &&
        coverAnyCopyArray.every(el => typeof el === 'string') &&
        compareRank(coverAnyCopyArray[0], coverAnyCopyArray[1]) < 0,
      `precondition: CopyArray static coverage ${q(coverAnyCopyArray)} is a valid range`,
    );

    const makeNonKey = x => Promise.resolve(x);
    await fc.assert(
      fc.property(
        arbKey,
        fc.array(arbPassable, { minLength: 1, maxLength }),
        (key, rest) => {
          let nonKeyIndex = rest.findIndex(x => !isKey(x));
          if (nonKeyIndex === -1) {
            // We need a non-Key, so to avoid wasting the work with fast-check
            // `.filter` (which can lead to https://crbug.com/1201626 crashes),
            // we just transform the last element.
            nonKeyIndex = rest.length - 1;
            rest[nonKeyIndex] = makeNonKey(rest[nonKeyIndex]);
          }
          const cover = getRankCover(harden([key, ...rest]), encodePassable);
          t.true(
            isInteriorRange(cover, coverAnyCopyArray),
            `leading-Key CopyArray coverage is a subset of any-CopyArray coverage: ${q(cover)} ⊆ ${q(coverAnyCopyArray)}`,
          );
          t.true(
            coverAnyCopyArray[0] < cover[0] || cover[1] < coverAnyCopyArray[1],
            `leading-Key CopyArray coverage is tighter than any-CopyArray coverage: ${q(cover)} ⊊ ${q(coverAnyCopyArray)}`,
          );

          // An analogous specimen with a non-Key in place of the last prefix
          // Key must fall outside of the above coverage.
          const nonMatch = [key, ...rest];
          nonMatch[nonKeyIndex] = makeNonKey(nonMatch[nonKeyIndex]);
          const encodedNonMatch = encodePassable(harden(nonMatch));
          t.false(
            isInteriorRange([encodedNonMatch, encodedNonMatch], cover),
            'at least one CopyArray must be outside of leading-Key coverage',
          );
        },
      ),
    );
  },
);

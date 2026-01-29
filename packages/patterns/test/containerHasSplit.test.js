import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';

import { Fail, q } from '@endo/errors';
import { passStyleOf } from '@endo/pass-style';
import { makeCopyBag, makeCopySet } from '../src/keys/checkKey.js';
import { M, containerHasSplit } from '../src/patterns/patternMatchers.js';

/** @import {Macro} from 'ava'; */
/** @import {CopyArray} from '@endo/pass-style'; */
/** @import {CopySet, CopyBag, Key, Matcher} from '../src/types.js'; */

/**
 * @typedef {CopyArray | CopySet | CopyBag} T
 * @type {Macro<[{
 *   specimen: T,
 *   pattern: Matcher,
 *   bound: bigint,
 * } & ({ expectFailureCount: bigint } | { expectAccepted: T, expectRejected: T })]>}
 */
const testContainerHasSplit = test.macro((t, config) => {
  const { specimen, pattern, bound } = config;

  if ('expectFailureCount' in config) {
    t.is(
      containerHasSplit(specimen, pattern, bound, false),
      false,
      'rejector `false` returns false',
    );
    const expectMessage = `Has only ${q(config.expectFailureCount)} matches, but needs ${q(bound)}`;
    t.throws(
      () => containerHasSplit(specimen, pattern, bound, Fail),
      { message: expectMessage },
      'rejector `Fail` throws error',
    );
    return;
  }

  const passStyle = passStyleOf(specimen);
  const { expectAccepted, expectRejected } = config;
  const [accepted, rejected] = containerHasSplit(
    specimen,
    pattern,
    bound,
    Fail,
    true,
    true,
  );
  t.deepEqual(accepted, expectAccepted, 'get both results: accepted');
  t.deepEqual(rejected, expectRejected, 'get both results: rejected');
  t.is(
    passStyleOf(accepted),
    passStyle,
    'accepted results have the same pass style as the specimen',
  );
  t.is(
    passStyleOf(rejected),
    passStyle,
    'rejected results have the same pass style as the specimen',
  );
  t.deepEqual(
    containerHasSplit(specimen, pattern, bound, Fail, true, false),
    [expectAccepted, undefined],
    'get only accepted results',
  );
  t.deepEqual(
    containerHasSplit(specimen, pattern, bound, Fail, false, true),
    [undefined, expectRejected],
    'get only rejected results',
  );
  t.deepEqual(
    containerHasSplit(specimen, pattern, bound, Fail),
    [undefined, undefined],
    'get no results',
  );
});

// #region CopyArray
{
  const specimen = harden([1, 'foo', 2, 'bar']);

  test('split first match from copyArray', testContainerHasSplit, {
    specimen,
    pattern: M.string(),
    bound: 1n,
    expectAccepted: ['foo'],
    expectRejected: [1, 2, 'bar'],
  });

  test('split first two matches from copyArray', testContainerHasSplit, {
    specimen,
    pattern: M.string(),
    bound: 2n,
    expectAccepted: ['foo', 'bar'],
    expectRejected: [1, 2],
  });

  test('fail against copyArray', testContainerHasSplit, {
    specimen,
    pattern: M.gt(2),
    bound: 1n,
    expectFailureCount: 0n,
  });

  test('partially fail against copyArray', testContainerHasSplit, {
    specimen,
    pattern: M.gte(2),
    bound: 2n,
    expectFailureCount: 1n,
  });
}
// #endregion CopyArray

// #region CopySet
{
  const specimen = makeCopySet([1, 'foo', 2, 'bar']);

  test('split first match from copySet', testContainerHasSplit, {
    specimen,
    pattern: M.string(),
    bound: 1n,
    expectAccepted: makeCopySet(['bar']),
    expectRejected: makeCopySet([2, 1, 'foo']),
  });

  test('split first two matches from copySet', testContainerHasSplit, {
    specimen,
    pattern: M.string(),
    bound: 2n,
    expectAccepted: makeCopySet(['bar', 'foo']),
    expectRejected: makeCopySet([2, 1]),
  });

  test('fail against copySet', testContainerHasSplit, {
    specimen,
    pattern: M.gt(2),
    bound: 1n,
    expectFailureCount: 0n,
  });

  test('partially fail against copySet', testContainerHasSplit, {
    specimen,
    pattern: M.gte(2),
    bound: 2n,
    expectFailureCount: 1n,
  });
}
// #endregion CopySet

// #region CopyBag
{
  /** @typedef {Array<[Key, bigint]>} CopyBagEntries */
  const specimen = makeCopyBag(
    /** @type {CopyBagEntries} */ ([
      [1, 2n],
      ['foo', 2n],
      [2, 2n],
      ['bar', 2n],
    ]),
  );

  test('split partial first match from copyBag', testContainerHasSplit, {
    specimen,
    pattern: M.string(),
    bound: 1n,
    expectAccepted: makeCopyBag(/** @type {CopyBagEntries} */ ([['bar', 1n]])),
    expectRejected: makeCopyBag(
      /** @type {CopyBagEntries} */ ([
        [2, 2n],
        [1, 2n],
        ['foo', 2n],
        ['bar', 1n],
      ]),
    ),
  });

  test('split first match from copyBag', testContainerHasSplit, {
    specimen,
    pattern: M.string(),
    bound: 2n,
    expectAccepted: makeCopyBag(/** @type {CopyBagEntries} */ ([['bar', 2n]])),
    expectRejected: makeCopyBag(
      /** @type {CopyBagEntries} */ ([
        [2, 2n],
        [1, 2n],
        ['foo', 2n],
      ]),
    ),
  });

  test('split multiple matches from copyBag', testContainerHasSplit, {
    specimen,
    pattern: M.string(),
    bound: 3n,
    expectAccepted: makeCopyBag(
      /** @type {CopyBagEntries} */ ([
        ['bar', 2n],
        ['foo', 1n],
      ]),
    ),
    expectRejected: makeCopyBag(
      /** @type {CopyBagEntries} */ ([
        [2, 2n],
        [1, 2n],
        ['foo', 1n],
      ]),
    ),
  });

  test('fail against copyBag', testContainerHasSplit, {
    specimen,
    pattern: M.gt(2),
    bound: 1n,
    expectFailureCount: 0n,
  });

  test('partially fail against copyBag', testContainerHasSplit, {
    specimen,
    pattern: M.gte(2),
    bound: 3n,
    expectFailureCount: 2n,
  });
}
// #endregion CopyBag

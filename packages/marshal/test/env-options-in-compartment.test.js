// Verifies that `ENDO_RANK_STRINGS`, when set on a sub-compartment's own
// `process.env`, configures string-ranking decisions made by code running
// inside that sub-compartment, independent of the parent's (process-level)
// setting.
//
// The parent of this test is loaded with the default `utf16-code-unit-order`
// regime (no `tools/prepare-*.js` import).
// Inside the sub-compartment we set `ENDO_RANK_STRINGS =
// 'unicode-code-point-order'` on its own `process.env` and then observe that
// string ranking inside the sub-compartment follows code-point order while
// ranking in the parent follows code-unit order.
//
// The sub-compartment is constructed by `@endo/compartment-mapper`'s
// `importLocation`, which loads `@endo/env-options` from its actual on-disk
// source (the way a real consumer would), with `globals.process` plumbed in
// per-compartment.
//
// See https://github.com/endojs/endo/issues/2879

import '@endo/init/debug.js';

import fs from 'node:fs';
import url from 'node:url';

import test from '@endo/ses-ava/test.js';
import { importLocation } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

import { compareRank as parentCompareRank } from '../src/rankOrder.js';
import { multiplanarStrings, sorted } from '../tools/marshal-test-data.js';

/** @import { RankCompare } from '../src/types.js' */

/**
 * @typedef {object} CompareStringsNamespace
 * @property {RankCompare} compareStrings
 * @property {string} capturedSetting
 */

const readPowers = makeReadPowers({ fs, url });

const fixtureLocation = new URL(
  './_fixtures-env-options-in-compartment/main.js',
  import.meta.url,
).toString();

/**
 * @param {string} setting
 * @returns {Promise<CompareStringsNamespace>}
 */
const importFixtureWithEnvOption = async setting => {
  const { namespace } = await importLocation(readPowers, fixtureLocation, {
    globals: {
      process: { env: { ENDO_RANK_STRINGS: setting } },
    },
  });
  return /** @type {CompareStringsNamespace} */ (
    /** @type {unknown} */ (namespace)
  );
};

const { bmpHigh, surrogatePair } = multiplanarStrings;

test('per-compartment ENDO_RANK_STRINGS controls string ranking inside the compartment', async t => {
  // Parent has the default setting.
  // These two strings disagree between code-unit and code-point order
  // (the canonical example from the ICU paper), so they reveal which
  // order is in effect.
  // utf16-code-unit-order: surrogatePair < bmpHigh
  // unicode-code-point-order: bmpHigh < surrogatePair
  t.is(parentCompareRank(surrogatePair, bmpHigh), -1);
  t.is(parentCompareRank(bmpHigh, surrogatePair), 1);

  const { compareStrings, capturedSetting } = await importFixtureWithEnvOption(
    'unicode-code-point-order',
  );

  // The sub-compartment captured its own setting, not the parent's.
  t.is(capturedSetting, 'unicode-code-point-order');

  // Inside the sub-compartment, code-point order swaps the result.
  t.is(compareStrings(surrogatePair, bmpHigh), 1);
  t.is(compareStrings(bmpHigh, surrogatePair), -1);

  // And the resulting sort differs from the parent's.
  const strs = harden([bmpHigh, surrogatePair]);
  t.deepEqual(sorted(strs, parentCompareRank), [surrogatePair, bmpHigh]);
  t.deepEqual(sorted(strs, compareStrings), [bmpHigh, surrogatePair]);
});

test('two sibling sub-compartments capture different ENDO_RANK_STRINGS', async t => {
  const utf16 = await importFixtureWithEnvOption('utf16-code-unit-order');
  const codePoint = await importFixtureWithEnvOption(
    'unicode-code-point-order',
  );

  t.is(utf16.capturedSetting, 'utf16-code-unit-order');
  t.is(codePoint.capturedSetting, 'unicode-code-point-order');

  // Same inputs, opposite results.
  t.is(utf16.compareStrings(surrogatePair, bmpHigh), -1);
  t.is(codePoint.compareStrings(surrogatePair, bmpHigh), 1);
});

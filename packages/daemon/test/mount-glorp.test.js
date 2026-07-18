// @ts-check

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import fs from 'fs';
import path from 'path';
import { E } from '@endo/eventual-send';

import { makeFilePowers } from '../src/manager-node-powers.js';
import { makeMount } from '../src/mount.js';
import { buildMountFixture } from './_mount-fixture.js';

const grepCasesUrl = new URL('./mount-grep-cases.json', import.meta.url);

const filePowers = makeFilePowers({ fs, path });

/**
 * `glorp(glob, grep)` is the fused equivalent of `grep(pattern, glob(g))`: it
 * enumerates the files matching the glob pattern and searches them for the grep
 * pattern in one call whose two required patterns a native filesystem can push
 * down and fuse. We pin that equivalence against the shared grep case table:
 * every case that carries an `options.glob` selector is exactly a `glorp(glob,
 * pattern)`, so glorp must reproduce grep's records over the canonical fixture.
 */
const { cases } = JSON.parse(fs.readFileSync(grepCasesUrl, 'utf8'));

test('glorp reproduces the grep case table as the fused glob→grep composition', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });

  await null;
  let ran = 0;
  // glorp requires both patterns, so only the glob-selecting cases map onto
  // it; a case without `options.glob` is a whole-tree grep, not a glorp.
  const glorpCases = cases.filter(
    testCase => (testCase.options ?? {}).glob !== undefined,
  );
  for (const testCase of glorpCases) {
    const options = testCase.options ?? {};
    const glorpOptions =
      options.maxResults === undefined
        ? {}
        : { maxResults: options.maxResults };
    // eslint-disable-next-line no-await-in-loop
    const result = await E(mount).glorp(
      options.glob,
      testCase.pattern,
      glorpOptions,
    );
    t.deepEqual(
      [...result],
      testCase.expect,
      `${testCase.name} — glorp(${JSON.stringify(options.glob)}, ${JSON.stringify(
        testCase.pattern,
      )})`,
    );
    ran += 1;
  }
  // Guard against a silently-empty table or a broken loop reporting green.
  t.true(ran >= 5, `expected several glob-selecting cases, ran ${ran}`);
});

test('glorp(g, p) equals grep(p, glob(g))', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const fused = await E(mount).glorp('src/**/*.js', 'export');
  const composed = await E(mount).grep('export', E(mount).glob('src/**/*.js'));
  t.deepEqual(
    [...fused],
    [...composed],
    'the fused call and the explicit composition return the same records',
  );
  t.deepEqual(
    [...fused],
    [
      { file: 'src/index.js', line: 1, text: 'export const index = 1;' },
      { file: 'src/nested/deep.js', line: 1, text: 'export const deep = 3;' },
      {
        file: 'src/nested/deeper/deepest.js',
        line: 1,
        text: 'export const deepest = 4;',
      },
      { file: 'src/util.js', line: 1, text: 'export const util = 2;' },
    ],
  );
});

test('glorp honors maxResults', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const capped = await E(mount).glorp('src/**/*.js', 'export', {
    maxResults: 2,
  });
  t.is([...capped].length, 2, 'the match record cap bounds the fused search');
});

test('glorp requires both patterns', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  // The interface guard makes both positionals required; a missing grep
  // pattern is rejected before the method runs.
  await t.throwsAsync(
    // Deliberately omitting the required grep pattern; the interface guard
    // rejects it at the exo boundary before the method body runs.
    // @ts-expect-error deliberate arity violation under test
    () => E(mount).glorp('src/**/*.js'),
    undefined,
    'a single-argument glorp is rejected by the interface guard',
  );
});

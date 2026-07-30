// @ts-check

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { E } from '@endo/eventual-send';

import { makeFilePowers } from '../src/manager-node-powers.js';
import { makeMount, makeRevocableMount } from '../src/mount.js';
import { buildMountFixture } from './_mount-fixture.js';

const grepCasesUrl = new URL('./mount-grep-cases.json', import.meta.url);

const filePowers = makeFilePowers({ fs, path });

/**
 * The grep variant coverage matrix, shared verbatim with the platform-engine
 * runner (packages/platform/test/search.test.js) and a future Rust/XS-side
 * runner. Each case pins the exact `grep` records over the canonical mount
 * fixture; a discrepancy is either a Node regression or a cross-language parity
 * break. The table predates the glob/grep decoupling, so its `options.glob` is
 * now interpreted as a *separate* glob whose paths feed grep — each case
 * therefore exercises the composition seam `grep(pattern, glob(g))` while
 * keeping its exact pre-decoupling expectation.
 */
const { cases } = JSON.parse(fs.readFileSync(grepCasesUrl, 'utf8'));

test('grep variant case table via the glob→grep composition (Rust/Node parity contract)', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });

  await null;
  let ran = 0;
  for (const testCase of cases) {
    const options = testCase.options ?? {};
    // `options.glob` selects the files; passing the glob *promise* straight
    // into grep exercises the `M.await` path guard and the CapTP composition.
    const paths =
      options.glob === undefined ? undefined : E(mount).glob(options.glob);
    const grepOptions =
      options.maxResults === undefined
        ? {}
        : { maxResults: options.maxResults };
    // eslint-disable-next-line no-await-in-loop
    const result = await E(mount).grep(testCase.pattern, paths, grepOptions);
    t.deepEqual(
      [...result],
      testCase.expect,
      `${testCase.name} — grep(${JSON.stringify(testCase.pattern)}, glob(${JSON.stringify(
        options.glob,
      )}))`,
    );
    ran += 1;
  }
  // Guard against a silently-empty table or a broken loop reporting green.
  t.true(ran >= 10, `expected the matrix to exercise many cases, ran ${ran}`);
});

test('grep composes with a glob promise passed directly (E(mount).grep(p, E(mount).glob(g)))', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  // The unresolved glob promise flows into grep; the exo awaits and
  // shape-checks it per the M.await guard before the method runs.
  const result = await E(mount).grep('export', E(mount).glob('src/**/*.js'));
  t.deepEqual(
    [...result],
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

test('grep accepts a hand-built array of paths', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const result = await E(mount).grep('line', ['notes.txt']);
  t.deepEqual(
    [...result],
    [
      { file: 'notes.txt', line: 1, text: 'first line' },
      { file: 'notes.txt', line: 2, text: 'second line' },
      { file: 'notes.txt', line: 3, text: 'third line' },
    ],
  );
});

test('grep with paths omitted searches the whole tree', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  // No `paths` argument exercises the whole-tree default.
  const result = await E(mount).grep('first line');
  t.true(
    [...result].some(
      match =>
        match.file === 'notes.txt' &&
        match.line === 1 &&
        match.text === 'first line',
    ),
    'the whole-tree default reaches notes.txt',
  );
});

test('grep silently skips denied, escaping, directory, and missing supplied paths', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  // A hand-built list mixing one valid file with a denied name, a directory,
  // and a missing path. The invalid entries drop silently; only notes.txt
  // contributes matches, and grep never throws.
  const result = await E(mount).grep('line', [
    'notes.txt',
    '.env',
    'src',
    'does/not/exist.txt',
  ]);
  t.true([...result].length > 0);
  t.true(
    [...result].every(match => match.file === 'notes.txt'),
    'only the valid readable file contributes matches',
  );
});

test('grep on a subView reports sub-root-relative file paths', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const sub = await E(mount).subView('src');
  const result = await E(sub).grep('export', E(sub).glob('**/*.js'));
  t.deepEqual(
    [...result],
    [
      { file: 'index.js', line: 1, text: 'export const index = 1;' },
      { file: 'nested/deep.js', line: 1, text: 'export const deep = 3;' },
      {
        file: 'nested/deeper/deepest.js',
        line: 1,
        text: 'export const deepest = 4;',
      },
      { file: 'util.js', line: 1, text: 'export const util = 2;' },
    ],
  );
});

test('grep honors maxResults', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const result = await E(mount).grep('line', ['notes.txt'], { maxResults: 2 });
  t.is([...result].length, 2);
  t.deepEqual(
    [...result],
    [
      { file: 'notes.txt', line: 1, text: 'first line' },
      { file: 'notes.txt', line: 2, text: 'second line' },
    ],
  );
});

test('grep strips a trailing carriage return from CRLF lines', async t => {
  // A CRLF fixture, kept out of the shared manifest so the glob case table's
  // pinned expectations stay LF-only. `alpha$` is load-bearing: with the `\r`
  // strip the line is "alpha" and matches; without it the line is "alpha\r".
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-grep-crlf-'));
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'crlf.txt'), 'alpha\r\nbeta\r\n');

  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const result = await E(mount).grep('alpha$', ['crlf.txt']);
  t.deepEqual(
    [...result],
    [{ file: 'crlf.txt', line: 1, text: 'alpha' }],
    'the matched text carries no trailing carriage return',
  );
});

test('grep does not fail on a binary file it cannot decode', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  // The whole-tree default includes the binary probe docs/img.png. Node
  // substitutes U+FFFD where XS may throw; either way grep must complete rather
  // than propagating the decode failure as a rejection.
  const grepping = E(mount).grep('e');
  await t.notThrowsAsync(
    grepping,
    'grep completes over the undecodable binary probe instead of rejecting',
  );
  const result = await grepping;
  for (const match of [...result]) {
    t.is(typeof match.file, 'string');
    t.is(typeof match.line, 'number');
    t.is(typeof match.text, 'string');
  }
});

test('grep on a revoked mount throws before reading any file', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-grep-revoke-'));
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'a.txt'), 'live\n');

  const { mount, control } = makeRevocableMount({
    rootPath: root,
    readOnly: false,
    filePowers,
  });
  await null;
  t.deepEqual(
    [...(await E(mount).grep('live', ['a.txt']))],
    [{ file: 'a.txt', line: 1, text: 'live' }],
  );

  E(control).revoke();

  await t.throwsAsync(() => E(mount).grep('live', ['a.txt']), {
    message: /Mount has been revoked/,
  });
});

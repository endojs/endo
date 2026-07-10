// @ts-check

/**
 * Engine-level tests for `@endo/platform/fs/search` — the normative glob/grep
 * walker pushed down out of the daemon's `EndoMount`
 * (designs/platform-search-pushdown.md). The same cross-language case tables the
 * daemon runs at the mount level run here one layer lower, directly against
 * `makeSearch` over Node powers, so the two levels stay in parity. Batch
 * boundaries are exercised as non-semantic: every assertion compares the
 * *flattened* generator output.
 */

import '@endo/init/debug.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import test from 'ava';
import {
  makeSearch,
  provideSearch,
  compileGlobSegment,
  parseGlobPattern,
  isConservativeRegex,
  GLOB_MAX_RESULTS,
} from '../src/fs/search.js';
import { makeNodeSearchPowers } from '../src/fs-node/search.js';
import { buildMountFixture } from './_search-fixture.js';

const globCases = JSON.parse(
  fs.readFileSync(new URL('./mount-glob-cases.json', import.meta.url), 'utf8'),
);
const grepCases = JSON.parse(
  fs.readFileSync(new URL('./mount-grep-cases.json', import.meta.url), 'utf8'),
);
const contract = JSON.parse(
  fs.readFileSync(new URL('./mount-glob-contract.json', import.meta.url), 'utf8'),
);

/** The engine's deny set is the contract's segment list (already lowercased). */
const deniedSegments = contract.deny.segments;

/**
 * Flatten an async generator of batches into one array.
 *
 * @template T
 * @param {AsyncGenerator<T[]>} gen
 * @returns {Promise<T[]>}
 */
const collect = async gen => {
  const out = [];
  for await (const batch of gen) {
    out.push(...batch);
  }
  return out;
};

test('glob case table runs against the engine (flattened == mount expectation)', async t => {
  const { root, created } = buildMountFixture(t);
  const search = makeSearch(makeNodeSearchPowers());
  await null;
  let ran = 0;
  for (const testCase of globCases.cases) {
    if (testCase.requiresSymlink && !created.has('escape')) {
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await collect(
      search.globPaths(root, testCase.pattern, { deniedSegments }),
    );
    t.deepEqual(
      result.slice(0, GLOB_MAX_RESULTS),
      testCase.expect,
      `glob ${testCase.name}: pattern ${testCase.pattern}`,
    );
    ran += 1;
  }
  t.true(ran >= 30, `expected the glob case table to be substantial, ran ${ran}`);
});

test('grep case table runs against the engine via the glob→grep composition', async t => {
  const { root } = buildMountFixture(t);
  const search = makeSearch(makeNodeSearchPowers());
  await null;
  let ran = 0;
  for (const testCase of grepCases.cases) {
    const options = testCase.options ?? {};
    // The daemon case table predates the decoupling: its `options.glob` is now
    // a *separate* glob whose paths feed grep, so each case exercises the
    // pipeline seam (paths in, matches out) yet keeps its exact expectation.
    let paths;
    if (options.glob !== undefined) {
      // eslint-disable-next-line no-await-in-loop
      paths = await collect(
        search.globPaths(root, options.glob, { deniedSegments }),
      );
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await collect(
      search.grepFiles(root, testCase.pattern, paths, {
        deniedSegments,
        maxResults: options.maxResults,
      }),
    );
    t.deepEqual(
      result,
      testCase.expect,
      `grep ${testCase.name}: pattern ${testCase.pattern}`,
    );
    ran += 1;
  }
  t.true(ran >= 10, `expected the grep case table to be substantial, ran ${ran}`);
});

test('grep accepts a Promise<Array> of paths (CapTP composition)', async t => {
  const { root } = buildMountFixture(t);
  const search = makeSearch(makeNodeSearchPowers());
  // The unresolved glob promise passed straight into grep — the eager mirror of
  // `E(mount).grep(p, E(mount).glob(g))`.
  const pathsPromise = collect(
    search.globPaths(root, 'src/**/*.js', { deniedSegments }),
  );
  const result = await collect(
    search.grepFiles(root, 'export', pathsPromise, { deniedSegments }),
  );
  t.deepEqual(result, [
    { file: 'src/index.js', line: 1, text: 'export const index = 1;' },
    { file: 'src/nested/deep.js', line: 1, text: 'export const deep = 3;' },
    { file: 'src/nested/deeper/deepest.js', line: 1, text: 'export const deepest = 4;' },
    { file: 'src/util.js', line: 1, text: 'export const util = 2;' },
  ]);
});

test('grep with paths omitted searches every (allowed) file under the root', async t => {
  const { root } = buildMountFixture(t);
  const search = makeSearch(makeNodeSearchPowers());
  // A pattern that would match the denied credential files if they were read.
  const result = await collect(
    search.grepFiles(root, 'must never surface|must-never-surface', undefined, {
      deniedSegments,
    }),
  );
  // Confinement + deny prune the walk, so nothing under .ssh/.aws/.env surfaces.
  t.deepEqual(result, []);
});

test('grep skips a denied path, a directory, and a missing path, and never throws on a binary file', async t => {
  const { root } = buildMountFixture(t);
  const search = makeSearch(makeNodeSearchPowers());
  // A pattern that matches none of the fixture text (nor the binary probe's
  // bytes). Denied (.ssh), a directory (src), and a missing path all drop
  // silently; the binary probe is read without throwing (on Node it decodes to
  // replacement characters that this pattern does not match; on XS it would
  // reject the decode and be skipped — either way, no throw and no match).
  const result = await collect(
    search.grepFiles(
      root,
      'zzz-never-matches-anything',
      ['.ssh/id_rsa', 'src', 'docs/img.png', 'missing/nope.txt'],
      { deniedSegments },
    ),
  );
  t.deepEqual(result, []);
});

test('grep normalizes CRLF, stripping the trailing carriage return from match text', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-crlf-'));
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'crlf.txt'), 'alpha\r\nbeta\r\n');
  const search = makeSearch(makeNodeSearchPowers());
  const result = await collect(search.grepFiles(dir, 'beta', ['crlf.txt']));
  t.deepEqual(result, [{ file: 'crlf.txt', line: 2, text: 'beta' }]);
});

test('grep honors maxResults across the flattened stream', async t => {
  const { root } = buildMountFixture(t);
  const search = makeSearch(makeNodeSearchPowers());
  const result = await collect(
    search.grepFiles(root, 'line', ['notes.txt'], {
      deniedSegments,
      maxResults: 2,
    }),
  );
  t.is(result.length, 2);
  t.deepEqual(result, [
    { file: 'notes.txt', line: 1, text: 'first line' },
    { file: 'notes.txt', line: 2, text: 'second line' },
  ]);
});

test('batch boundaries are not semantic: flattened output is invariant across batchSize', async t => {
  const { root } = buildMountFixture(t);
  const search = makeSearch(makeNodeSearchPowers());
  const reference = await collect(
    search.globPaths(root, 'src/**', { deniedSegments }),
  );
  for (const batchSize of [1, 2, 3, 1000]) {
    /** @type {string[]} */
    const flattened = [];
    let maxBatch = 0;
    // eslint-disable-next-line no-await-in-loop
    for await (const batch of search.globPaths(root, 'src/**', {
      deniedSegments,
      batchSize,
    })) {
      maxBatch = Math.max(maxBatch, batch.length);
      flattened.push(...batch);
    }
    t.deepEqual(flattened, reference, `batchSize ${batchSize} flattens equal`);
    const cap = Math.min(batchSize, 1024);
    t.true(maxBatch <= cap, `batchSize ${batchSize}: no batch exceeds ${cap}`);
  }
});

test('provideSearch falls back to the JS engine and honors a native override', async t => {
  const { root } = buildMountFixture(t);
  const powers = makeNodeSearchPowers();
  /** @type {import('../src/fs/search.types.js').SearchFilePowers} */
  const filePowers = {
    readDirectory: powers.readDirectory,
    isDirectory: powers.isDirectory,
    readFileText: powers.readFileText,
    joinPath: powers.joinPath,
    realPath: async p => {
      const real = await powers.maybeRealPath(p);
      if (real === undefined) {
        throw new Error('ENOENT');
      }
      return real;
    },
  };
  const search = provideSearch(filePowers);
  const result = await collect(
    search.globPaths(root, 'README.md', { deniedSegments }),
  );
  t.deepEqual(result, ['README.md']);

  // A native override is used verbatim.
  const sentinel = makeSearch(makeNodeSearchPowers());
  const overridden = provideSearch({ ...filePowers, search: sentinel });
  t.is(overridden, sentinel);
});

test('parseGlobPattern rejects the empty pattern and coalesces stacked **', t => {
  t.throws(() => parseGlobPattern(''), {
    message: /at least one non-empty segment/,
  });
  t.deepEqual(parseGlobPattern('a/**/**/b'), ['a', '**', 'b']);
  t.deepEqual(parseGlobPattern('src//x/'), ['src', 'x']);
});

test('compileGlobSegment is linear and bounded on a ReDoS-style pattern', t => {
  // A backtracking regex would hang here; the two-pointer matcher returns fast.
  const matches = compileGlobSegment('a*a*a*a*a*a*a*a*a*a*a*a*a*b');
  t.false(matches(`${'a'.repeat(64)}c`));
  t.true(compileGlobSegment('*.js')('index.js'));
  t.false(compileGlobSegment('*.js')('index.ts'));
  // `*` matches a leading dot; `?`, `[`, `{` are literals.
  t.true(compileGlobSegment('*')('.hidden'));
  t.true(compileGlobSegment('q?')('q?'));
  t.false(compileGlobSegment('q?')('qX'));
});

test('isConservativeRegex accepts the portable subset and rejects ECMA-only constructs', t => {
  for (const source of ['^export', '1;$', '[24]', 'index|util', 'a{2,4}b', '\\bword\\b']) {
    t.true(isConservativeRegex(source), `${source} is conservative`);
  }
  for (const source of ['(?=x)', '(?!x)', '(?<=x)', '(?<name>x)', '(x)\\1', '\\p{L}']) {
    t.false(isConservativeRegex(source), `${source} is not conservative`);
  }
});

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
import {
  makeMount,
  GLOB_MAX_RESULTS,
  defaultDeniedSegments,
} from '../src/mount.js';
import { buildMountFixture } from './_mount-fixture.js';

const globCasesUrl = new URL('./mount-glob-cases.json', import.meta.url);
const globContractUrl = new URL('./mount-glob-contract.json', import.meta.url);

const filePowers = makeFilePowers({ fs, path });

/**
 * The glob variant coverage matrix, shared verbatim with a future Rust/XS-side
 * runner. Each case pins the exact `glob(pattern)` result over the canonical
 * mount fixture; a discrepancy is either a Node regression or a cross-language
 * parity break.
 */
const { cases } = JSON.parse(fs.readFileSync(globCasesUrl, 'utf8'));

/**
 * The shared, cross-language contract of glob's normative constants and
 * semantics. Binding it to `mount.js`'s exports here keeps the data a Rust/XS
 * port consumes from drifting away from the Node reference it must match.
 */
const contract = JSON.parse(fs.readFileSync(globContractUrl, 'utf8'));

test('the shared glob contract matches mount.js constants (no code/data drift)', t => {
  // The full deny set and its case-fold rule are shared data so a port cannot
  // under-deny and still pass the table; assert the artifact and the code agree.
  t.deepEqual(
    [...contract.deny.segments].sort(),
    [...defaultDeniedSegments].sort(),
    'contract deny.segments equals mount.js defaultDeniedSegments',
  );
  t.is(contract.deny.caseInsensitive, true);
  // The result cap is shared data so a port cannot pick a different (or absent)
  // limit and still pass the truncation expectation.
  t.is(contract.limits.GLOB_MAX_RESULTS, GLOB_MAX_RESULTS);
  t.is(contract.limits.truncation, 'post-sort');
  t.is(contract.sort.order, 'utf-16-code-unit');
  t.is(contract.matcher.questionMarkIsLiteral, true);
  t.is(contract.matcher.braceExpansion, false);
  t.is(contract.symlink.cycle, 'record-once');
});

test('glob variant case table over the shared fixture (Rust/Node parity contract)', async t => {
  const { root, created } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const haveSymlink = created.has('escape');

  await null;
  let ran = 0;
  for (const testCase of cases) {
    if (testCase.requiresSymlink && !haveSymlink) {
      // The platform could not create the escaping symlink; its confinement
      // expectation is unobservable here.
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await E(mount).glob(testCase.pattern);
    t.deepEqual(
      [...result],
      testCase.expect,
      `${testCase.name} — glob(${JSON.stringify(testCase.pattern)})`,
    );
    ran += 1;
  }
  // Guard against a silently-empty table or a broken loop reporting green.
  t.true(ran >= 30, `expected the matrix to exercise many cases, ran ${ran}`);
});

test('glob rejects a pattern with no non-empty segments', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).glob(''), {
    message: /at least one non-empty segment/,
  });
  await t.throwsAsync(() => E(mount).glob('/'), {
    message: /at least one non-empty segment/,
  });
  await t.throwsAsync(() => E(mount).glob('///'), {
    message: /at least one non-empty segment/,
  });
});

test('glob on a subView is scoped to the sub-root', async t => {
  const { root } = buildMountFixture(t);
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const sub = await E(mount).subView('src');
  // Results are relative to the sub-view's own root, and the sub-view sees
  // nothing above `src`.
  const result = await E(sub).glob('**');
  t.deepEqual(
    [...result],
    [
      'README.md',
      'index.js',
      'main.rs',
      'nested',
      'nested/deep.js',
      'nested/deeper',
      'nested/deeper/deepest.js',
      'util.js',
    ],
  );
  // A sub-view's glob is confined: a pattern reaching for a parent sibling
  // matches nothing (no `..` navigation, and denied roots are unreachable).
  t.deepEqual([...(await E(sub).glob('../README.md'))], []);
});

test('glob with an overridden empty deny set admits the credential names', async t => {
  const { root } = buildMountFixture(t);
  // An empty `deniedSegments` disables denial entirely, so the well-known
  // credential names become visible to glob. This proves the case-table's
  // empty results for `.ssh` / `.env` are load-bearing on the deny filter,
  // not on the names being absent from the fixture.
  const mount = makeMount({
    rootPath: root,
    readOnly: false,
    filePowers,
    deniedSegments: [],
  });
  t.deepEqual([...(await E(mount).glob('.ssh/*'))], ['.ssh/id_rsa']);
  t.deepEqual([...(await E(mount).glob('.env'))], ['.env']);
  // The names the expanded case table pins to `[]` are physically present:
  // with denial disabled they surface, so those `[]` expectations are
  // load-bearing on the deny filter, not on the names being absent.
  t.deepEqual([...(await E(mount).glob('.azure/*'))], ['.azure/token']);
  t.deepEqual([...(await E(mount).glob('.npmrc'))], ['.npmrc']);
  // The case-fold probe (`.SSH`, uppercase) surfaces too — proving the default
  // denial of it depends on the case-insensitive rule, not on absence. On a
  // case-insensitive filesystem (macOS/Windows default), `.SSH` and `.ssh`
  // collide into a single directory entry (kept under the name created first,
  // `.ssh`), so the uppercase probe cannot exist as a distinct name; it is only
  // meaningful where the filesystem preserves case, so gate the assertion on
  // the fixture actually having materialized `.SSH` as its own entry.
  const caseSensitiveFs = fs.readdirSync(root).includes('.SSH');
  if (caseSensitiveFs) {
    t.deepEqual([...(await E(mount).glob('.SSH'))], ['.SSH']);
  } else {
    t.pass(
      'case-insensitive filesystem: .SSH case-fold probe is not a distinct entry',
    );
  }
});

test('glob caps results at GLOB_MAX_RESULTS with deterministic truncation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-glob-wide-'));
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }));

  // A wide tree just over the cap. Zero-padded names so UTF-16 order is the
  // obvious numeric order and the truncation boundary is predictable.
  const total = GLOB_MAX_RESULTS + 5;
  await null;
  for (let i = 0; i < total; i += 1) {
    const name = `f${String(i).padStart(6, '0')}.txt`;
    fs.writeFileSync(path.join(root, name), '');
  }

  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const result = await E(mount).glob('*');
  t.is(result.length, GLOB_MAX_RESULTS, 'result is capped at the maximum');
  t.is(result[0], 'f000000.txt', 'the sorted-first entry survives');
  t.is(
    result[GLOB_MAX_RESULTS - 1],
    `f${String(GLOB_MAX_RESULTS - 1).padStart(6, '0')}.txt`,
    'truncation keeps the sorted-first GLOB_MAX_RESULTS entries',
  );
  // The entries past the cap are dropped, not surfaced.
  t.false(
    result.includes(`f${String(total - 1).padStart(6, '0')}.txt`),
    'entries beyond the cap are absent',
  );
});

test('glob matches an adversarial adjacent-star pattern in bounded time (no ReDoS)', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-glob-redos-'));
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }));

  // A near-NAME_MAX entry whose long run of a single character maximizes
  // backtracking for a `literal*literal*…` pattern. The pattern is
  // caller-controlled, so this is reachable from a single `glob()` call.
  fs.writeFileSync(path.join(root, `${'a'.repeat(200)}X`), '');
  fs.writeFileSync(path.join(root, 'match-me'), '');

  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  // 40 literal `a` segments joined by `*` — the classic catastrophic-
  // backtracking shape. The former RegExp matcher blocked the (synchronous)
  // event loop for minutes on the adversarial entry above; the linear matcher
  // returns promptly. ava's per-test timeout is the backstop that reddens a
  // regression back to the RegExp.
  const pattern = Array.from({ length: 40 }, () => 'a').join('*');
  // The entry ends in `X`, so the trailing literal `a` cannot match: the point
  // is that the call returns at all rather than hanging.
  t.deepEqual([...(await E(mount).glob(pattern))], []);
  // The matcher is still correct for a pattern that does match.
  t.deepEqual([...(await E(mount).glob('m*e'))], ['match-me']);
});

test('glob(**) terminates on an in-confinement symlink cycle', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-glob-cycle-'));
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'sub', 'f.txt'), '');
  try {
    fs.symlinkSync('.', path.join(root, 'self')); // resolves to the root
    fs.symlinkSync('..', path.join(root, 'sub', 'up')); // resolves to an ancestor
  } catch {
    t.pass('platform cannot create symlinks; the cycle case is unobservable');
    return;
  }

  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  // Both symlinks resolve, via `realPath`, to a directory already on the
  // descent path, so `isConfinedPath`/`isDirectory` (which follow symlinks)
  // cannot exclude them. Without the ancestor-cycle guard the `**` walk
  // recurses `self/self/self/…` and `sub/up/sub/up/…` until PATH_MAX. The
  // guard records each cyclic symlink once as an entry and never re-enters it.
  const result = await E(mount).glob('**');
  t.deepEqual([...result], ['self', 'sub', 'sub/f.txt', 'sub/up']);
});

test('glob bounds stacked `**` walks (no super-linear re-traversal)', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-glob-globstar-'));
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }));

  // A branching, moderately deep tree. Without a bound on the `**` walk,
  // stacking `**` segments re-walks every subtree from every position
  // (O(nodes · depth^(k-1)) in the number of `**`), so a handful of `**` on a
  // tree this size drives millions of directory reads and freezes the daemon's
  // (synchronous) event loop on a single caller-supplied pattern — the same
  // class of caller-controlled blow-up the linear matcher removed from segment
  // matching. The `parseGlobPattern` `**`-coalesce and the per-`(dir,
  // remaining)` walk memo bound it; ava's per-test timeout is the backstop that
  // reddens a regression back to the unbounded walk.
  const BRANCH = 2;
  const DEPTH = 7;
  const build = (dir, depth) => {
    fs.writeFileSync(path.join(dir, 'leaf.txt'), '');
    if (depth === 0) {
      return;
    }
    for (let i = 0; i < BRANCH; i += 1) {
      const child = path.join(dir, `d${i}`);
      fs.mkdirSync(child);
      build(child, depth - 1);
    }
  };
  build(root, DEPTH);

  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const baseline = [...(await E(mount).glob('**'))];
  t.true(baseline.length > DEPTH, 'the fixture tree is non-trivial');
  // Each stacked form is semantically identical to a single `**` (zero-or-more
  // segments, repeated, is still zero-or-more), so it must return the same set
  // — and, load-bearingly, return promptly rather than blowing up.
  await null;
  for (const pattern of ['**/**', '**/**/**', '**/**/**/**/**/**']) {
    // eslint-disable-next-line no-await-in-loop
    const result = [...(await E(mount).glob(pattern))];
    t.deepEqual(result, baseline, `${pattern} is bounded and ≡ "**"`);
  }
});

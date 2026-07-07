/**
 * Tests for {@link generate-composite-tsconfigs.mjs}
 *
 * Run with: `yarn exec ava scripts/generate-composite-tsconfigs.test.mjs`
 *
 * @module
 */

import test from 'ava';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseYarnWorkspaces,
  getRuntimeWorkspaceDeps,
  detectCycle,
  makePackageCompositeConfig,
  makeRootCompositeConfig,
  serialise,
  buildConfigs,
} from './generate-composite-tsconfigs.mjs';

// ---------------------------------------------------------------------------
// Helper: strip the generated-file comment header and parse the JSON body
// ---------------------------------------------------------------------------

/**
 * Parse the JSON body of a file produced by `serialise`, skipping the leading
 * comment line(s).
 *
 * @param {string} text - Serialised config text.
 * @returns {any}
 */
function parseGeneratedJson(text) {
  const jsonStart = text.indexOf('\n') + 1;
  return JSON.parse(text.slice(jsonStart));
}

// ---------------------------------------------------------------------------
// parseYarnWorkspaces
// ---------------------------------------------------------------------------

test('parseYarnWorkspaces - parses well-formed NDJSON', t => {
  const ndjson = [
    JSON.stringify({ location: '.', name: null, workspaceDependencies: [] }),
    JSON.stringify({
      location: 'packages/a',
      name: '@scope/a',
      workspaceDependencies: [],
    }),
    JSON.stringify({
      location: 'packages/b',
      name: '@scope/b',
      workspaceDependencies: ['packages/a'],
    }),
  ].join('\n');

  const map = parseYarnWorkspaces(ndjson);
  t.is(map.size, 2, 'root entry should be skipped');
  t.is(map.get('@scope/a'), 'packages/a');
  t.is(map.get('@scope/b'), 'packages/b');
});

test('parseYarnWorkspaces - skips the root entry (name: null)', t => {
  const ndjson = JSON.stringify({
    location: '.',
    name: null,
    workspaceDependencies: [],
  });
  const map = parseYarnWorkspaces(ndjson);
  t.is(map.size, 0);
});

test('parseYarnWorkspaces - ignores blank lines', t => {
  const ndjson = `\n${JSON.stringify({
    location: 'packages/a',
    name: '@scope/a',
    workspaceDependencies: [],
  })}\n\n`;
  const map = parseYarnWorkspaces(ndjson);
  t.is(map.size, 1);
});

// ---------------------------------------------------------------------------
// getRuntimeWorkspaceDeps
// ---------------------------------------------------------------------------

test('getRuntimeWorkspaceDeps - includes workspace: deps from dependencies, peerDependencies, optionalDependencies', t => {
  const pkg = {
    dependencies: { '@scope/a': 'workspace:^', lodash: '^4' },
    peerDependencies: { '@scope/b': 'workspace:^' },
    optionalDependencies: { '@scope/c': 'workspace:^' },
  };
  const deps = getRuntimeWorkspaceDeps(pkg);
  t.true(deps.has('@scope/a'));
  t.true(deps.has('@scope/b'));
  t.true(deps.has('@scope/c'));
  t.false(deps.has('lodash'));
});

test('getRuntimeWorkspaceDeps - excludes devDependencies', t => {
  const pkg = { devDependencies: { '@scope/dev': 'workspace:^' } };
  const deps = getRuntimeWorkspaceDeps(pkg);
  t.is(deps.size, 0);
});

test('getRuntimeWorkspaceDeps - handles missing dep fields gracefully', t => {
  const deps = getRuntimeWorkspaceDeps({});
  t.is(deps.size, 0);
});

test('getRuntimeWorkspaceDeps - excludes non-workspace version specs', t => {
  const pkg = {
    dependencies: { '@scope/a': '^1.2.3', '@scope/b': 'workspace:^' },
  };
  const deps = getRuntimeWorkspaceDeps(pkg);
  t.false(deps.has('@scope/a'));
  t.true(deps.has('@scope/b'));
});

// ---------------------------------------------------------------------------
// detectCycle
// ---------------------------------------------------------------------------

test('detectCycle - returns null for an empty graph', t => {
  t.is(detectCycle(new Map()), null);
});

test('detectCycle - returns null for a linear chain', t => {
  const graph = new Map([
    ['a', ['b']],
    ['b', ['c']],
    ['c', []],
  ]);
  t.is(detectCycle(graph), null);
});

test('detectCycle - detects a direct cycle', t => {
  const graph = new Map([
    ['a', ['b']],
    ['b', ['a']],
  ]);
  const cycle = detectCycle(graph);
  t.not(cycle, null);
  t.true(/** @type {string[]} */ (cycle).length >= 2);
  t.is(
    /** @type {string[]} */ (cycle)[0],
    /** @type {string[]} */ (cycle)[/** @type {string[]} */ (cycle).length - 1],
  );
});

test('detectCycle - detects an indirect cycle', t => {
  const graph = new Map([
    ['a', ['b']],
    ['b', ['c']],
    ['c', ['a']],
  ]);
  const cycle = detectCycle(graph);
  t.not(cycle, null);
  t.is(
    /** @type {string[]} */ (cycle)[0],
    /** @type {string[]} */ (cycle)[/** @type {string[]} */ (cycle).length - 1],
  );
});

test('detectCycle - returns null for a diamond-shaped DAG', t => {
  const graph = new Map([
    ['a', ['b', 'c']],
    ['b', ['d']],
    ['c', ['d']],
    ['d', []],
  ]);
  t.is(detectCycle(graph), null);
});

// ---------------------------------------------------------------------------
// makePackageCompositeConfig / makeRootCompositeConfig / serialise
// ---------------------------------------------------------------------------

test('makePackageCompositeConfig - produces the expected shape', t => {
  const cfg = makePackageCompositeConfig(['../errors/tsconfig.composite.json']);
  t.is(cfg.extends, './tsconfig.build.json');
  t.true(cfg.compilerOptions.composite);
  t.deepEqual(cfg.references, [{ path: '../errors/tsconfig.composite.json' }]);
});

test('makePackageCompositeConfig - produces an empty references array when there are no deps', t => {
  const cfg = makePackageCompositeConfig([]);
  t.deepEqual(cfg.references, []);
});

test('makeRootCompositeConfig - produces files:[] and sorted references', t => {
  const cfg = makeRootCompositeConfig([
    'packages/a/tsconfig.composite.json',
    'packages/b/tsconfig.composite.json',
  ]);
  t.deepEqual(cfg.files, []);
  t.is(cfg.references.length, 2);
  t.is(cfg.references[0].path, 'packages/a/tsconfig.composite.json');
});

test('serialise - starts with a DO NOT EDIT comment', t => {
  const out = serialise({ foo: 1 });
  t.true(out.startsWith('//'), 'should start with a comment');
  t.true(out.includes('DO NOT EDIT'), 'comment should say DO NOT EDIT');
});

test('serialise - produces pretty JSON with a trailing newline after the comment', t => {
  const out = serialise({ foo: 1 });
  t.true(out.endsWith('\n'));
  t.deepEqual(parseGeneratedJson(out), { foo: 1 });
  t.true(out.includes('  "foo"'), 'should be 2-space indented');
});

// ---------------------------------------------------------------------------
// buildConfigs — integration (no filesystem I/O for paths/content)
// ---------------------------------------------------------------------------

const rootDir = '/repo';

const nameToLocation = new Map([
  ['@scope/a', 'packages/a'],
  ['@scope/b', 'packages/b'],
  ['@scope/c', 'packages/c'], // non-participant (no tsconfig.build.json)
]);

const participantLocations = new Set(['packages/a', 'packages/b']);

/** @param {string} location */
function getPackageJson(location) {
  if (location === 'packages/a') {
    return { name: '@scope/a', dependencies: {} };
  }
  if (location === 'packages/b') {
    return {
      name: '@scope/b',
      dependencies: { '@scope/a': 'workspace:^', '@scope/c': 'workspace:^' },
    };
  }
  throw new Error(`Unexpected location: ${location}`);
}

test('buildConfigs - generates per-package and root configs', async t => {
  const files = await buildConfigs({
    rootDir,
    nameToLocation,
    participantLocations,
    getPackageJson,
  });
  t.is(files.size, 3);
  t.true(files.has('/repo/packages/a/tsconfig.composite.json'));
  t.true(files.has('/repo/packages/b/tsconfig.composite.json'));
  t.true(files.has('/repo/tsconfig.composite.json'));
});

test('buildConfigs - package with no deps gets empty references', async t => {
  const files = await buildConfigs({
    rootDir,
    nameToLocation,
    participantLocations,
    getPackageJson,
  });
  const a = parseGeneratedJson(
    files.get('/repo/packages/a/tsconfig.composite.json'),
  );
  t.deepEqual(a.references, []);
});

test('buildConfigs - drops references to non-participants', async t => {
  const files = await buildConfigs({
    rootDir,
    nameToLocation,
    participantLocations,
    getPackageJson,
  });
  const b = parseGeneratedJson(
    files.get('/repo/packages/b/tsconfig.composite.json'),
  );
  t.is(b.references.length, 1);
  t.is(b.references[0].path, '../a/tsconfig.composite.json');
});

test('buildConfigs - computes correct relative paths', async t => {
  const files = await buildConfigs({
    rootDir,
    nameToLocation,
    participantLocations,
    getPackageJson,
  });
  const b = parseGeneratedJson(
    files.get('/repo/packages/b/tsconfig.composite.json'),
  );
  t.is(b.references[0].path, '../a/tsconfig.composite.json');
});

test('buildConfigs - root config lists all participants sorted by path', async t => {
  const files = await buildConfigs({
    rootDir,
    nameToLocation,
    participantLocations,
    getPackageJson,
  });
  const root = parseGeneratedJson(files.get('/repo/tsconfig.composite.json'));
  t.deepEqual(root.files, []);
  t.deepEqual(root.references, [
    { path: 'packages/a/tsconfig.composite.json' },
    { path: 'packages/b/tsconfig.composite.json' },
  ]);
});

test('buildConfigs - throws on a cycle', async t => {
  const cyclicPackageJson = /** @param {string} loc */ loc => {
    if (loc === 'packages/a') {
      return { dependencies: { '@scope/b': 'workspace:^' } };
    }
    return { dependencies: { '@scope/a': 'workspace:^' } };
  };
  await t.throwsAsync(
    () =>
      buildConfigs({
        rootDir,
        nameToLocation,
        participantLocations,
        getPackageJson: cyclicPackageJson,
      }),
    { message: /Cycle detected/ },
  );
});

// ---------------------------------------------------------------------------
// --check mode (on-disk fixture)
// ---------------------------------------------------------------------------

test('--check mode - detects drift when a file is missing', async t => {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'endo-composite-test-'));
  await mkdir(join(tmpRoot, 'packages', 'a'), { recursive: true });
  await writeFile(join(tmpRoot, 'packages', 'a', 'tsconfig.build.json'), '{}');
  await writeFile(
    join(tmpRoot, 'packages', 'a', 'package.json'),
    JSON.stringify({ name: '@scope/a', dependencies: {} }),
  );

  const nameToLoc = new Map([['@scope/a', 'packages/a']]);
  const participants = new Set(['packages/a']);

  const files = await buildConfigs({
    rootDir: tmpRoot,
    nameToLocation: nameToLoc,
    participantLocations: participants,
    getPackageJson: () => ({ name: '@scope/a', dependencies: {} }),
  });

  // Don't write anything to disk — every file should be "missing"
  let missingCount = 0;
  await Promise.all(
    [...files].map(async ([absPath, expected]) => {
      /** @type {string|null} */
      let actual;
      try {
        actual = await readFile(absPath, 'utf8');
      } catch {
        actual = null;
      }
      if (actual !== expected) {
        missingCount += 1;
      }
    }),
  );
  t.true(missingCount > 0, 'should detect missing files as drift');
});

test('--check mode - passes when files match', async t => {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'endo-composite-test-'));
  await mkdir(join(tmpRoot, 'packages', 'a'), { recursive: true });
  await writeFile(join(tmpRoot, 'packages', 'a', 'tsconfig.build.json'), '{}');
  await writeFile(
    join(tmpRoot, 'packages', 'a', 'package.json'),
    JSON.stringify({ name: '@scope/a', dependencies: {} }),
  );

  const nameToLoc = new Map([['@scope/a', 'packages/a']]);
  const participants = new Set(['packages/a']);

  const files = await buildConfigs({
    rootDir: tmpRoot,
    nameToLocation: nameToLoc,
    participantLocations: participants,
    getPackageJson: () => ({ name: '@scope/a', dependencies: {} }),
  });

  await Promise.all(
    [...files].map(([absPath, content]) => writeFile(absPath, content)),
  );

  let drifted = false;
  await Promise.all(
    [...files].map(async ([absPath, expected]) => {
      const actual = await readFile(absPath, 'utf8');
      if (actual !== expected) drifted = true;
    }),
  );
  t.false(drifted, 'no drift expected after writing');
});

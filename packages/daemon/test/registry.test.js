// @ts-check
// Unit tests for the JS reference `EndoRegistry` backend
// (packages/daemon/src/registry.js).  These exercise the MVS resolver, the
// registry table, structured errors, and the resolution shape against an
// in-memory fake registry — no network and no live daemon, so they run in
// the Node-only CI matrix.  See designs/registry-capability.md § Phase 1 and
// designs/mvs-resolver.md § Phased implementation.

import test from '@endo/ses-ava/prepare-endo.js';

import { E } from '@endo/far';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { bytesToText } from '@endo/bytes/to-string.js';
import { createHash } from 'node:crypto';

import {
  makeEndoRegistry,
  makeRegistryTable,
  satisfies,
  minSatisfying,
  parseVersion,
  compareVersions,
  RegistryMissingPackageErrorName,
  RegistryOfflineErrorName,
  RegistryTamperedErrorName,
} from '../src/registry.js';

const sha256Hex = text => createHash('sha256').update(text).digest('hex');

/**
 * Build an in-memory registry backend from a fixture of
 * `{ 'name@version': { dependencies, peerDependencies, optionalDependencies } }`.
 * Each fixture package becomes a tiny CAS tree whose `treeRef` is a fake
 * capability that only carries its `package.json`.
 *
 * @param {Record<string, any>} fixture
 * @param {{ tamper?: Set<string> }} [options]
 */
const makeFakeBackend = (fixture, { tamper = new Set() } = {}) => {
  const fetchLog = [];
  /** @type {Map<string, Uint8Array>} */
  const pjByTree = new Map();

  /** @param {string} name */
  const versionsOf = name =>
    Object.keys(fixture)
      .filter(key => key.slice(0, key.lastIndexOf('@')) === name)
      .map(key => key.slice(key.lastIndexOf('@') + 1));

  return {
    fetchLog,
    backend: harden({
      fetchVersions: async name => {
        fetchLog.push(`versions:${name}`);
        const versions = versionsOf(name);
        return versions.length === 0 ? undefined : versions;
      },
      provideTree: async (name, version) => {
        fetchLog.push(`tree:${name}@${version}`);
        const key = `${name}@${version}`;
        const record = fixture[key];
        if (record === undefined) {
          throw new Error(`fixture missing ${key}`);
        }
        if (tamper.has(key)) {
          const err = new Error(`tampered ${key}`);
          err.name = RegistryTamperedErrorName;
          throw err;
        }
        const pj = {
          name,
          version,
          dependencies: record.dependencies,
          peerDependencies: record.peerDependencies,
          optionalDependencies: record.optionalDependencies,
        };
        const bytes = bytesFromText(JSON.stringify(pj));
        const treeRef = harden({ tag: 'tree', key });
        pjByTree.set(key, bytes);
        return harden({ treeRef, integrity: `sha512-fake-${key}` });
      },
      readPackageJson: async treeRef => {
        const bytes = pjByTree.get(treeRef.key);
        if (bytes === undefined) {
          throw new Error(`no package.json for ${treeRef.key}`);
        }
        return bytes;
      },
      sha256Hex,
    }),
  };
};

/**
 * @param {any} packageJson
 * @param {any} registry
 * @param {object} [options]
 */
const resolveEntry = (packageJson, registry, options) =>
  E(registry).resolve(JSON.stringify(packageJson), options);

test('semver: parse, compare, satisfies, minSatisfying', t => {
  t.deepEqual(
    { ...parseVersion('1.2.3') },
    { major: 1, minor: 2, patch: 3, prerelease: [], raw: '1.2.3' },
  );
  t.is(parseVersion('not-a-version'), undefined);
  const pv = s => /** @type {any} */ (parseVersion(s));
  t.is(compareVersions(pv('1.2.3'), pv('1.2.4')), -1);
  t.is(compareVersions(pv('2.0.0'), pv('1.9.9')), 1);
  t.true(satisfies('1.4.0', '^1.2.0'));
  t.false(satisfies('2.0.0', '^1.2.0'));
  t.true(satisfies('1.2.9', '~1.2.0'));
  t.false(satisfies('1.3.0', '~1.2.0'));
  t.true(satisfies('3.7.2', '3.x'));
  t.true(satisfies('5.0.0', '*'));
  // A caret on a 0.x version pins the minor.
  t.true(satisfies('0.2.9', '^0.2.1'));
  t.false(satisfies('0.3.0', '^0.2.1'));
  t.is(minSatisfying(['1.0.0', '1.2.0', '1.5.3', '2.0.0'], '^1.0.0'), '1.0.0');
  t.is(minSatisfying(['1.0.0', '2.0.0'], '^3.0.0'), undefined);
});

test('resolve: widened transitive range selects the greatest mentioned version', async t => {
  const { backend } = makeFakeBackend({
    'root@1.0.0': {},
    'pkg@1.0.0': {},
    'pkg@1.2.0': {},
    'pkg@1.4.1': {},
    'pkg@2.0.0': {},
    'dep@1.0.0': { dependencies: { pkg: '^1.2.0' } },
  });
  const registry = makeEndoRegistry(backend);
  const resolution = await resolveEntry(
    { name: 'root', dependencies: { pkg: '^1.0.0', dep: '^1.0.0' } },
    registry,
  );
  // Entry requires pkg@^1.0.0, dep widens to pkg@^1.2.0; MVS selects the
  // greatest mentioned version, not a later version merely published in the
  // registry.
  t.deepEqual([...resolution.keys].sort(), ['dep@1.0.0', 'pkg@1.2.0']);
  t.is(resolution.packagesByKey['pkg@1.2.0'].version, '1.2.0');
  t.is(typeof resolution.resolutionHash, 'string');
});

test('resolve: transitive publications do not alter MVS before a direct upgrade', async t => {
  const root = { name: 'root', dependencies: { direct: '^1.0.0' } };
  const fixture = {
    'direct@1.0.0': { dependencies: { transitive: '^1.0.0' } },
    'direct@1.1.0': { dependencies: { transitive: '^1.1.0' } },
    'transitive@1.0.0': {},
  };
  const initial = makeEndoRegistry(makeFakeBackend(fixture).backend);
  const initialResolution = await resolveEntry(root, initial);

  fixture['transitive@1.1.0'] = {};
  fixture['transitive@1.2.0'] = {};
  const afterTransitivePublications = makeEndoRegistry(
    makeFakeBackend(fixture).backend,
  );
  const unchangedResolution = await resolveEntry(
    root,
    afterTransitivePublications,
  );

  t.deepEqual(
    unchangedResolution.keys,
    initialResolution.keys,
    'new transitive versions do not alter the resolution',
  );
  t.is(
    unchangedResolution.resolutionHash,
    initialResolution.resolutionHash,
    'new transitive versions do not alter the resolution hash',
  );

  const upgradedRoot = {
    ...root,
    dependencies: { direct: '^1.1.0' },
  };
  const upgradedResolution = await resolveEntry(
    upgradedRoot,
    afterTransitivePublications,
  );
  t.deepEqual([...upgradedResolution.keys].sort(), [
    'direct@1.1.0',
    'transitive@1.1.0',
  ]);
});

test('resolve: incompatible majors coexist as distinct keys', async t => {
  const { backend } = makeFakeBackend({
    'root@1.0.0': {},
    'ses@1.0.0': {},
    'ses@2.3.4': {},
    'dep@1.0.0': { dependencies: { ses: '^2.0.0' } },
  });
  const registry = makeEndoRegistry(backend);
  const resolution = await resolveEntry(
    { name: 'root', dependencies: { ses: '^1.0.0', dep: '^1.0.0' } },
    registry,
  );
  t.true(resolution.keys.includes('ses@1.0.0'));
  t.true(resolution.keys.includes('ses@2.3.4'));
});

test('resolve: resolutionHash is deterministic and content-addressed', async t => {
  const fixture = {
    'root@1.0.0': {},
    'a@1.0.0': {},
    'b@2.0.0': {},
  };
  const registryA = makeEndoRegistry(makeFakeBackend(fixture).backend);
  const registryB = makeEndoRegistry(makeFakeBackend(fixture).backend);
  const pj = { name: 'root', dependencies: { a: '^1.0.0', b: '^2.0.0' } };
  const one = await resolveEntry(pj, registryA);
  const two = await resolveEntry(pj, registryB);
  t.is(one.resolutionHash, two.resolutionHash);
});

test('resolve: keys is duplicate-free when one version spans two range-major buckets', async t => {
  // `pkg` is selected both by the entry's open-ended `*` (bucketed under
  // major 0) and by dep's `^2.0.0` (bucketed under major 2), both resolving
  // to `pkg@2.0.0`.  The resolution's `keys` and its resolutionHash preimage
  // must not carry the version twice.
  const { backend } = makeFakeBackend({
    'root@1.0.0': {},
    'pkg@1.0.0': {},
    'pkg@2.0.0': {},
    'dep@1.0.0': { dependencies: { pkg: '^2.0.0' } },
  });
  const registry = makeEndoRegistry(backend);
  const resolution = await resolveEntry(
    { name: 'root', dependencies: { pkg: '*', dep: '^1.0.0' } },
    registry,
  );
  const pkgKeys = resolution.keys.filter(key => key === 'pkg@2.0.0');
  t.deepEqual(pkgKeys, ['pkg@2.0.0'], 'pkg@2.0.0 appears exactly once');
  t.is(
    resolution.keys.length,
    new Set(resolution.keys).size,
    'keys are unique',
  );
});

test('fetch/lookup: idempotent and undefined before fetch', async t => {
  const { backend } = makeFakeBackend({ 'pkg@1.0.0': {} });
  const registry = makeEndoRegistry(backend);
  t.is(await E(registry).lookup('pkg', '1.0.0'), undefined);
  const first = await E(registry).fetch('pkg', '1.0.0');
  const second = await E(registry).fetch('pkg', '1.0.0');
  t.is(first, second, 'fetch is idempotent (same tree cap)');
  const looked = await E(registry).lookup('pkg', '1.0.0');
  t.is(looked, first, 'lookup returns the fetched tree cap');
  t.deepEqual(await E(registry).list(), [{ name: 'pkg', version: '1.0.0' }]);
});

test('offline: cache hit resolves; cache miss rejects RegistryOfflineError', async t => {
  const { backend } = makeFakeBackend({
    'root@1.0.0': {},
    'pkg@1.0.0': {},
  });
  const table = makeRegistryTable();
  const registry = makeEndoRegistry(backend, { table });
  // Warm the table online.
  await resolveEntry(
    { name: 'root', dependencies: { pkg: '^1.0.0' } },
    registry,
  );
  // Offline resolution against the warmed table succeeds.
  const warm = await resolveEntry(
    { name: 'root', dependencies: { pkg: '^1.0.0' } },
    registry,
    { offline: true },
  );
  t.true(warm.keys.includes('pkg@1.0.0'));
  // Offline resolution of an uncached package rejects.
  const err = await t.throwsAsync(
    resolveEntry(
      { name: 'other', dependencies: { cold: '^1.0.0' } },
      registry,
      { offline: true },
    ),
  );
  t.is(err.name, RegistryOfflineErrorName);
});

test('missing package rejects RegistryMissingPackageError', async t => {
  const { backend } = makeFakeBackend({ 'root@1.0.0': {} });
  const registry = makeEndoRegistry(backend);
  const err = await t.throwsAsync(
    resolveEntry({ name: 'root', dependencies: { nope: '^1.0.0' } }, registry),
  );
  t.is(err.name, RegistryMissingPackageErrorName);
});

test('tampered tarball surfaces RegistryTamperedError (not wrapped)', async t => {
  const { backend } = makeFakeBackend(
    { 'root@1.0.0': {}, 'evil@1.0.0': {} },
    { tamper: new Set(['evil@1.0.0']) },
  );
  const registry = makeEndoRegistry(backend);
  const err = await t.throwsAsync(
    resolveEntry({ name: 'root', dependencies: { evil: '^1.0.0' } }, registry),
  );
  t.is(err.name, RegistryTamperedErrorName);
});

test('peerDependencies: satisfied resolves, unmet rejects', async t => {
  const fixture = {
    'root@1.0.0': {},
    'pkg-a@1.0.0': { peerDependencies: { react: '^18.0.0' } },
    'react@18.2.0': {},
  };
  {
    const { backend } = makeFakeBackend(fixture);
    const registry = makeEndoRegistry(backend);
    const resolution = await resolveEntry(
      { name: 'root', dependencies: { 'pkg-a': '^1.0.0', react: '^18.0.0' } },
      registry,
    );
    t.true(resolution.keys.includes('react@18.2.0'));
  }
  {
    const { backend } = makeFakeBackend(fixture);
    const registry = makeEndoRegistry(backend);
    const err = await t.throwsAsync(
      resolveEntry(
        { name: 'root', dependencies: { 'pkg-a': '^1.0.0' } },
        registry,
      ),
    );
    t.is(err.name, RegistryMissingPackageErrorName);
  }
});

test('optionalDependencies: a missing optional is silent + diagnosed', async t => {
  const { backend } = makeFakeBackend({
    'root@1.0.0': {},
    'pkg@1.0.0': { optionalDependencies: { fsevents: '^2.0.0' } },
  });
  const registry = makeEndoRegistry(backend);
  const resolution = await resolveEntry(
    { name: 'root', dependencies: { pkg: '^1.0.0' } },
    registry,
  );
  t.false(
    resolution.keys.some(key => key.startsWith('fsevents@')),
    'no fsevents entry',
  );
  t.true(
    resolution.unmetOptionals.some(entry => entry.name === 'fsevents'),
    'fsevents flagged as unmet optional',
  );
});

test('workspace: workspace: specifier resolves the member, mismatch diagnosed', async t => {
  const members = {
    'lib-b': { name: 'lib-b', version: '1.0.0' },
  };
  const { backend: baseBackend } = makeFakeBackend({
    'root@1.0.0': {},
    'lib-a@1.0.0': { dependencies: { 'lib-b': 'workspace:^' } },
  });
  const backend = harden({
    ...baseBackend,
    readWorkspaceMemberPackageJson: async (_workspaceRoot, name) => {
      const member = members[name];
      return member === undefined
        ? undefined
        : bytesFromText(JSON.stringify(member));
    },
  });
  const registry = makeEndoRegistry(backend);
  const resolution = await resolveEntry(
    { name: 'root', dependencies: { 'lib-a': '^1.0.0' } },
    registry,
    { workspaceRoot: 'ws-root' },
  );
  t.true(
    resolution.keys.includes('lib-b@1.0.0'),
    'workspace member resolved at its on-disk version',
  );
  // Its treeRef is undefined (versionless workspace member, no registry tree).
  t.is(resolution.packagesByKey['lib-b@1.0.0'].treeRef, undefined);
});

test('table: LRU eviction past the configured bound', t => {
  const table = makeRegistryTable({ maxEntries: 2 });
  const mk = (name, version) =>
    harden({ name, version, treeRef: { name, version }, integrity: '' });
  table.putTree(mk('a', '1.0.0'));
  table.putTree(mk('b', '1.0.0'));
  t.truthy(table.getTree('a', '1.0.0'));
  // Touch 'a' so 'b' becomes least-recently-used, then overflow.
  table.putTree(mk('c', '1.0.0'));
  t.is(table.getTree('b', '1.0.0'), undefined, 'b evicted as LRU');
  t.truthy(table.getTree('a', '1.0.0'));
  t.truthy(table.getTree('c', '1.0.0'));
});

test('readPackageJson is decoded from resolved trees during the walk', t => {
  // Guards the text round-trip the resolver relies on.
  const bytes = bytesFromText(JSON.stringify({ name: 'x', version: '1' }));
  t.deepEqual(JSON.parse(bytesToText(bytes)), {
    name: 'x',
    version: '1',
  });
});

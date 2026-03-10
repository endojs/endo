import test from '@endo/ses-ava/prepare-endo.js';
import fs from 'fs';
import path from 'path';
import url from 'url';

import {
  mergeEntry,
  mergeState,
  makeSyncedPetStore,
} from '../src/synced-pet-store.js';
import { makeFilePowers } from '../src/daemon-node-powers.js';

const dirname = path.dirname(url.fileURLToPath(import.meta.url));

const filePowers = makeFilePowers({ fs, path });

let testCounter = 0;

/**
 * Create a unique temporary directory for a test.
 *
 * @param {string} prefix
 * @returns {Promise<string>}
 */
const makeTmpDir = async prefix => {
  testCounter += 1;
  const dir = path.join(
    dirname,
    'tmp',
    `synced-pet-store-${prefix}-${testCounter}-${Date.now()}`,
  );
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
};

/**
 * Remove a temporary directory.
 *
 * @param {string} dir
 */
const removeTmpDir = async dir => {
  await fs.promises.rm(dir, { recursive: true, force: true });
};

// --- mergeEntry unit tests ---

test('mergeEntry: higher timestamp wins', t => {
  const a = { locator: 'loc-a', timestamp: 5, writer: 'node-a' };
  const b = { locator: 'loc-b', timestamp: 3, writer: 'node-b' };
  t.is(mergeEntry(a, b), a);
  t.is(mergeEntry(b, a), a);
});

test('mergeEntry: tombstone bias on same timestamp', t => {
  const alive = { locator: 'loc-a', timestamp: 5, writer: 'node-a' };
  const tomb = { locator: null, timestamp: 5, writer: 'node-b' };
  t.is(mergeEntry(alive, tomb), tomb);
  t.is(mergeEntry(tomb, alive), tomb);
});

test('mergeEntry: node-ID tiebreaker on same timestamp and same null status', t => {
  const a = { locator: 'loc-a', timestamp: 5, writer: 'node-a' };
  const b = { locator: 'loc-b', timestamp: 5, writer: 'node-b' };
  // 'node-b' > 'node-a' lexicographically, so b wins.
  t.is(mergeEntry(a, b), b);
  t.is(mergeEntry(b, a), b);
});

test('mergeEntry: both tombstones same timestamp, node-ID tiebreaker', t => {
  const a = { locator: null, timestamp: 5, writer: 'node-a' };
  const b = { locator: null, timestamp: 5, writer: 'node-b' };
  t.is(mergeEntry(a, b), b);
  t.is(mergeEntry(b, a), b);
});

test('mergeEntry: identical entries return first argument', t => {
  const a = { locator: 'loc', timestamp: 5, writer: 'node-a' };
  const b = { locator: 'loc', timestamp: 5, writer: 'node-a' };
  t.is(mergeEntry(a, b), a);
});

// --- mergeState unit tests ---

test('mergeState: disjoint keys', t => {
  /** @type {import('../src/types.js').SyncedPetStoreState} */
  const local = new Map([
    ['alice', { locator: 'loc-a', timestamp: 1, writer: 'n1' }],
  ]);
  /** @type {import('../src/types.js').SyncedPetStoreState} */
  const remote = new Map([
    ['bob', { locator: 'loc-b', timestamp: 2, writer: 'n2' }],
  ]);
  const changed = mergeState(local, remote);
  t.deepEqual([...changed], ['bob']);
  t.is(local.size, 2);
  t.is(local.get('bob')?.locator, 'loc-b');
});

test('mergeState: overlapping key, remote wins', t => {
  /** @type {import('../src/types.js').SyncedPetStoreState} */
  const local = new Map([
    ['shared', { locator: 'old', timestamp: 1, writer: 'n1' }],
  ]);
  /** @type {import('../src/types.js').SyncedPetStoreState} */
  const remote = new Map([
    ['shared', { locator: 'new', timestamp: 3, writer: 'n2' }],
  ]);
  const changed = mergeState(local, remote);
  t.deepEqual([...changed], ['shared']);
  t.is(local.get('shared')?.locator, 'new');
});

test('mergeState: overlapping key, local wins', t => {
  /** @type {import('../src/types.js').SyncedPetStoreState} */
  const local = new Map([
    ['shared', { locator: 'latest', timestamp: 5, writer: 'n1' }],
  ]);
  /** @type {import('../src/types.js').SyncedPetStoreState} */
  const remote = new Map([
    ['shared', { locator: 'old', timestamp: 2, writer: 'n2' }],
  ]);
  const changed = mergeState(local, remote);
  t.deepEqual([...changed], []);
  t.is(local.get('shared')?.locator, 'latest');
});

test('mergeState: is commutative', t => {
  const entryA = { locator: 'loc-a', timestamp: 3, writer: 'n1' };
  const entryB = { locator: null, timestamp: 3, writer: 'n2' };

  const local1 = new Map([['key', { ...entryA }]]);
  const remote1 = new Map([['key', { ...entryB }]]);
  mergeState(local1, remote1);

  const local2 = new Map([['key', { ...entryB }]]);
  const remote2 = new Map([['key', { ...entryA }]]);
  mergeState(local2, remote2);

  t.deepEqual(local1.get('key'), local2.get('key'));
});

test('mergeState: is idempotent', t => {
  const entry = { locator: 'loc', timestamp: 3, writer: 'n1' };
  /** @type {import('../src/types.js').SyncedPetStoreState} */
  const local = new Map([['key', entry]]);
  const remote = new Map([['key', { ...entry }]]);
  const changed = mergeState(local, remote);
  t.deepEqual([...changed], []);
  t.is(local.get('key'), entry);
});

// --- makeSyncedPetStore integration tests ---

test('synced store: write and lookup', async t => {
  const dir = await makeTmpDir('write-lookup');
  try {
    const store = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    await store.write('bob', 'endo://node-bob/handle:abc');
    t.true(store.has('bob'));
    t.is(store.lookup('bob'), 'endo://node-bob/handle:abc');
    t.deepEqual(store.list(), ['bob']);
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: grantee cannot write', async t => {
  const dir = await makeTmpDir('grantee-write');
  try {
    const store = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-bob',
      role: 'grantee',
    });
    await t.throwsAsync(() => store.write('alice', 'endo://node-alice/handle:xyz'), {
      message: /Grantee cannot write/,
    });
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: remove creates tombstone', async t => {
  const dir = await makeTmpDir('remove');
  try {
    const store = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    await store.write('bob', 'endo://node-bob/handle:abc');
    t.true(store.has('bob'));
    await store.remove('bob');
    t.false(store.has('bob'));
    t.is(store.lookup('bob'), undefined);
    t.deepEqual(store.list(), []);
    // The tombstone is in the state.
    const state = store.getState();
    t.is(state.bob.locator, null);
    t.is(state.bob.timestamp, 2);
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: grantee can remove', async t => {
  const dir = await makeTmpDir('grantee-remove');
  try {
    const store = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-bob',
      role: 'grantee',
    });
    // Simulate a remote merge that creates an entry.
    await store.mergeRemoteState(
      { alice: { locator: 'endo://node-alice/handle:xyz', timestamp: 1, writer: 'node-alice' } },
      1,
    );
    t.true(store.has('alice'));
    // Grantee can remove (disclaim).
    await store.remove('alice');
    t.false(store.has('alice'));
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: persistence survives reload', async t => {
  const dir = await makeTmpDir('persist');
  try {
    const store1 = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    await store1.write('bob', 'endo://node-bob/handle:abc');
    await store1.write('carol', 'endo://node-carol/handle:def');
    await store1.remove('carol');

    // Reload from disk.
    const store2 = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    t.true(store2.has('bob'));
    t.is(store2.lookup('bob'), 'endo://node-bob/handle:abc');
    t.false(store2.has('carol'));
    // Carol's tombstone persisted.
    t.is(store2.getState().carol.locator, null);
    t.is(store2.getLocalClock(), 3);
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: merge remote state', async t => {
  const dir = await makeTmpDir('merge');
  try {
    const store = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    await store.write('local-name', 'loc-local');

    const changed = await store.mergeRemoteState(
      {
        'remote-name': { locator: 'loc-remote', timestamp: 5, writer: 'node-bob' },
        'local-name': { locator: 'loc-override', timestamp: 10, writer: 'node-bob' },
      },
      5,
    );
    t.true(changed.has('remote-name'));
    t.true(changed.has('local-name'));
    t.is(store.lookup('remote-name'), 'loc-remote');
    t.is(store.lookup('local-name'), 'loc-override');
    // Local clock advanced to at least remote clock.
    t.true(store.getLocalClock() >= 10);
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: tombstone pruning', async t => {
  const dir = await makeTmpDir('prune');
  try {
    const store = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    await store.write('a', 'loc-a');
    await store.write('b', 'loc-b');
    await store.remove('a'); // timestamp=3
    await store.remove('b'); // timestamp=4

    // Acknowledge through timestamp 3.
    await store.acknowledgeRemoteClock(3);
    const pruned = await store.pruneTombstones();
    t.deepEqual(pruned, ['a']);
    // 'a' is fully gone.
    t.is(store.getState().a, undefined);
    // 'b' tombstone still present (timestamp=4 > remoteAckedClock=3).
    t.is(store.getState().b.locator, null);

    // Acknowledge through timestamp 4.
    await store.acknowledgeRemoteClock(4);
    const pruned2 = await store.pruneTombstones();
    t.deepEqual(pruned2, ['b']);
    t.is(store.getState().b, undefined);
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: pruned tombstones do not survive reload', async t => {
  const dir = await makeTmpDir('prune-persist');
  try {
    const store1 = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    await store1.write('a', 'loc-a');
    await store1.remove('a');
    await store1.acknowledgeRemoteClock(2);
    await store1.pruneTombstones();

    const store2 = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    t.is(store2.getState().a, undefined);
    t.false(store2.has('a'));
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: two replicas converge', async t => {
  const dirA = await makeTmpDir('converge-a');
  const dirB = await makeTmpDir('converge-b');
  try {
    const alice = await makeSyncedPetStore({
      storePath: dirA,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    const bob = await makeSyncedPetStore({
      storePath: dirB,
      filePowers,
      localNodeId: 'node-bob',
      role: 'grantee',
    });

    // Alice writes some entries.
    await alice.write('shared-file', 'loc-file');
    await alice.write('tool', 'loc-tool');

    // Simulate sync: Alice -> Bob.
    const aliceState = alice.getState();
    const aliceClock = alice.getLocalClock();
    await bob.mergeRemoteState(aliceState, aliceClock);
    // Bob acks Alice's clock.
    await alice.acknowledgeRemoteClock(aliceClock);

    t.true(bob.has('shared-file'));
    t.is(bob.lookup('shared-file'), 'loc-file');
    t.is(bob.lookup('tool'), 'loc-tool');

    // Bob removes 'tool' (grantee disclaim).
    await bob.remove('tool');

    // Simulate sync: Bob -> Alice.
    const bobState = bob.getState();
    const bobClock = bob.getLocalClock();
    await alice.mergeRemoteState(bobState, bobClock);
    await bob.acknowledgeRemoteClock(bobClock);

    // Alice sees tool is gone.
    t.false(alice.has('tool'));
    t.is(alice.lookup('tool'), undefined);

    // Both have the same visible entries.
    t.deepEqual(alice.list(), bob.list());
  } finally {
    await removeTmpDir(dirA);
    await removeTmpDir(dirB);
  }
});

test('synced store: revocation wins over concurrent write', async t => {
  const dirA = await makeTmpDir('revoke-a');
  const dirB = await makeTmpDir('revoke-b');
  try {
    const alice = await makeSyncedPetStore({
      storePath: dirA,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    const bob = await makeSyncedPetStore({
      storePath: dirB,
      filePowers,
      localNodeId: 'node-bob',
      role: 'grantee',
    });

    // Alice writes an entry and syncs to Bob.
    await alice.write('secret', 'loc-secret');
    await bob.mergeRemoteState(alice.getState(), alice.getLocalClock());

    // Alice revokes (timestamp=2), Bob has not yet seen it.
    await alice.remove('secret');
    const aliceRemoveTs = alice.getLocalClock();

    // Bob still sees the old entry locally.
    t.true(bob.has('secret'));

    // Now simulate concurrent scenario: Bob merges a state where
    // someone re-introduced 'secret' at the same timestamp.
    // The tombstone bias should cause the deletion to win.
    await bob.mergeRemoteState(
      {
        secret: {
          locator: null,
          timestamp: aliceRemoveTs,
          writer: 'node-alice',
        },
      },
      aliceRemoveTs,
    );
    t.false(bob.has('secret'));
  } finally {
    await removeTmpDir(dirA);
    await removeTmpDir(dirB);
  }
});

test('synced store: crash recovery cleans tmp files', async t => {
  const dir = await makeTmpDir('crash');
  try {
    const namesDir = path.join(dir, 'names');
    await fs.promises.mkdir(namesDir, { recursive: true });
    // Simulate stale tmp files from a crash.
    await fs.promises.writeFile(
      path.join(namesDir, '.tmp.deadbeef'),
      'stale',
    );
    await fs.promises.writeFile(
      path.join(dir, '.tmp.cafebabe'),
      'stale',
    );

    const store = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    // Store loads fine.
    t.deepEqual(store.list(), []);
    // Tmp files cleaned up.
    const namesEntries = await fs.promises.readdir(namesDir);
    t.false(namesEntries.some(n => n.startsWith('.tmp.')));
    const rootEntries = await fs.promises.readdir(dir);
    t.false(rootEntries.some(n => n.startsWith('.tmp.')));
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: list is sorted', async t => {
  const dir = await makeTmpDir('sorted');
  try {
    const store = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    await store.write('zebra', 'loc-z');
    await store.write('alpha', 'loc-a');
    await store.write('middle', 'loc-m');
    t.deepEqual(store.list(), ['alpha', 'middle', 'zebra']);
  } finally {
    await removeTmpDir(dir);
  }
});

test('synced store: overwrite updates entry', async t => {
  const dir = await makeTmpDir('overwrite');
  try {
    const store = await makeSyncedPetStore({
      storePath: dir,
      filePowers,
      localNodeId: 'node-alice',
      role: 'grantor',
    });
    await store.write('name', 'loc-old');
    await store.write('name', 'loc-new');
    t.is(store.lookup('name'), 'loc-new');
    t.is(store.getLocalClock(), 2);
  } finally {
    await removeTmpDir(dir);
  }
});

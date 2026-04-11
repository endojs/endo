// @ts-check
/* global process, setTimeout */
/* eslint-disable no-await-in-loop */

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

import { start, stop, purge, makeEndoClient } from '../index.js';

const { raw } = String;
const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

/**
 * @param {string[]} root
 */
const makeConfig = (...root) => {
  return {
    statePath: path.join(dirname, ...root, 'state'),
    ephemeralStatePath: path.join(dirname, ...root, 'run'),
    cachePath: path.join(dirname, ...root, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
        : path.join(dirname, ...root, 'endo.sock'),
    address: '127.0.0.1:0',
    pets: new Map(),
    values: new Map(),
  };
};

let configPathId = 0;

/**
 * @param {string} testTitle
 * @param {number} configNumber
 */
const getConfigDirectoryName = (testTitle, configNumber) => {
  const basePath = testTitle
    .replace(/\s/giu, '-')
    .replace(/[^\w-]/giu, '')
    .slice(0, 40);
  const testId = String(configPathId).padStart(4, '0');
  const configId = String(configNumber).padStart(2, '0');
  configPathId += 1;
  return `${basePath}#${testId}-${configId}`;
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const config = makeConfig(
    'tmp',
    getConfigDirectoryName(t.title, t.context.length),
  );
  await purge(config);
  await start(config);
  const contextObj = { cancel, cancelled, config };
  t.context.push(contextObj);
  return { ...contextObj };
};

/**
 * @param {ReturnType<typeof makeConfig>} config
 * @param {Promise<void>} cancelled
 */
const makeHost = async (config, cancelled) => {
  const { getBootstrap } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  return { host, bootstrap };
};

/**
 * Prepare a host with a TCP test network installed.
 * @param {import('ava').ExecutionContext<any>} t
 */
const prepareHostWithTestNetwork = async t => {
  const { config, cancel, cancelled } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  // Store the listen address before the network service starts.
  await E(host).storeValue('127.0.0.1:0', 'tcp-listen-addr');

  // Install test network.
  const servicePath = path.join(dirname, 'src', 'networks', 'tcp-netstring.js');
  const serviceLocation = url.pathToFileURL(servicePath).href;
  await E(host).makeUnconfined('@main', serviceLocation, {
    powersName: '@agent',
    resultName: 'test-network',
  });

  // Move test network to network dir.
  await E(host).move(['test-network'], ['@nets', 'tcp']);

  return { host, config, cancel, cancelled };
};

test.beforeEach(async t => {
  t.context = [];
});

test.afterEach.always(async t => {
  await Promise.allSettled(
    t.context.flatMap(({ cancel, cancelled, config }) => {
      cancel(Error('teardown'));
      return [cancelled, stop(config)];
    }),
  );
});

// --- Two-daemon synced pet store tests ---

test.serial(
  'invite/accept creates synced-pet-store pair on both sides',
  async t => {
    const { host: hostA } = await prepareHostWithTestNetwork(t);
    const { host: hostB } = await prepareHostWithTestNetwork(t);

    // Alice invites Bob.
    const invitation = await E(hostA).invite('bob');
    const invitationLocator = await E(invitation).locate();

    // Bob accepts the invitation.
    await E(hostB).accept(invitationLocator, 'alice');

    // After acceptance, Alice should have a synced-pet-store under 'bob'.
    // The synced-pet-store is a formula value with write/remove/list/etc.
    const aliceSyncedStore = await E(hostA).getSyncedStore('bob');
    t.truthy(aliceSyncedStore, 'Alice should have a synced store under "bob"');

    // The synced store should have a 'list' method.
    const aliceNames = await E(aliceSyncedStore).list();
    t.true(Array.isArray(aliceNames), 'Alice synced store should be listable');
    // Alice's grantor store wrote the guest handle under "bob" pet name
    // during acceptance.
    t.true(
      aliceNames.length !== 0,
      'Alice store should have at least one entry',
    );

    // Bob should have a synced-pet-store under 'alice'.
    const bobSyncedStore = await E(hostB).getSyncedStore('alice');
    t.truthy(bobSyncedStore, 'Bob should have a synced store under "alice"');
    const bobNames = await E(bobSyncedStore).list();
    t.true(Array.isArray(bobNames), 'Bob synced store should be listable');
  },
);

test.serial(
  'synced stores converge automatically via push-based sync',
  async t => {
    const { host: hostA } = await prepareHostWithTestNetwork(t);
    const { host: hostB } = await prepareHostWithTestNetwork(t);

    // Introduce daemons.
    const invitation = await E(hostA).invite('bob');
    const invitationLocator = await E(invitation).locate();
    await E(hostB).accept(invitationLocator, 'alice');

    // Get the synced stores.
    const aliceStore = await E(hostA).getSyncedStore('bob');
    const bobStore = await E(hostB).getSyncedStore('alice');

    // Alice (grantor) writes a new capability into the synced store.
    await E(hostA).storeValue('auto-sync-val', 'auto-sync');
    const autoSyncLocator = await E(hostA).locate('auto-sync');
    await E(aliceStore).storeLocator('auto-sync', autoSyncLocator);

    // Wait for the push-based sync to propagate the change.
    // The sync subscriptions run in the background; poll briefly
    // for the change to arrive rather than calling manual sync.
    const deadline = Date.now() + 15_000;
    let found = false;
    while (Date.now() < deadline) {
      found = await E(bobStore).has('auto-sync');
      if (found) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    t.true(found, 'Bob should see auto-synced entry without manual sync');

    // Verify the locators match.
    const aliceLocator = await E(aliceStore).lookup('auto-sync');
    const bobLocator = await E(bobStore).lookup('auto-sync');
    t.is(aliceLocator, bobLocator, 'Both stores should agree on the locator');
  },
);

test.serial('synced stores converge via manual sync', async t => {
  const { host: hostA } = await prepareHostWithTestNetwork(t);
  const { host: hostB } = await prepareHostWithTestNetwork(t);

  // Introduce daemons.
  const invitation = await E(hostA).invite('bob');
  const invitationLocator = await E(invitation).locate();
  await E(hostB).accept(invitationLocator, 'alice');

  // Get the synced stores.
  const aliceStore = await E(hostA).getSyncedStore('bob');
  const bobStore = await E(hostB).getSyncedStore('alice');

  // Alice (grantor) writes a new capability into the synced store.
  await E(hostA).storeValue('shared-secret', 'secret');
  const secretLocator = await E(hostA).locate('secret');
  await E(aliceStore).storeLocator('shared-secret', secretLocator);

  // Before sync, Bob's grantee store does not have the new entry.
  const bobNamesBefore = await E(bobStore).list();
  t.false(
    bobNamesBefore.includes('shared-secret'),
    'Bob should not see the entry before sync',
  );

  // Perform manual sync: exchange state between the two stores.
  const aliceState = await E(aliceStore).getState();
  const aliceClock = await E(aliceStore).getLocalClock();
  const bobState = await E(bobStore).getState();
  const bobClock = await E(bobStore).getLocalClock();

  // Merge Alice -> Bob.
  await E(bobStore).mergeRemoteState(aliceState, aliceClock);
  // Merge Bob -> Alice.
  await E(aliceStore).mergeRemoteState(bobState, bobClock);

  // Ack both directions.
  await E(aliceStore).acknowledgeRemoteClock(bobClock);
  await E(bobStore).acknowledgeRemoteClock(aliceClock);

  // After sync, Bob should see the shared entry.
  const bobNamesAfter = await E(bobStore).list();
  t.true(
    bobNamesAfter.includes('shared-secret'),
    'Bob should see the entry after sync',
  );

  // Both stores should have the same effective entry for 'shared-secret'.
  const aliceLocator = await E(aliceStore).lookup('shared-secret');
  const bobLocator = await E(bobStore).lookup('shared-secret');
  t.is(aliceLocator, bobLocator, 'Both stores should agree on the locator');
});

test.serial(
  'revocation propagates via sync and tombstone bias holds',
  async t => {
    const { host: hostA } = await prepareHostWithTestNetwork(t);
    const { host: hostB } = await prepareHostWithTestNetwork(t);

    // Introduce daemons.
    const invitation = await E(hostA).invite('bob');
    const invitationLocator = await E(invitation).locate();
    await E(hostB).accept(invitationLocator, 'alice');

    const aliceStore = await E(hostA).getSyncedStore('bob');
    const bobStore = await E(hostB).getSyncedStore('alice');

    // Alice writes a capability.
    await E(hostA).storeValue('revocable-thing', 'revocable');
    const revocableLocator = await E(hostA).locate('revocable');
    await E(aliceStore).storeLocator('revocable', revocableLocator);

    // Sync so Bob sees it.
    const syncStores = async () => {
      const aState = await E(aliceStore).getState();
      const aClock = await E(aliceStore).getLocalClock();
      const bState = await E(bobStore).getState();
      const bClock = await E(bobStore).getLocalClock();
      await E(bobStore).mergeRemoteState(aState, aClock);
      await E(aliceStore).mergeRemoteState(bState, bClock);
      await E(aliceStore).acknowledgeRemoteClock(bClock);
      await E(bobStore).acknowledgeRemoteClock(aClock);
    };

    await syncStores();
    t.true(
      await E(bobStore).has('revocable'),
      'Bob should see revocable before revocation',
    );

    // Alice revokes by removing the entry (creates a tombstone).
    await E(aliceStore).remove('revocable');

    // After sync, Bob should no longer see it.
    await syncStores();
    t.false(
      await E(bobStore).has('revocable'),
      'Bob should not see revocable after revocation sync',
    );

    // Tombstone pruning should work after ack.
    const prunedAlice = await E(aliceStore).pruneTombstones();
    const prunedBob = await E(bobStore).pruneTombstones();
    // At least one side should have pruned the tombstone.
    t.true(
      prunedAlice.length !== 0 || prunedBob.length !== 0,
      'At least one side should prune the tombstone',
    );
  },
);

test.serial('grantee can disclaim (remove) and it propagates', async t => {
  const { host: hostA } = await prepareHostWithTestNetwork(t);
  const { host: hostB } = await prepareHostWithTestNetwork(t);

  const invitation = await E(hostA).invite('bob');
  const invitationLocator = await E(invitation).locate();
  await E(hostB).accept(invitationLocator, 'alice');

  const aliceStore = await E(hostA).getSyncedStore('bob');
  const bobStore = await E(hostB).getSyncedStore('alice');

  // Alice writes a capability.
  await E(hostA).storeValue('optional-thing', 'optional');
  const optionalLocator = await E(hostA).locate('optional');
  await E(aliceStore).storeLocator('optional', optionalLocator);

  // Sync.
  const syncStores = async () => {
    const aState = await E(aliceStore).getState();
    const aClock = await E(aliceStore).getLocalClock();
    const bState = await E(bobStore).getState();
    const bClock = await E(bobStore).getLocalClock();
    await E(bobStore).mergeRemoteState(aState, aClock);
    await E(aliceStore).mergeRemoteState(bState, bClock);
    await E(aliceStore).acknowledgeRemoteClock(bClock);
    await E(bobStore).acknowledgeRemoteClock(aClock);
  };

  await syncStores();
  t.true(await E(bobStore).has('optional'));

  // Bob (grantee) disclaims by removing.
  await E(bobStore).remove('optional');

  // After sync, Alice should also see it removed.
  await syncStores();
  t.false(
    await E(aliceStore).has('optional'),
    'Alice should see the entry removed after Bob disclaimed',
  );
});

test.serial('synced stores converge after offline changes', async t => {
  const {
    host: hostA,
    config: configA,
    cancel: cancelA,
  } = await prepareHostWithTestNetwork(t);
  const { host: hostB } = await prepareHostWithTestNetwork(t);

  // Introduce daemons.
  const invitation = await E(hostA).invite('bob');
  const invitationLocator = await E(invitation).locate();
  await E(hostB).accept(invitationLocator, 'alice');

  const aliceStore = await E(hostA).getSyncedStore('bob');
  const bobStore = await E(hostB).getSyncedStore('alice');

  // Alice writes a capability and syncs.
  await E(hostA).storeValue('pre-restart-val', 'pre-restart');
  const preRestartLocator = await E(hostA).locate('pre-restart');
  await E(aliceStore).storeLocator('pre-restart', preRestartLocator);

  const syncStores = async (aStore, bStore) => {
    const aState = await E(aStore).getState();
    const aClock = await E(aStore).getLocalClock();
    const bState = await E(bStore).getState();
    const bClock = await E(bStore).getLocalClock();
    await E(bStore).mergeRemoteState(aState, aClock);
    await E(aStore).mergeRemoteState(bState, bClock);
    await E(aStore).acknowledgeRemoteClock(bClock);
    await E(bStore).acknowledgeRemoteClock(aClock);
  };

  await syncStores(aliceStore, bobStore);
  t.true(
    await E(bobStore).has('pre-restart'),
    'Bob should see pre-restart entry',
  );

  // Stop daemon A (simulating offline/partition).
  cancelA(Error('simulate-partition'));
  await stop(configA);

  // Restart daemon A.
  const { reject: cancelA2, promise: cancelledA2 } = makePromiseKit();
  t.context.push({ cancel: cancelA2, cancelled: cancelledA2, config: configA });
  await start(configA);
  const { host: hostA2 } = await makeHost(configA, cancelledA2);

  // Reinstall test network on restarted daemon A.
  await E(hostA2).storeValue('127.0.0.1:0', 'tcp-listen-addr');
  const servicePath2 = path.join(
    dirname,
    'src',
    'networks',
    'tcp-netstring.js',
  );
  const serviceLocation2 = url.pathToFileURL(servicePath2).href;
  await E(hostA2).makeUnconfined('@main', serviceLocation2, {
    powersName: '@agent',
    resultName: 'test-network-2',
  });
  await E(hostA2).move(['test-network-2'], ['@nets', 'tcp']);

  // After restart, the synced store should still be accessible via
  // getSyncedStore because the mapping is persisted in the @pins directory.
  const aliceStore2 = await E(hostA2).getSyncedStore('bob');
  t.truthy(aliceStore2, 'Alice synced store should survive restart');

  // The pre-restart entry should be present (CRDT state is persisted on disk).
  const preRestartNames = await E(aliceStore2).list();
  t.true(
    preRestartNames.includes('pre-restart'),
    'Pre-restart entry should survive daemon restart',
  );

  // Alice writes a new entry offline (while Bob doesn't know).
  await E(hostA2).storeValue('post-restart-val', 'post-restart');
  const postRestartLocator = await E(hostA2).locate('post-restart');
  await E(aliceStore2).storeLocator('post-restart', postRestartLocator);

  // Sync the restarted Alice store with Bob's store.
  await syncStores(aliceStore2, bobStore);

  // Bob should now see both the pre-restart and post-restart entries.
  t.true(
    await E(bobStore).has('pre-restart'),
    'Bob should still have pre-restart entry after sync',
  );
  t.true(
    await E(bobStore).has('post-restart'),
    'Bob should have post-restart entry after sync with restarted daemon',
  );
});

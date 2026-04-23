// @ts-check

import '@endo/init/debug.js';

import test from '@endo/ses-ava/prepare-endo.js';

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import popen from 'child_process';
import url from 'url';

import { makePromiseKit } from '@endo/promise-kit';
import {
  makeCryptoPowers,
  makeFilePowers,
  makeDaemonicControlPowers,
} from '../src/daemon-node-powers.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

const xsnapBinaryAvailable = (() => {
  try {
    const xsnapPkgUrl = new URL(
      '../node_modules/@agoric/xsnap/package.json',
      import.meta.url,
    );
    const xsnapDir = path.dirname(url.fileURLToPath(xsnapPkgUrl));
    const platform = { Linux: 'lin', Darwin: 'mac' }[os.type()];
    if (!platform) return false;
    return fs.existsSync(
      path.join(
        xsnapDir,
        'xsnap-native',
        'xsnap',
        'build',
        'bin',
        platform,
        'release',
        'xsnap-worker',
      ),
    );
  } catch {
    return false;
  }
})();

// Skip the whole suite if the xsnap native binary isn't built. We check for
// it explicitly rather than catching the spawn failure so the skip reason is
// visible up front.
const conditionalTest = xsnapBinaryAvailable ? test : test.skip;

const filePowers = makeFilePowers({ fs, path });
const cryptoPowers = makeCryptoPowers(crypto);

/** @param {string} suite */
const makeConfig = suite => {
  const root = path.join(dirname, 'tmp', 'xsnap-worker', suite);
  return {
    statePath: path.join(root, 'state'),
    ephemeralStatePath: path.join(root, 'run'),
    cachePath: path.join(root, 'cache'),
    sockPath: path.join(root, 'endo.sock'),
  };
};

/** @param {ReturnType<typeof makeConfig>} config */
const setupControl = async config => {
  await Promise.all([
    filePowers.makePath(config.statePath),
    filePowers.makePath(config.ephemeralStatePath),
    filePowers.makePath(config.cachePath),
  ]);
  return makeDaemonicControlPowers(
    config,
    url.fileURLToPath,
    filePowers,
    fs,
    popen,
  );
};

/** @param {string} subdir */
const cleanupTmp = async subdir => {
  const root = path.join(dirname, 'tmp', 'xsnap-worker', subdir);
  await fs.promises.rm(root, { recursive: true, force: true });
};

conditionalTest(
  'xsnap worker preserves heap values across snapshot revival',
  async t => {
    await cleanupTmp('persist');
    t.teardown(() => cleanupTmp('persist'));

    const config = makeConfig('persist');
    const control = await setupControl(config);
    const workerId = await cryptoPowers.randomHex512();

    const snapshotPath = path.join(
      config.statePath,
      'xsnap-worker',
      workerId,
      'heap.xss',
    );

    // First spawn: fresh boot, no snapshot. Build up some heap state.
    {
      const cancelled1 = makePromiseKit();
      const { workerDaemonFacet, workerTerminated } =
        await control.makeXsnapWorker(
          workerId,
          /** @type {any} */ (undefined),
          /** @type {Promise<never>} */ (cancelled1.promise),
        );

      // SES lockdown has been applied on first boot; the start compartment
      // should expose `harden` and `Compartment`, and the primordials should
      // be frozen.
      t.is(
        await workerDaemonFacet.evaluate('typeof harden'),
        'function',
        'harden is available after SES lockdown',
      );
      t.is(
        await workerDaemonFacet.evaluate('typeof Compartment'),
        'function',
        'Compartment is available after SES lockdown',
      );
      t.is(
        await workerDaemonFacet.evaluate('Object.isFrozen(Object.prototype)'),
        true,
        'primordials are frozen after SES lockdown',
      );

      // No snapshot yet, so the counter starts undefined.
      t.is(
        await workerDaemonFacet.evaluate('typeof globalThis.counter'),
        'undefined',
        'fresh worker has no prior counter',
      );

      const v1 = await workerDaemonFacet.evaluate(
        'globalThis.counter = (globalThis.counter ?? 0) + 1; globalThis.counter',
      );
      const v2 = await workerDaemonFacet.evaluate(
        'globalThis.counter = (globalThis.counter ?? 0) + 1; globalThis.counter',
      );
      const v3 = await workerDaemonFacet.evaluate(
        'globalThis.counter = (globalThis.counter ?? 0) + 1; globalThis.counter',
      );
      t.is(v1, 1);
      t.is(v2, 2);
      t.is(v3, 3);

      // Stash a less-trivial value too: a closure that captures private
      // state. If orthogonal persistence really restores the *whole* heap,
      // calling this closure after revival should remember its captured
      // counter.
      await workerDaemonFacet.evaluate(`
        (() => {
          let n = 100;
          globalThis.bumpClosure = () => (n += 1);
        })();
      `);
      t.is(await workerDaemonFacet.evaluate('globalThis.bumpClosure()'), 101);
      t.is(await workerDaemonFacet.evaluate('globalThis.bumpClosure()'), 102);

      cancelled1.reject(new Error('test: shutting down for snapshot'));
      await workerTerminated;
    }

    // The snapshot file should now exist on disk and be non-empty.
    const stat = await fs.promises.stat(snapshotPath);
    t.true(stat.isFile(), 'heap.xss exists after graceful cancel');
    t.true(stat.size > 0, 'heap.xss is non-empty');

    // Second spawn with the SAME workerId: should revive from snapshot.
    // No bootstrap is re-evaluated; the eval handler and globals come back
    // from the snapshotted heap.
    {
      const cancelled2 = makePromiseKit();
      const { workerDaemonFacet, workerTerminated } =
        await control.makeXsnapWorker(
          workerId,
          /** @type {any} */ (undefined),
          /** @type {Promise<never>} */ (cancelled2.promise),
        );

      // SES state survives the snapshot along with everything else.
      t.is(
        await workerDaemonFacet.evaluate('typeof harden'),
        'function',
        'harden still present after revival',
      );
      t.is(
        await workerDaemonFacet.evaluate('Object.isFrozen(Object.prototype)'),
        true,
        'primordials still frozen after revival',
      );

      t.is(
        await workerDaemonFacet.evaluate('globalThis.counter'),
        3,
        'counter was restored from the snapshot',
      );

      const v4 = await workerDaemonFacet.evaluate(
        'globalThis.counter = (globalThis.counter ?? 0) + 1; globalThis.counter',
      );
      const v5 = await workerDaemonFacet.evaluate(
        'globalThis.counter = (globalThis.counter ?? 0) + 1; globalThis.counter',
      );
      t.is(v4, 4, 'counter increments from the restored value');
      t.is(v5, 5);

      // The closure's private state survived too.
      t.is(
        await workerDaemonFacet.evaluate('globalThis.bumpClosure()'),
        103,
        'closure-captured private state survived snapshot revival',
      );

      cancelled2.reject(new Error('test: shutting down again'));
      await workerTerminated;
    }

    // And once more, just to make sure repeated revivals chain correctly.
    {
      const cancelled3 = makePromiseKit();
      const { workerDaemonFacet, workerTerminated } =
        await control.makeXsnapWorker(
          workerId,
          /** @type {any} */ (undefined),
          /** @type {Promise<never>} */ (cancelled3.promise),
        );
      t.is(
        await workerDaemonFacet.evaluate('globalThis.counter'),
        5,
        'counter persisted across the second snapshot/revival cycle',
      );
      t.is(
        await workerDaemonFacet.evaluate('globalThis.bumpClosure()'),
        104,
        'closure private state persisted across the second cycle',
      );
      cancelled3.reject(new Error('test: cleanup'));
      await workerTerminated;
    }
  },
);

conditionalTest('distinct xsnap-worker ids get distinct heaps', async t => {
  await cleanupTmp('distinct');
  t.teardown(() => cleanupTmp('distinct'));

  const config = makeConfig('distinct');
  const control = await setupControl(config);

  const idA = await cryptoPowers.randomHex512();
  const idB = await cryptoPowers.randomHex512();

  // Boot worker A and put a value on its globals.
  {
    const cancelled = makePromiseKit();
    const { workerDaemonFacet, workerTerminated } =
      await control.makeXsnapWorker(
        idA,
        /** @type {any} */ (undefined),
        /** @type {Promise<never>} */ (cancelled.promise),
      );
    await workerDaemonFacet.evaluate('globalThis.tag = "A"');
    cancelled.reject(new Error('teardown'));
    await workerTerminated;
  }

  // Boot worker B independently — no snapshot, no shared state.
  {
    const cancelled = makePromiseKit();
    const { workerDaemonFacet, workerTerminated } =
      await control.makeXsnapWorker(
        idB,
        /** @type {any} */ (undefined),
        /** @type {Promise<never>} */ (cancelled.promise),
      );
    t.is(
      await workerDaemonFacet.evaluate('typeof globalThis.tag'),
      'undefined',
      'worker B does not see worker A globals',
    );
    await workerDaemonFacet.evaluate('globalThis.tag = "B"');
    cancelled.reject(new Error('teardown'));
    await workerTerminated;
  }

  // Revive worker A: should still say "A".
  {
    const cancelled = makePromiseKit();
    const { workerDaemonFacet, workerTerminated } =
      await control.makeXsnapWorker(
        idA,
        /** @type {any} */ (undefined),
        /** @type {Promise<never>} */ (cancelled.promise),
      );
    t.is(await workerDaemonFacet.evaluate('globalThis.tag'), 'A');
    cancelled.reject(new Error('teardown'));
    await workerTerminated;
  }

  // Revive worker B: should still say "B".
  {
    const cancelled = makePromiseKit();
    const { workerDaemonFacet, workerTerminated } =
      await control.makeXsnapWorker(
        idB,
        /** @type {any} */ (undefined),
        /** @type {Promise<never>} */ (cancelled.promise),
      );
    t.is(await workerDaemonFacet.evaluate('globalThis.tag'), 'B');
    cancelled.reject(new Error('teardown'));
    await workerTerminated;
  }
});

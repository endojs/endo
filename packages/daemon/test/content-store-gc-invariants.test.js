// @ts-nocheck
/* global process, setTimeout */

// Adversarial tests against the invariants claimed by the
// content-store and scratch-mount cleanup pass in `daemon.js`.
// Each test names the invariant it attacks.  See
// `designs/daemon-content-store-gc.md` for the contract.

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { start, stop, purge, makeEndoClient, makeReaderRef } from '../index.js';
import { parseId } from '../src/formula-identifier.js';

const { raw } = String;

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

/**
 * @param {() => Promise<boolean>} predicate
 * @param {{ timeoutMs?: number, intervalMs?: number, message?: string }} [opts]
 */
const waitForCondition = async (predicate, opts = {}) => {
  await null;
  const { timeoutMs = 5000, intervalMs = 50, message = 'condition' } = opts;
  const startTime = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    if (await predicate()) {
      return;
    }
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timed out waiting for ${message}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
};

/** @param {Array<string>} root */
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

/** @type {Map<string, number>} */
const testNumbers = new Map();

const getConfigDirectoryName = (testTitle, testConfigIndex) => {
  const munged = testTitle.match(/\w+/gu)?.join('-') || '';
  if (!testNumbers.has(testTitle)) testNumbers.set(testTitle, testNumbers.size);
  const testNumber = testNumbers.get(testTitle);
  const nnnn = String(testNumber).padStart(4, '0');
  const letter = (testConfigIndex + 10).toString(36);
  return `csgi-${munged.slice(0, 18)}~${nnnn}${letter}`;
};

const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  cancelled.catch(() => {});
  const config = {
    ...makeConfig('tmp', getConfigDirectoryName(t.title, t.context.length)),
    gcEnabled: true,
  };

  await purge(config);
  await start(config);

  const contextObj = { cancel, cancelled, config };
  t.context.push(contextObj);
  return { ...contextObj };
};

const makeHost = async (config, cancelled) => {
  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  closed.catch(() => {});
  const bootstrap = getBootstrap();
  return { host: E(bootstrap).host() };
};

test.beforeEach(t => {
  t.context = [];
});

test.afterEach.always(async t => {
  const configs = t.context;
  await Promise.allSettled(configs.map(({ config }) => stop(config)));
  for (const { cancel, cancelled } of configs) {
    cancelled.catch(() => {});
    cancel(new Error('test cleanup'));
  }
});

const contentPathOf = (statePath, sha256) =>
  path.join(statePath, 'store-sha256', sha256);

const mountPathOf = (statePath, formulaNumber) =>
  path.join(statePath, 'mounts', formulaNumber);

// Invariant: scratch-mount cleanup removes the backing directory
// even when it is empty (no writes were ever performed against the
// mount).  The XS removeDirectory implementation walks the directory
// tree; empty directories should not require special-casing.
test('reclaims an empty scratch-mount backing directory', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  await E(host).provideScratchMount('untouched-scratch');
  const scratchId = await E(host).identify('untouched-scratch');
  const { number: formulaNumber } = parseId(scratchId);
  const dirPath = mountPathOf(config.statePath, formulaNumber);

  // The scratch was provided but never written to.  The directory
  // should still exist (provideScratchMount creates it eagerly).
  t.true(fs.existsSync(dirPath), 'untouched scratch dir created');
  t.deepEqual(fs.readdirSync(dirPath), [], 'untouched scratch dir is empty');

  await E(host).remove('untouched-scratch');

  await waitForCondition(async () => !fs.existsSync(dirPath), {
    message: `${dirPath} to be removed`,
  });
  t.false(fs.existsSync(dirPath));
});

// Invariant: scratch-mount cleanup is idempotent when the backing
// directory is already missing (manually deleted, or never created).
// Removing the formula must not throw and must not leave any state
// inconsistent.
test('does not throw when a scratch-mount backing directory is already missing', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  await E(host).provideScratchMount('vanishing-scratch');
  const scratchId = await E(host).identify('vanishing-scratch');
  const { number: formulaNumber } = parseId(scratchId);
  const dirPath = mountPathOf(config.statePath, formulaNumber);

  // Yank the directory out from under the daemon before collection.
  await fs.promises.rm(dirPath, { recursive: true, force: true });
  t.false(fs.existsSync(dirPath));

  // Collection should succeed without error.
  await E(host).remove('vanishing-scratch');

  // Give the GC pass a chance to run; the daemon should not crash.
  await new Promise(resolve => setTimeout(resolve, 200));

  // Verify the daemon is still responsive.
  await E(host).storeValue('still-alive', 'sentinel');
  t.is(await E(host).lookup(['sentinel']), 'still-alive');
});

// Invariant: a content hash that never landed on disk (e.g., the
// store-sha256 file was deleted manually) must not crash the GC
// pass.  contentStore.remove is documented as idempotent.
test('does not throw when a content-store blob is already missing', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  const readerRef = makeReaderRef([
    new TextEncoder().encode('about-to-vanish'),
  ]);
  const blob = await E(host).storeBlob(readerRef, 'phantom-blob');
  const sha256 = await E(blob).sha256();
  const filePath = contentPathOf(config.statePath, sha256);

  // Yank the content file out from under the daemon.
  await fs.promises.unlink(filePath);
  t.false(fs.existsSync(filePath));

  // Collection should succeed without error.
  await E(host).remove('phantom-blob');

  await new Promise(resolve => setTimeout(resolve, 200));

  // Daemon is still responsive.
  await E(host).storeValue('still-alive', 'sentinel');
  t.is(await E(host).lookup(['sentinel']), 'still-alive');
});

// Invariant: collecting many blobs with distinct content removes
// every file.  No per-formula short-circuit, no batch-size limit.
test('reclaims many distinct content hashes across sequential collections', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  const count = 8;
  const shas = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = new TextEncoder().encode(`distinct-${i}`);
    // eslint-disable-next-line no-await-in-loop
    const blob = await E(host).storeBlob(makeReaderRef([bytes]), `batch-${i}`);
    // eslint-disable-next-line no-await-in-loop
    const sha = await E(blob).sha256();
    shas.push(sha);
  }

  for (const sha of shas) {
    t.true(
      fs.existsSync(contentPathOf(config.statePath, sha)),
      `blob ${sha.slice(0, 8)} present before collection`,
    );
  }

  // Drop every blob via direct host.remove (each pet name maps
  // 1:1 to a readable-blob formula at this scope).
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await E(host).remove(`batch-${i}`);
  }

  await waitForCondition(
    async () =>
      shas.every(sha => !fs.existsSync(contentPathOf(config.statePath, sha))),
    { message: 'all batched blobs to be removed' },
  );

  for (const sha of shas) {
    t.false(
      fs.existsSync(contentPathOf(config.statePath, sha)),
      `blob ${sha.slice(0, 8)} reclaimed`,
    );
  }
});

// Invariant: a content hash that is shared with a surviving formula
// is retained even when many distractor formulas with distinct
// hashes are also collected in the same period.  This exercises
// the survivor-scan loop's correctness against a non-trivial
// candidate set.
test('retains a shared hash when one of many collected formulas references it', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  // One blob that survives.
  const sharedBytes = new TextEncoder().encode('the-shared-content');
  const survivor = await E(host).storeBlob(
    makeReaderRef([sharedBytes]),
    'keepsake',
  );
  const sharedSha = await E(survivor).sha256();

  // Several blobs that will be collected, one of which dedupes
  // against the survivor.
  const distractorShas = [];
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const blob = await E(host).storeBlob(
      makeReaderRef([new TextEncoder().encode(`distractor-${i}`)]),
      `distractor-${i}`,
    );
    // eslint-disable-next-line no-await-in-loop
    distractorShas.push(await E(blob).sha256());
  }
  // The dedupe-against-survivor blob.
  const twin = await E(host).storeBlob(
    makeReaderRef([sharedBytes]),
    'doomed-twin',
  );
  t.is(await E(twin).sha256(), sharedSha);

  // Drop every doomed name.  The shared hash should survive
  // because keepsake still references it.
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await E(host).remove(`distractor-${i}`);
  }
  await E(host).remove('doomed-twin');

  // All distractor hashes go.
  await waitForCondition(
    async () =>
      distractorShas.every(
        sha => !fs.existsSync(contentPathOf(config.statePath, sha)),
      ),
    { message: 'distractor blobs to be removed' },
  );

  // The shared hash is retained because keepsake survives.
  t.true(
    fs.existsSync(contentPathOf(config.statePath, sharedSha)),
    'shared hash retained while survivor still references it',
  );

  // Survivor still readable.
  const survivorAgain = await E(host).lookup(['keepsake']);
  t.is(await E(survivorAgain).text(), 'the-shared-content');
});

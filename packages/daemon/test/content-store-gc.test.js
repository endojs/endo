// @ts-nocheck
/* global process, setTimeout */

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { E, Far } from '@endo/far';
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

/**
 * Mirrors the helper in endo.test.js so configs from this file
 * cannot collide with endo.test.js configs even if both run in
 * the same process.
 *
 * @param {string} testTitle
 * @param {number} testConfigIndex
 */
const getConfigDirectoryName = (testTitle, testConfigIndex) => {
  const munged = testTitle.match(/\w+/gu)?.join('-') || '';
  if (!testNumbers.has(testTitle)) testNumbers.set(testTitle, testNumbers.size);
  const testNumber = testNumbers.get(testTitle);
  const nnnn = String(testNumber).padStart(4, '0');
  const letter = (testConfigIndex + 10).toString(36);
  return `csgc-${munged.slice(0, 18)}~${nnnn}${letter}`;
};

/**
 * @param {import('ava').ExecutionContext<any>} t
 */
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

/**
 * @param {ReturnType<makeConfig>} config
 * @param {Promise<void>} cancelled
 */
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

test('content-store blob is reclaimed when its only formula is collected', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  const readerRef = makeReaderRef([new TextEncoder().encode('blob-content')]);
  const blob = await E(host).storeBlob(readerRef, 'lonely-blob');
  const sha256 = await E(blob).sha256();

  const filePath = contentPathOf(config.statePath, sha256);
  t.true(fs.existsSync(filePath), 'blob file written to content store');

  await E(host).remove('lonely-blob');

  await waitForCondition(async () => !fs.existsSync(filePath), {
    message: `${filePath} to be removed`,
  });
  t.false(fs.existsSync(filePath), 'blob file pruned after formula collection');
});

test('content-store blob survives when a sibling formula still references the same hash', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  const bytes = new TextEncoder().encode('shared-content');

  const blobA = await E(host).storeBlob(makeReaderRef([bytes]), 'twin-a');
  const blobB = await E(host).storeBlob(makeReaderRef([bytes]), 'twin-b');

  const shaA = await E(blobA).sha256();
  const shaB = await E(blobB).sha256();
  t.is(shaA, shaB, 'both blobs dedupe to the same content hash');

  const filePath = contentPathOf(config.statePath, shaA);
  t.true(fs.existsSync(filePath), 'shared blob file present after both stores');

  await E(host).remove('twin-a');

  // Wait for the formula GC pass to settle.  We want to assert
  // that the content file does NOT disappear, so we give it a
  // moment to potentially do the wrong thing, then check.
  await new Promise(resolve => setTimeout(resolve, 200));

  t.true(
    fs.existsSync(filePath),
    'shared blob file retained while sibling formula survives',
  );

  // Verify the surviving sibling can still read the content.
  const survivor = await E(host).lookup(['twin-b']);
  const text = await E(survivor).text();
  t.is(text, 'shared-content');

  // Now collect the survivor too and verify the file is gone.
  await E(host).remove('twin-b');
  await waitForCondition(async () => !fs.existsSync(filePath), {
    message: `${filePath} to be removed after both formulas collected`,
  });
  t.false(fs.existsSync(filePath), 'shared blob pruned after last reference');
});

test('scratch-mount backing directory is reclaimed when its formula is collected', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  await E(host).provideScratchMount('throwaway-scratch');
  const scratch = await E(host).lookup(['throwaway-scratch']);
  await E(scratch).writeText(['draft.txt'], 'pending');

  const scratchId = await E(host).identify('throwaway-scratch');
  const { number: formulaNumber } = parseId(scratchId);
  const dirPath = mountPathOf(config.statePath, formulaNumber);
  t.true(fs.existsSync(dirPath), 'scratch backing dir created');

  await E(host).remove('throwaway-scratch');

  await waitForCondition(async () => !fs.existsSync(dirPath), {
    message: `${dirPath} to be removed`,
  });
  t.false(
    fs.existsSync(dirPath),
    'scratch backing dir pruned after formula collection',
  );
});

test('content-store blob from a readable-tree formula is reclaimed when the tree is collected', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  const remoteTree = Far('TestTree', {
    list: async () => ['only.txt'],
    lookup: async (/** @type {string} */ name) => {
      if (name !== 'only.txt') {
        throw new TypeError(`Unknown name: ${JSON.stringify(name)}`);
      }
      return Far('TestBlob', {
        streamBase64: () =>
          makeReaderRef([new TextEncoder().encode('tree-only-content')]),
      });
    },
    has: async (/** @type {string} */ name) => name === 'only.txt',
  });

  await E(host).storeTree(remoteTree, 'lonely-tree');
  const tree = await E(host).lookup(['lonely-tree']);
  const sha256 = await E(tree).sha256();

  const filePath = contentPathOf(config.statePath, sha256);
  t.true(fs.existsSync(filePath), 'tree root JSON written to content store');

  await E(host).remove('lonely-tree');

  await waitForCondition(async () => !fs.existsSync(filePath), {
    message: `${filePath} to be removed`,
  });
  t.false(
    fs.existsSync(filePath),
    'tree root JSON pruned after formula collection',
  );
});

/**
 * Construct a remote readable-tree Exo from a literal `{ name: bytes }`
 * map of blob children.  The tree only supports `list`, `lookup`, and
 * `has` of its own children; sub-trees are written as separate
 * `makeRemoteBlobTree` instances and passed via `subtrees`.
 *
 * @param {Record<string, Uint8Array>} blobs
 * @param {Record<string, unknown>} [subtrees]
 */
const makeRemoteBlobTree = (blobs, subtrees = {}) => {
  const blobNames = Object.keys(blobs);
  const subtreeNames = Object.keys(subtrees);
  const allNames = [...blobNames, ...subtreeNames].sort();
  return Far('TestTree', {
    list: async () => allNames,
    lookup: async (/** @type {string} */ name) => {
      if (Object.prototype.hasOwnProperty.call(blobs, name)) {
        const bytes = blobs[name];
        return Far('TestBlob', {
          streamBase64: () => makeReaderRef([bytes]),
        });
      }
      if (Object.prototype.hasOwnProperty.call(subtrees, name)) {
        return subtrees[name];
      }
      throw new TypeError(`Unknown name: ${JSON.stringify(name)}`);
    },
    has: async (/** @type {string} */ name) => allNames.includes(name),
  });
};

const storeDirEntries = statePath =>
  fs.readdirSync(path.join(statePath, 'store-sha256'));

test('readable-tree collection reclaims transitively-referenced child blob hashes', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  const remoteTree = makeRemoteBlobTree({
    'a.txt': new TextEncoder().encode('alpha-payload'),
    'b.txt': new TextEncoder().encode('beta-payload'),
  });

  await E(host).storeTree(remoteTree, 'leafy-tree');
  const tree = await E(host).lookup(['leafy-tree']);
  const rootSha256 = await E(tree).sha256();

  // Three distinct content-store entries should now exist: the tree
  // root JSON and one blob per leaf.  Capture them before collection
  // so the assertion can name the leaked candidates explicitly.
  const beforeEntries = storeDirEntries(config.statePath);
  t.true(
    beforeEntries.includes(rootSha256),
    'tree root JSON present before collection',
  );
  const leafHashesBefore = beforeEntries.filter(name => name !== rootSha256);
  t.is(
    leafHashesBefore.length,
    2,
    'two leaf blob hashes present before collection',
  );

  await E(host).remove('leafy-tree');

  await waitForCondition(
    async () => storeDirEntries(config.statePath).length === 0,
    {
      message: `content store to be empty (had ${beforeEntries.length} entries)`,
    },
  );
  const afterEntries = storeDirEntries(config.statePath);
  t.deepEqual(
    afterEntries,
    [],
    `transitive child blobs leaked: ${afterEntries.join(', ')}`,
  );
});

test('readable-tree collection preserves a child blob hash that a surviving readable-blob still references', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  const sharedBytes = new TextEncoder().encode('shared-leaf-payload');

  // Independently store the same bytes as a top-level readable-blob
  // and as a leaf inside a readable-tree.  checkinTree dedupes on
  // sha256, so both formulas reference the same content-store hash.
  const sharedBlob = await E(host).storeBlob(
    makeReaderRef([sharedBytes]),
    'shared-leaf-blob',
  );
  const sharedSha256 = await E(sharedBlob).sha256();

  const remoteTree = makeRemoteBlobTree({
    'shared.txt': sharedBytes,
    'unique.txt': new TextEncoder().encode('unique-to-tree'),
  });

  await E(host).storeTree(remoteTree, 'shared-leaf-tree');
  const tree = await E(host).lookup(['shared-leaf-tree']);
  const rootSha256 = await E(tree).sha256();

  const beforeEntries = storeDirEntries(config.statePath);
  t.true(
    beforeEntries.includes(rootSha256),
    'tree root JSON present before collection',
  );
  t.true(
    beforeEntries.includes(sharedSha256),
    'shared blob hash present before collection',
  );

  await E(host).remove('shared-leaf-tree');

  // The tree root JSON and the unique-to-tree leaf must be gone.
  // The shared leaf must remain because the readable-blob formula
  // still references it.
  await waitForCondition(
    async () => !fs.existsSync(contentPathOf(config.statePath, rootSha256)),
    { message: 'tree root JSON to be reclaimed' },
  );
  await waitForCondition(
    async () => storeDirEntries(config.statePath).length === 1,
    { message: 'content store to settle to a single shared entry' },
  );

  const afterEntries = storeDirEntries(config.statePath);
  t.deepEqual(
    afterEntries,
    [sharedSha256],
    'only the shared blob hash remains; tree-only entries reclaimed',
  );

  // Verify the surviving sibling can still read the content.
  const survivor = await E(host).lookup(['shared-leaf-blob']);
  const text = await E(survivor).text();
  t.is(text, 'shared-leaf-payload');
});

test('readable-tree collection walks nested subtrees and reclaims grandchild hashes', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  const innerTree = makeRemoteBlobTree({
    'grand.txt': new TextEncoder().encode('grandchild-payload'),
  });
  const outerTree = makeRemoteBlobTree(
    { 'top.txt': new TextEncoder().encode('top-payload') },
    { sub: innerTree },
  );

  await E(host).storeTree(outerTree, 'nested-tree');
  const tree = await E(host).lookup(['nested-tree']);
  const rootSha256 = await E(tree).sha256();

  // Expect four distinct entries: outer tree JSON, inner tree JSON,
  // top.txt blob, grand.txt blob.
  const beforeEntries = storeDirEntries(config.statePath);
  t.true(
    beforeEntries.includes(rootSha256),
    'outer tree root JSON present before collection',
  );
  t.is(
    beforeEntries.length,
    4,
    'four entries (outer JSON, inner JSON, two leaf blobs) before collection',
  );

  await E(host).remove('nested-tree');

  await waitForCondition(
    async () => storeDirEntries(config.statePath).length === 0,
    {
      message: `content store to be empty (had ${beforeEntries.length} entries)`,
    },
  );
  const afterEntries = storeDirEntries(config.statePath);
  t.deepEqual(
    afterEntries,
    [],
    `transitive nested-tree hashes leaked: ${afterEntries.join(', ')}`,
  );
});

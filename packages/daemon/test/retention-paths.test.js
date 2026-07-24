// @ts-nocheck

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import { start, stop, purge, makeEndoClient } from '../index.js';

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

const raw = String.raw;

/** @type {Map<string, number>} */
const testNumbers = new Map();

const getConfigDirectoryName = (testTitle, testConfigIndex) => {
  const munged = testTitle.match(/\w+/gu)?.join('-') || '';
  if (!testNumbers.has(testTitle)) testNumbers.set(testTitle, testNumbers.size);
  const testNumber = testNumbers.get(testTitle);
  const nnnn = String(testNumber).padStart(4, '0');
  const letter = (testConfigIndex + 10).toString(36);
  const configSubDirectory = `${munged.slice(0, 24)}~${nnnn}${letter}`;
  return configSubDirectory;
};

const makeConfig = (...root) => ({
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
});

const prepareConfig = async (t, { gcEnabled = true } = {}) => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  cancelled.catch(() => {});
  const config = {
    ...makeConfig('tmp', getConfigDirectoryName(t.title, t.context.length)),
    gcEnabled,
  };
  await purge(config);
  await start(config);
  const ctxObj = { cancel, cancelled, config };
  t.context.push(ctxObj);
  return { ...ctxObj };
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
    cancel(Error('teardown'));
  }
});

test.serial('listRetentionPaths returns empty for unknown locator', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);

  // Synthesize a syntactically valid locator that does not name a
  // formula in this daemon. The host should resolve it through the
  // graph and return an empty array (no paths reach an unknown id).
  const knownLocator = await E(host).locate('@self');
  t.truthy(knownLocator);
  const url2 = new URL(knownLocator);
  // Swap in a deterministic, definitely-not-allocated formula number.
  url2.pathname = `/${'0'.repeat(64)}`;
  const bogusLocator = url2.toString();
  const paths = await E(host).listRetentionPaths(bogusLocator);
  t.deepEqual(paths, []);
});

test.serial(
  'listRetentionPaths surfaces a pet-name path for a stored value',
  async t => {
    const { cancelled, config } = await prepareConfig(t);
    const { host } = await makeHost(config, cancelled);

    // Store a passable value under a pet name; this writes a
    // pet-store edge from @self's pet store to the marshal formula
    // that holds the value.
    await E(host).storeValue('marker-value', 'marker');
    const markerLocator = await E(host).locate('marker');
    t.truthy(markerLocator);

    const paths = await E(host).listRetentionPaths(markerLocator);
    t.assert(
      Array.isArray(paths) && paths.length > 0,
      'a stored value must have at least one retention path',
    );

    // At least one path must contain a pet:marker label, the load-
    // bearing assertion that label normalization runs and that the
    // pet-store edge resolved to its actual pet name.
    const allLabels = paths.flatMap(p => p.flatMap(seg => seg.labels ?? []));
    t.true(
      allLabels.includes('pet:marker'),
      `pet:marker label expected among ${JSON.stringify(allLabels)}`,
    );

    // Every path terminates at a root segment.
    for (const p of paths) {
      const top = p[p.length - 1];
      t.is(top.type, 'root', 'each path must terminate at a GC root');
    }
  },
);

test.serial(
  'listRetentionPaths surfaces internal field-edge labels too',
  async t => {
    const { cancelled, config } = await prepareConfig(t);
    const { host } = await makeHost(config, cancelled);

    // The host's own worker is reachable via an internal "mainWorker"
    // or similar field edge from the host formula, not via a pet
    // name. The label should pass through as the field name.
    await E(host).provideWorker(['probe-worker']);
    const workerLocator = await E(host).locate('probe-worker');
    t.truthy(workerLocator);
    const paths = await E(host).listRetentionPaths(workerLocator);
    t.assert(Array.isArray(paths) && paths.length > 0);
    const allLabels = paths.flatMap(p => p.flatMap(seg => seg.labels ?? []));
    // The worker pet name should surface as a pet: label.
    t.true(
      allLabels.includes('pet:probe-worker'),
      `pet:probe-worker label expected among ${JSON.stringify(allLabels)}`,
    );
  },
);

test.serial(
  'listRetentionPaths returns multiple paths for a value bound under multiple pet names',
  async t => {
    const { cancelled, config } = await prepareConfig(t);
    const { host } = await makeHost(config, cancelled);

    // Store the value once, then `copy` to a second pet name in
    // the same store. Both names refer to the same marshal
    // formula, so its retention-path set must include `pet:` edges
    // for each.
    await E(host).storeValue('shared-value', 'first-name');
    await E(host).copy(['first-name'], ['second-name']);
    const locator = await E(host).locate('first-name');
    t.truthy(locator);

    const paths = await E(host).listRetentionPaths(locator);
    t.assert(Array.isArray(paths));
    const allLabels = paths.flatMap(p => p.flatMap(seg => seg.labels ?? []));
    t.true(
      allLabels.includes('pet:first-name'),
      `pet:first-name expected in ${JSON.stringify(allLabels)}`,
    );
    t.true(
      allLabels.includes('pet:second-name'),
      `pet:second-name expected in ${JSON.stringify(allLabels)}`,
    );
  },
);

// @ts-check

// Use the ses-ava test wrapper so that a failing assertion surfaces the
// unredacted error info (stack, cause chain, hidden notes) through the
// SES causal-console hook. `@endo/ses-ava/prepare-endo.js` already
// performs the perimeter init internally.
// eslint-disable-next-line import/order
import test from '@endo/ses-ava/prepare-endo.js';
import url from 'url';
import path from 'path';
import crypto from 'crypto';
import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';

import { start, stop, purge, makeEndoClient } from '../index.js';
import { makeCryptoPowers } from '../src/manager-node-powers.js';

const cryptoPowers = makeCryptoPowers(crypto);

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

let configPathId = 0;
const MAX_UNIX_SOCKET_PATH = 90;
const SOCKET_PATH_OVERHEAD =
  path.join(dirname, 'tmp').length + 1 + 'endo.sock'.length + 8;
const MAX_CONFIG_DIR_LENGTH = Math.max(
  8,
  MAX_UNIX_SOCKET_PATH - SOCKET_PATH_OVERHEAD,
);

/**
 * @param {string} testTitle
 * @param {number} configNumber
 */
const getConfigDirectoryName = (testTitle, configNumber) => {
  const defaultPath = testTitle.replace(/\s/giu, '-').replace(/[^\w-]/giu, '');
  const basePath =
    defaultPath.length <= MAX_CONFIG_DIR_LENGTH
      ? defaultPath
      : defaultPath.slice(0, MAX_CONFIG_DIR_LENGTH);
  const testId = String(configPathId).padStart(4, '0');
  const configId = String(configNumber).padStart(2, '0');
  const configSubDirectory = `${basePath}#${testId}-${configId}`;
  configPathId += 1;
  return configSubDirectory;
};

const { raw } = String;

/**
 * Mirrors endo.test.js's makeConfig.
 * @param {Array<string>} root
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
    cryptoPowers,
  };
};

const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  cancelled.catch(() => {});
  const ctxList = /** @type {any[]} */ (t.context);
  const config = {
    ...makeConfig('tmp', getConfigDirectoryName(t.title, ctxList.length)),
    gcEnabled: false,
  };
  await purge(config);
  await start(config);
  const ctx = { cancel, cancelled, config };
  ctxList.push(ctx);
  return { ...ctx };
};

const makeHost = async (config, cancelled) => {
  /** @type {WeakMap<Error, string>} */
  const inboundErrorIds = new WeakMap();
  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
    undefined,
    {
      /** @param {Error} err @param {string} [errorId] */
      marshalLoadError: (err, errorId) => {
        if (errorId !== undefined) inboundErrorIds.set(err, errorId);
      },
    },
  );
  closed.catch(() => {});
  const bootstrap = getBootstrap();
  /** @param {Error} err */
  const getErrorId = err => inboundErrorIds.get(err);
  return { host: E(bootstrap).host(), getErrorId };
};

test.beforeEach(t => {
  t.context = [];
});

test.afterEach.always(async t => {
  const ctxList = /** @type {Array<{ cancel: (e: Error) => void,
   *                                  cancelled: Promise<unknown>,
   *                                  config: any }>} */ (t.context);
  for (const { config } of ctxList) {
    // eslint-disable-next-line no-await-in-loop
    await stop(config).catch(() => {});
  }
  for (const { cancel, cancelled } of ctxList) {
    cancelled.catch(() => {});
    cancel(Error('teardown'));
  }
});

test.serial('host exposes a traces facet', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  const traces = await E(E(host).diagnostics()).traces();
  const stats = await E(traces).stats();
  t.is(typeof stats.workers, 'number');
  t.is(typeof stats.totalRecords, 'number');
});

test.serial('evaluate rejection produces a worker trace record', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host, getErrorId } = await makeHost(config, cancelled);

  // Force a rejection inside a worker.
  const rejection = await t.throwsAsync(
    E(host).evaluate('@main', 'throw new Error("boom-from-eval")', [], []),
  );
  t.truthy(rejection);
  const errorId = getErrorId(/** @type {Error} */ (rejection));
  t.truthy(errorId, 'expected the rejection to carry a wire-level errorId');

  // The trace should be reachable through the host's traces facet via
  // the same id the CLI sees on the wire.
  const traces = await E(E(host).diagnostics()).traces();
  const report = await E(traces).lookup(errorId);
  t.truthy(report, `expected a trace report for ${errorId}`);
  /** @type {import('../src/trace-aggregator.js').TraceReport} */
  const r = report;
  t.regex(r.message, /boom-from-eval/);
  // The aggregate must have stamped the worker's authoritative
  // (formula-id) workerId, not the empty placeholder the worker sent.
  t.true(typeof r.workerId === 'string' && r.workerId.length > 0);
  t.is(r.site, 'marshal');
  // Lookup is timely: the very first call after observing the error
  // returns a populated record (no retry needed). This is the
  // "synchronization for CLI timeliness" invariant from the design.
  t.is(r.partial, false);
});

test.serial('@daemon stub records cover daemon-internal errors', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host, getErrorId } = await makeHost(config, cancelled);
  // Look up a name that does not exist; this rejection originates in
  // the daemon, not in any worker, so the trace facet should record a
  // stub under the @daemon synthetic worker.
  const rejection = await t.throwsAsync(E(host).lookup('does-not-exist'));
  t.truthy(rejection);
  const errorId = getErrorId(/** @type {Error} */ (rejection));
  if (errorId === undefined) {
    // If marshal didn't tag, the alias path is unreachable; the test
    // still verifies the @daemon stub can be located via recent().
    const traces = await E(E(host).diagnostics()).traces();
    const list = await E(traces).recent({ limit: 5 });
    t.true(list.some(r => r.workerId === '@daemon'));
    return;
  }
  const traces = await E(E(host).diagnostics()).traces();
  const report = await E(traces).lookup(errorId);
  t.truthy(report, `expected a daemon stub trace for ${errorId}`);
  t.is(report.workerId, '@daemon');
});

test.serial('recent() lists multiple worker emissions', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  for (const message of ['first', 'second', 'third']) {
    // eslint-disable-next-line no-await-in-loop
    await t
      .throwsAsync(
        E(host).evaluate(
          '@main',
          `throw new Error(${JSON.stringify(message)})`,
          [],
          [],
        ),
      )
      .catch(() => {});
  }
  const traces = await E(E(host).diagnostics()).traces();
  /** @type {import('../src/trace-aggregator.js').TraceReport[]} */
  const list = await E(traces).recent({ limit: 10 });
  t.true(Array.isArray(list) && list.length >= 3);
  const messages = list.map(r => r.message);
  t.true(messages.some(m => /first/.test(m)));
  t.true(messages.some(m => /second/.test(m)));
  t.true(messages.some(m => /third/.test(m)));
});

test.serial('clear() drops all aggregated records', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  await t
    .throwsAsync(E(host).evaluate('@main', 'throw new Error("zap")', [], []))
    .catch(() => {});
  const traces = await E(E(host).diagnostics()).traces();
  /** @type {{ workers: number, totalRecords: number, bytes: number,
   *           aliases: number }} */
  const before = await E(traces).stats();
  t.true(typeof before.totalRecords === 'number' && before.totalRecords >= 1);
  await E(traces).clear();
  const after = await E(traces).stats();
  t.is(after.totalRecords, 0);
  t.is(after.workers, 0);
});

test.serial('lookup of unknown errorId returns undefined', async t => {
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  const traces = await E(E(host).diagnostics()).traces();
  const result = await E(traces).lookup('error:nope#999');
  t.is(result, undefined);
});

test.serial(
  'two workers minting the same numbered errorId do not collide',
  async t => {
    const { cancelled, config } = await prepareConfig(t);
    const { host } = await makeHost(config, cancelled);
    await E(host).provideWorker(['wA']);
    await E(host).provideWorker(['wB']);
    await t
      .throwsAsync(E(host).evaluate('wA', 'throw new Error("from-A")', [], []))
      .catch(() => {});
    await t
      .throwsAsync(E(host).evaluate('wB', 'throw new Error("from-B")', [], []))
      .catch(() => {});
    const traces = await E(E(host).diagnostics()).traces();
    const recent = await E(traces).recent({ limit: 16 });
    const fromA = recent.find(r => /from-A/.test(r.message));
    const fromB = recent.find(r => /from-B/.test(r.message));
    t.truthy(fromA);
    t.truthy(fromB);
    t.not(fromA.workerId, fromB.workerId);
  },
);

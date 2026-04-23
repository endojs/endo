// @ts-check
/* global process, setTimeout */

/**
 * Integration test for the `@self` boot path introduced by TODO/10/11/12.
 *
 * The new genie launcher is a single `makeUnconfined('@main', main.js,
 * { powersName: '@agent', resultName: 'main-genie', env: { ... } })`
 * call.  This test verifies that:
 *
 *   1. Running the new boot under a real Endo daemon populates
 *      `main-genie` on the host's pet name hub (i.e. setup.js's
 *      `has('main-genie')` guard will short-circuit on re-run).
 *   2. The worker logs `agent ready`, confirming `runRootAgent` reached
 *      the end of its setup (workspace init, agent pack construction,
 *      heartbeat ticker — all before the message loop can serve
 *      anything).
 *   3. A message sent to `@self` from a separate guest identity reaches
 *      the genie's `processMessage` dispatcher — the self-filter does
 *      not skip it, and the worker log records `Processing message #…`.
 *   4. A daemon restart reincarnates the worker without re-running
 *      `setup.js` (TODO/10 § 3e risk 4) — `has('main-genie')` stays
 *      true and the reincarnated worker logs `agent ready` a second
 *      time.
 *
 * These tests fork a full daemon each; they must run serially to avoid
 * resource contention (see `packages/daemon/test/gateway.test.js` and
 * the project-level CLAUDE.md note).
 *
 * The genie is configured with `GENIE_MODEL=ollama/self-boot-stub`.
 * `buildOllamaModel` is lazy — no network I/O fires until a model
 * round is actually invoked — so the stub value is enough to drive the
 * boot path without depending on a live Ollama server.
 *
 * `GENIE_HEARTBEAT_PERIOD=0` disables the heartbeat so no scheduled
 * timer keeps the worker alive after the test assertions complete.
 */

// Establish a perimeter: SES lockdown must run before we import
// `@endo/daemon` (CapTP, the host-side Endo runtime, and the test
// harness all assume `harden` / frozen primordials are available).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import fs from 'fs';
import path from 'path';
import url from 'url';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import {
  makeEndoClient,
  purge,
  restart,
  start,
  stop,
} from '@endo/daemon';

/** @import { Config } from '@endo/daemon' */

// ---------------------------------------------------------------------------
// Test harness (mirrors the daemon test suite: per-test config,
// serial-only, afterEach shuts the daemon down even on failure).
// ---------------------------------------------------------------------------

const { raw } = String;
const packageDir = url.fileURLToPath(new URL('../..', import.meta.url));
const mainSpecifier = new URL('../../main.js', import.meta.url).href;

/**
 * @typedef {{
 *   statePath: string,
 *   ephemeralStatePath: string,
 *   cachePath: string,
 *   sockPath: string,
 *   address: string,
 *   pets: Map<string, never>,
 *   values: Map<string, never>,
 * }} TestConfig
 */

/**
 * @param {string[]} root
 * @returns {TestConfig}
 */
const makeConfig = (...root) => {
  return {
    statePath: path.join(packageDir, ...root, 'state'),
    ephemeralStatePath: path.join(packageDir, ...root, 'run'),
    cachePath: path.join(packageDir, ...root, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
        : path.join(packageDir, ...root, 'endo.sock'),
    address: '127.0.0.1:0',
    pets: new Map(),
    values: new Map(),
  };
};

let configPathId = 0;
const MAX_UNIX_SOCKET_PATH = 90;
const SOCKET_PATH_OVERHEAD =
  path.join(packageDir, 'tmp').length + 1 + 'endo.sock'.length + 8;
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
  configPathId += 1;
  return `${basePath}#${testId}-${configId}`;
};

/**
 * @param {import('ava').ExecutionContext<any>} t
 */
const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  // Sink the rejection so SES does not treat the teardown rejection as
  // unhandled.  Consumers of `cancelled` attach their own catch.
  cancelled.catch(() => {});
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
 * @param {TestConfig} config
 * @param {Promise<void>} cancelled
 */
const makeHost = async (config, cancelled) => {
  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  // Sink the closed-promise rejection; teardown-induced CapTP close
  // would otherwise surface as unhandledRejection.
  closed.catch(() => {});
  const bootstrap = getBootstrap();
  return { host: E(bootstrap).host() };
};

/**
 * @param {import('ava').ExecutionContext<any>} t
 */
const prepareHost = async t => {
  const { cancel, cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  return { cancel, cancelled, config, host };
};

/**
 * Concatenate every `worker.log` file under `<state>/worker/<hash>/`.
 * After a daemon restart the reincarnated worker may live in a fresh
 * subdirectory, so the test polls the union of all logs.
 *
 * @param {TestConfig} config
 * @returns {Promise<string>}
 */
const readAllWorkerLogs = async config => {
  await null;
  const workerDir = path.join(config.statePath, 'worker');
  /** @type {string[]} */
  let entries;
  try {
    entries = await fs.promises.readdir(workerDir);
  } catch {
    return '';
  }
  const contents = await Promise.all(
    entries.map(entry =>
      fs.promises
        .readFile(path.join(workerDir, entry, 'worker.log'), 'utf-8')
        .catch(() => ''),
    ),
  );
  return contents.join('\n');
};

/**
 * Poll the union of worker logs until `matcher` matches or the timeout
 * expires.  Used for assertions on side effects that only surface in
 * the worker-side console (e.g. `[genie:main-genie] agent ready`).
 *
 * @param {TestConfig} config
 * @param {RegExp | string} matcher
 * @param {{ timeoutMs?: number, intervalMs?: number }} [opts]
 */
const waitForWorkerText = async (config, matcher, opts = {}) => {
  await null;
  const { timeoutMs = 30000, intervalMs = 100 } = opts;
  const startTime = Date.now();
  const matches = text =>
    matcher instanceof RegExp ? matcher.test(text) : text.includes(matcher);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const text = await readAllWorkerLogs(config);
    if (matches(text)) {
      return text;
    }
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(
        `Timed out waiting for ${String(matcher)} in ${path.join(config.statePath, 'worker')}`,
      );
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
};

/**
 * Count occurrences of `pattern` across the worker logs — used to
 * distinguish the pre-restart and post-restart `agent ready` lines in
 * the survival test.
 *
 * @param {TestConfig} config
 * @param {RegExp} pattern
 */
const countWorkerLogMatches = async (config, pattern) => {
  const text = await readAllWorkerLogs(config);
  const matches = text.match(new RegExp(pattern.source, `${pattern.flags}g`));
  return matches ? matches.length : 0;
};

/**
 * Poll until at least `minCount` occurrences of `pattern` appear across
 * all worker logs.
 *
 * @param {TestConfig} config
 * @param {RegExp} pattern
 * @param {number} minCount
 * @param {{ timeoutMs?: number, intervalMs?: number }} [opts]
 */
const waitForWorkerLogCount = async (config, pattern, minCount, opts = {}) => {
  await null;
  const { timeoutMs = 30000, intervalMs = 100 } = opts;
  const startTime = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const count = await countWorkerLogMatches(config, pattern);
    if (count >= minCount) {
      return count;
    }
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(
        `Timed out waiting for ${minCount}× ${pattern} (saw ${count})`,
      );
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
};

/**
 * Spawn the genie root agent under `hostAgent` using the same shape
 * `setup.js` uses.  Returns once `makeUnconfined` resolves — the
 * message loop itself keeps running fire-and-forget inside the worker.
 *
 * @param {any} hostAgent - FarRef to an EndoHost
 * @param {string} workspaceDir
 */
const spawnRootGenie = async (hostAgent, workspaceDir) => {
  await E(hostAgent).makeUnconfined('@main', mainSpecifier, {
    powersName: '@agent',
    resultName: 'main-genie',
    env: {
      GENIE_MODEL: 'ollama/self-boot-stub',
      GENIE_WORKSPACE: workspaceDir,
      // Disable the heartbeat scheduler — otherwise the worker keeps a
      // timer pinned that would block test teardown on slower machines.
      GENIE_HEARTBEAT_PERIOD: '0',
    },
  });
};

/**
 * Spawn the genie root agent without a `GENIE_MODEL` env var — the
 * boot-mode resolution in `main.js` should fall through to primordial
 * mode (TODO/92 § 1c) instead of throwing.
 *
 * @param {any} hostAgent
 * @param {string} workspaceDir
 */
const spawnPrimordialGenie = async (hostAgent, workspaceDir) => {
  await E(hostAgent).makeUnconfined('@main', mainSpecifier, {
    powersName: '@agent',
    resultName: 'main-genie',
    env: {
      GENIE_WORKSPACE: workspaceDir,
      // No GENIE_MODEL — exercises the env→persisted→primordial
      // precedence.  Heartbeat is irrelevant here (primordial mode
      // skips the ticker entirely) but we still set it to 0 for
      // symmetry with the piAgent case.
      GENIE_HEARTBEAT_PERIOD: '0',
    },
  });
};

test.beforeEach(t => {
  t.context = [];
});

test.afterEach.always(async t => {
  // Stop daemons first so CapTP teardown happens before we reject the
  // client-cancel promises (mirrors the ordering used by daemon tests
  // to avoid unhandled-rejection races).
  const configs =
    /** @type {Array<{cancel: Function, cancelled: Promise<void>, config: TestConfig}>} */ (
      t.context
    );
  await Promise.allSettled(configs.map(({ config }) => stop(config)));
  for (const { cancel, cancelled } of configs) {
    cancelled.catch(() => {});
    cancel(Error('teardown'));
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.serial(
  'genie boots as the daemon root agent via setup.js shape',
  async t => {
    const { config, host } = await prepareHost(t);

    const workspaceDir = path.join(config.statePath, 'genie-workspace');
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    await spawnRootGenie(host, workspaceDir);

    // setup.js relies on `has('main-genie')` to short-circuit a re-run.
    // Fail loudly if the `resultName` plumbing regresses.
    t.true(
      await E(host).has('main-genie'),
      'main-genie pet name must exist after makeUnconfined',
    );

    // Confirm the worker reached `runRootAgent` (workspace init, agent
    // pack, heartbeat ticker — all prerequisites for the message loop).
    await waitForWorkerText(config, /\[genie:main-genie\] agent ready/u);

    // Send a message from a separate guest identity so main.js's
    // self-filter (`message.from === selfId`) does not skip it.  This
    // exercises the core "@self receives messages directly" guarantee
    // of TODO/10 — no `main-genie` guest bounce, no form submission.
    const guest = await E(host).provideGuest('sender');
    await E(guest).send('@host', ['hello self-boot genie'], [], []);

    // `processMessage` logs the `[genie] Processing message #…` line
    // as its first side effect, before any piAgent dispatch — so this
    // assertion only requires that the message reached the handler,
    // not that the (stubbed) model actually responded.
    await waitForWorkerText(config, /\[genie\] Processing message #/u);

    t.pass();
  },
);

test.serial(
  'main-genie survives a daemon restart without re-running setup.js',
  async t => {
    const { cancelled, config, host } = await prepareHost(t);

    const workspaceDir = path.join(config.statePath, 'genie-workspace');
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    await spawnRootGenie(host, workspaceDir);

    const readyPattern = /\[genie:main-genie\] agent ready/u;
    await waitForWorkerLogCount(config, readyPattern, 1);

    // Stop + restart the daemon.  Because `main-genie`'s formula is
    // persisted under `resultName`, the worker must be reincarnated by
    // the daemon's own startup logic — we do not call spawnRootGenie
    // again.
    await stop(config);
    await restart(config);

    const { host: host2 } = await makeHost(config, cancelled);

    t.true(
      await E(host2).has('main-genie'),
      'main-genie survives a daemon restart',
    );

    // `has` only consults the pet store.  Force materialisation of the
    // persisted formula via `lookup`, which re-runs the stored
    // `makeUnconfined` recipe in a fresh worker and therefore invokes
    // `make()` → `runRootAgent` a second time.  This mirrors the
    // reincarnation path described in `packages/genie/CLAUDE.md`
    // ("A daemon restart reincarnates `main-genie` from its persisted
    // formula without re-running `setup.js`").
    await E(host2).lookup('main-genie');

    // A fresh `agent ready` line proves the reincarnated worker made
    // it back through `runRootAgent`, not just that the pet name
    // survived in the store.
    await waitForWorkerLogCount(config, readyPattern, 2);

    t.pass();
  },
);

test.serial(
  'genie boots primordial when GENIE_MODEL absent',
  async t => {
    const { config, host } = await prepareHost(t);

    const workspaceDir = path.join(config.statePath, 'genie-workspace');
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    // With no `GENIE_MODEL` (and no persisted config — `loadConfig`
    // is a stub until sub-task 96), `make()` must fall through to
    // primordial mode rather than throwing.  The pet name still
    // lands, confirming the worker reached `makeExo` without a
    // synchronous boot failure.
    await spawnPrimordialGenie(host, workspaceDir);

    t.true(
      await E(host).has('main-genie'),
      'main-genie pet name must exist even in primordial mode',
    );

    // The primordial banner is emitted from the primordial branch in
    // `runRootAgent` before the stub loop starts — waiting for it
    // proves the mode switch fired.
    await waitForWorkerText(
      config,
      /\[genie:main-genie\] primordial mode/u,
    );

    // The piAgent "agent ready" banner is only emitted at the end of
    // the piAgent branch.  Under primordial mode we skip that whole
    // branch, so it must never appear — the post-banner snapshot of
    // the worker log should still be free of it.
    const text = await readAllWorkerLogs(config);
    t.false(
      /\[genie:main-genie\] agent ready/u.test(text),
      'primordial boot must not reach the piAgent `agent ready` banner',
    );

    t.pass();
  },
);

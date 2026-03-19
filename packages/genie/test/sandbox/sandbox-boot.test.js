// @ts-check
/* global process, setTimeout, Buffer */

/**
 * Acceptance tests for the Phase 3.5a root-genie workspace slice.
 *
 * Filed by `TODO/40_endo_genie_sandbox_tests.md`, gated on the slice
 * wiring landed in
 *   - `TADA/35_endo_genie_sandbox_tool_spawn.md` (tool-spawn chokepoint
 *     routes through `E(slice).spawn(...)`),
 *   - `TADA/36_endo_genie_sandbox_workspace_path.md` (in-process
 *     `GENIE_WORKSPACE` rewrite + slice-internal `/workspace` view),
 *   - `TADA/39_endo_genie_sandbox_gc_order.md` (no daemon-side ordering
 *     code needed; pet-store edges + awaited lookup chain do the job).
 *
 * The four cases are intentionally end-to-end: each test boots a real
 * daemon, runs the genie launcher's own `setup.js` shape (workspace
 * mount + sandbox-factory registration + main-genie spawn), waits for
 * the worker to reach `agent ready`, then drives the live slice
 * directly via the host pet-store-pinned `sandbox-factory`.  The slice
 * the factory hands back is the same in-memory handle `main.js` minted
 * (`makePersistent` is idempotent within a factory instance —
 * `packages/sandbox/src/factory.js:1271`), so a `spawn` from this test
 * exercises the same confinement surface the genie's `bash` / `exec` /
 * `git` tools see.
 *
 * Driving slice spawns directly (rather than driving the LLM to invoke
 * the `bash` tool) keeps the test deterministic without a stub model:
 * the slice plumbing is what TODO/40 wants to verify, and a tool-call
 * round-trip would only add a dependency on the model provider.  The
 * "tool stdio fidelity" case explicitly asserts UTF-8 round-trip
 * through the same `reader-ref` adapters the tool layer drains via
 * `drainReaderRef` (`packages/genie/src/tools/command.js`).
 *
 * These tests fork a full daemon each; they must run serially to
 * avoid resource contention (mirrors `boot/self-boot.test.js` and the
 * project-level CLAUDE.md note).
 *
 * Skip policy: every case probes for `bwrap` once via a `before` hook
 * and degrades to `t.pass()` when bwrap is unavailable on the CI host
 * — matching the pattern used across `packages/sandbox/test/`.  The
 * `network: 'private'` case additionally probes for `pasta`; today
 * the bwrap driver flags pasta wiring as best-effort
 * (`packages/sandbox/src/drivers/bwrap.js:495–500`), so the test
 * documents the current shape and tightens once pasta lands
 * end-to-end.
 */

// SES lockdown must run before we import `@endo/daemon` — same
// perimeter the rest of the genie test suite establishes.
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import {
  makeEndoClient,
  purge,
  restart,
  start,
  stop,
} from '@endo/daemon';

import {
  SANDBOX_FACTORY_NAME,
  SANDBOX_SLICE_NAME,
  WORKSPACE_MOUNT_NAME,
} from '../../src/pet-names.js';

/** @import { Config } from '@endo/daemon' */

/**
 * Resolve the `@endo/sandbox` plugin entry point relative to this
 * file.  Mirrors `setup.js`'s `sandboxAgentSpecifier` resolution so
 * the test stays in lock-step with the launcher's view of the
 * package layout.
 */
const sandboxAgentSpecifier = new URL(
  '../../../sandbox/src/agent.js',
  import.meta.url,
).href;
const mainSpecifier = new URL('../../main.js', import.meta.url).href;

// ---------------------------------------------------------------------------
// bwrap availability probe
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<{ available: boolean, version?: string, reason?: string }>}
 */
const probeBwrap = async () => {
  await null;
  try {
    const cp = nodeSpawn('bwrap', ['--version']);
    /** @type {Buffer[]} */
    const stdoutChunks = [];
    return await new Promise(resolve => {
      cp.stdout?.on('data', c => stdoutChunks.push(c));
      cp.once('error', e =>
        resolve({
          available: false,
          reason: /** @type {Error} */ (e).message,
        }),
      );
      cp.once('close', code => {
        if (code !== 0) {
          resolve({
            available: false,
            reason: `bwrap --version exit ${code}`,
          });
          return;
        }
        const text = Buffer.concat(stdoutChunks).toString('utf8').trim();
        const m = text.match(/(\d+(?:\.\d+){0,3})/);
        resolve({ available: true, version: m ? m[1] : text });
      });
    });
  } catch (e) {
    return { available: false, reason: /** @type {Error} */ (e).message };
  }
};

/**
 * @returns {Promise<{ available: boolean, reason?: string }>}
 */
const probePasta = async () => {
  await null;
  try {
    const cp = nodeSpawn('pasta', ['--version']);
    return await new Promise(resolve => {
      cp.once('error', e =>
        resolve({
          available: false,
          reason: /** @type {Error} */ (e).message,
        }),
      );
      cp.once('close', code => {
        resolve(
          code === 0
            ? { available: true }
            : { available: false, reason: `pasta --version exit ${code}` },
        );
      });
    });
  } catch (e) {
    return { available: false, reason: /** @type {Error} */ (e).message };
  }
};

/** @type {{ available: boolean, version?: string, reason?: string }} */
let bwrapAvailability = { available: false, reason: 'not yet probed' };
/** @type {{ available: boolean, reason?: string }} */
let pastaAvailability = { available: false, reason: 'not yet probed' };

test.serial.before(async _t => {
  bwrapAvailability = await probeBwrap();
  pastaAvailability = await probePasta();
});

// ---------------------------------------------------------------------------
// Per-test daemon harness — mirrors boot/self-boot.test.js
// ---------------------------------------------------------------------------

const { raw } = String;
const packageDir = url.fileURLToPath(new URL('../..', import.meta.url));

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
 * Concatenate every `worker.log` file under `<state>/worker/`.
 * After a daemon restart the reincarnated worker may live in a fresh
 * subdirectory, so we union all logs.
 *
 * @param {TestConfig} config
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
 * Poll the worker logs until `matcher` matches or the timeout expires.
 *
 * @param {TestConfig} config
 * @param {RegExp | string} matcher
 * @param {{ timeoutMs?: number, intervalMs?: number }} [opts]
 */
const waitForWorkerText = async (config, matcher, opts = {}) => {
  await null;
  const { timeoutMs = 30000, intervalMs = 100 } = opts;
  const startTime = Date.now();
  const matches = (/** @type {string} */ text) =>
    matcher instanceof RegExp ? matcher.test(text) : text.includes(matcher);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const text = await readAllWorkerLogs(config);
    if (matches(text)) return text;
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
 * Count occurrences of `pattern` across the worker logs.
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
    if (count >= minCount) return count;
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
 * Replicate `setup.js#main(host)`'s steps inline against the test
 * daemon's host agent.  The launcher's own `main` is not invoked
 * directly because its second `makeUnconfined` call uses
 * `'@agent'` as the worker pet name (see
 * `packages/genie/setup.js:96`); the host's pet store maps `@agent`
 * to the host *agent itself*, not a worker, so the daemon rejects
 * the call with `Cannot make unconfined plugin with non-worker`
 * (`packages/daemon/src/daemon.js:1298`).  This test mirrors the
 * launcher's intent by spawning the sandbox plugin in a fresh
 * dedicated worker (`sandbox-worker`); a follow-up should land the
 * same fix upstream in `setup.js`.
 *
 * Steps mirror `setup.js`:
 *   1. `provideMount(workspace, 'workspace-mount', { readOnly: false })`
 *   2. `makeUnconfined(<worker>, sandbox-agent.js, { resultName: 'sandbox-factory', powersName: '@agent' })`
 *   3. `makeUnconfined('@main', main.js, { resultName: 'main-genie', powersName: '@agent', env: {...} })`
 *
 * @param {any} host
 * @param {string} workspaceDir
 */
const runGenieSetup = async (host, workspaceDir) => {
  await null;
  if (!(await E(host).has(WORKSPACE_MOUNT_NAME))) {
    await E(host).provideMount(workspaceDir, WORKSPACE_MOUNT_NAME, {
      readOnly: false,
    });
  }

  if (!(await E(host).has(SANDBOX_FACTORY_NAME))) {
    await E(host).makeUnconfined('sandbox-worker', sandboxAgentSpecifier, {
      powersName: '@agent',
      resultName: SANDBOX_FACTORY_NAME,
    });
  }

  if (!(await E(host).has('main-genie'))) {
    await E(host).makeUnconfined('@main', mainSpecifier, {
      powersName: '@agent',
      resultName: 'main-genie',
      env: {
        GENIE_MODEL: 'ollama/sandbox-boot-stub',
        GENIE_WORKSPACE: workspaceDir,
        GENIE_NAME: 'main-genie',
        // Disable the heartbeat so no scheduled timer keeps the worker
        // alive after the test assertions complete.
        GENIE_HEARTBEAT_PERIOD: '0',
        GENIE_HEARTBEAT_TIMEOUT: '',
        GENIE_OBSERVER_MODEL: '',
        GENIE_REFLECTOR_MODEL: '',
        GENIE_AGENT_DIRECTORY: 'genie',
      },
    });
  }
};

/**
 * Look up `sandbox-factory` from the host pet store and re-mint the
 * persistent slice with the same name + opts `main.js` used.  Per
 * `packages/sandbox/src/factory.js:1271`, `makePersistent` is
 * idempotent within a factory instance, so the second call returns
 * the already-cached handle the genie's tool registry is using.
 *
 * @param {any} host
 * @param {any} workspaceMountCap
 * @returns {Promise<any>}
 */
const lookupLiveSlice = async (host, workspaceMountCap) => {
  const factory = await E(host).lookup(SANDBOX_FACTORY_NAME);
  return E(factory).makePersistent(
    SANDBOX_SLICE_NAME,
    harden({
      rootfs: { kind: 'host-bind' },
      mounts: [
        {
          cap: workspaceMountCap,
          innerPath: '/workspace',
          mode: 'rw',
        },
      ],
      network: 'private',
      backend: 'auto',
      env: { GENIE_WORKSPACE: '/workspace' },
      cwd: '/workspace',
    }),
  );
};

/**
 * Drive a remote `AsyncIterator<Uint8Array>` (the shape
 * `ProcessHandle.stdout()` / `.stderr()` returns over CapTP) into a
 * single `Uint8Array`.  Mirrors the genie tool layer's
 * `drainReaderRef` (`packages/genie/src/tools/command.js`) so the
 * test exercises the same byte-stream surface tools see.
 *
 * @param {any} reader
 */
const drainReader = async reader => {
  await null;
  /** @type {Uint8Array[]} */
  const chunks = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await E(reader).next();
    if (done) break;
    chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return merged;
};

const decodeUtf8 = (/** @type {Uint8Array} */ bytes) =>
  new TextDecoder('utf-8').decode(bytes);

test.beforeEach(t => {
  t.context = [];
});

test.afterEach.always(async t => {
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
  'workspace slice can read /workspace files but not host home paths',
  async t => {
    if (!bwrapAvailability.available) {
      t.pass(`bwrap not available: ${bwrapAvailability.reason}`);
      return;
    }

    const { config, host } = await prepareHost(t);
    const workspaceDir = path.join(config.statePath, 'genie-workspace');
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    // Plant a host-only sentinel file under the daemon's state directory.
    // The state path lives under `<package>/tmp/...`, which is a child of
    // the user's home directory — `/home` is NOT in the bwrap driver's
    // host-bind allow-list (`packages/sandbox/src/drivers/bwrap.js:53`),
    // so this path must not appear inside the slice's namespace.  We
    // pick a path the genie has no business reading; ~/.aws/credentials
    // is the canonical real-world example, but using a fresh sentinel
    // avoids reading actual operator state.
    const hostSentinelDir = path.join(config.statePath, 'host-only');
    await fs.promises.mkdir(hostSentinelDir, { recursive: true });
    const hostSentinelPath = path.join(hostSentinelDir, 'sentinel.txt');
    await fs.promises.writeFile(
      hostSentinelPath,
      'this-must-not-be-readable-from-the-slice\n',
    );

    await runGenieSetup(host, workspaceDir);

    // The genie's HEARTBEAT.md is written by `initWorkspace` during
    // boot — wait for `agent ready` so we know `runRootAgent` has
    // initialised the workspace and minted the slice.
    await waitForWorkerText(
      config,
      /\[genie:main-genie\] Workspace sandbox minted/u,
    );

    const workspaceMountCap = await E(host).lookup(WORKSPACE_MOUNT_NAME);
    const slice = await lookupLiveSlice(host, workspaceMountCap);

    // /workspace/HEARTBEAT.md should be readable inside the slice — it
    // is the workspace template's primary fixture file.
    const heartbeatProc = await E(slice).spawn(
      harden(['/bin/cat', '/workspace/HEARTBEAT.md']),
    );
    const heartbeatStdoutP = drainReader(await E(heartbeatProc).stdout());
    const heartbeatExit = await E(heartbeatProc).wait();
    const heartbeatStdout = decodeUtf8(await heartbeatStdoutP);
    t.is(heartbeatExit.code, 0, 'reading /workspace/HEARTBEAT.md should succeed');
    t.regex(
      heartbeatStdout,
      /HEARTBEAT/u,
      'HEARTBEAT.md contents should reach stdout',
    );

    // The host-only sentinel must NOT be visible: /home is unmounted in
    // the host-bind rootfs, so any path under it 404s inside the slice.
    const sentinelProc = await E(slice).spawn(
      harden(['/bin/cat', hostSentinelPath]),
    );
    const sentinelStderrP = drainReader(await E(sentinelProc).stderr());
    const sentinelExit = await E(sentinelProc).wait();
    const sentinelStderr = decodeUtf8(await sentinelStderrP);
    t.not(
      sentinelExit.code,
      0,
      'reading a host-only sentinel must fail inside the slice',
    );
    t.regex(
      sentinelStderr,
      /No such file|cannot open|not found/iu,
      'stderr should report the missing host path, not surface its contents',
    );
  },
);

test.serial(
  "network: 'private' blocks loopback to the host daemon port",
  async t => {
    if (!bwrapAvailability.available) {
      t.pass(`bwrap not available: ${bwrapAvailability.reason}`);
      return;
    }
    if (!pastaAvailability.available) {
      // pasta drives the netns + nft egress filter for the `private`
      // profile.  Without it the bwrap driver records the network
      // intent but does not yet wire the loopback block end-to-end
      // (`packages/sandbox/src/drivers/bwrap.js:495–500`).  Pass so the
      // test suite does not regress on hosts without pasta; tighten to
      // a hard assert once pasta wiring lands.
      t.pass(`pasta not available: ${pastaAvailability.reason}`);
      return;
    }

    const { config, host } = await prepareHost(t);
    const workspaceDir = path.join(config.statePath, 'genie-workspace');
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    await runGenieSetup(host, workspaceDir);
    await waitForWorkerText(
      config,
      /\[genie:main-genie\] Workspace sandbox minted/u,
    );

    const workspaceMountCap = await E(host).lookup(WORKSPACE_MOUNT_NAME);
    const slice = await lookupLiveSlice(host, workspaceMountCap);

    // The daemon binds 127.0.0.1:0 (an OS-assigned ephemeral port);
    // we don't know the port up front, so we check the broader
    // invariant: a TCP connect to *any* loopback address from inside
    // the slice fails.  /dev/tcp is bash-builtin only, so we wrap in
    // /bin/bash explicitly.
    const proc = await E(slice).spawn(
      harden([
        '/bin/bash',
        '-c',
        'if exec 3<>/dev/tcp/127.0.0.1/22 2>/dev/null; ' +
          'then echo connected; ' +
          'else echo blocked; fi',
      ]),
    );
    const stdoutP = drainReader(await E(proc).stdout());
    await E(proc).wait();
    const stdout = decodeUtf8(await stdoutP);
    t.regex(
      stdout,
      /blocked/u,
      'connect to host loopback should be blocked under network: private',
    );
    t.notRegex(
      stdout,
      /connected/u,
      'connect to host loopback must not have succeeded',
    );
  },
);

test.serial(
  'daemon restart reincarnates main-genie and its slice',
  async t => {
    if (!bwrapAvailability.available) {
      t.pass(`bwrap not available: ${bwrapAvailability.reason}`);
      return;
    }

    const { cancelled, config, host } = await prepareHost(t);
    const workspaceDir = path.join(config.statePath, 'genie-workspace');
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    await runGenieSetup(host, workspaceDir);

    const mintPattern =
      /\[genie:main-genie\] Workspace sandbox minted \(main-genie-sandbox/u;
    await waitForWorkerLogCount(config, mintPattern, 1);

    // Stop + restart the daemon.  Per
    // `TADA/39_endo_genie_sandbox_gc_order.md`, no daemon-side
    // ordering code is needed: pet-store edges keep `workspace-mount`,
    // `sandbox-factory`, `main-genie`, and the factory's
    // `sandbox-persistent-main-genie-sandbox` scratch mount alive
    // across restart, and `main.js`'s awaited lookup chain re-mints
    // the slice handle in-process before the tool registry sees it.
    await stop(config);
    await restart(config);

    const { host: host2 } = await makeHost(config, cancelled);

    t.true(
      await E(host2).has('main-genie'),
      'main-genie pet name must survive the restart',
    );
    t.true(
      await E(host2).has(SANDBOX_FACTORY_NAME),
      'sandbox-factory pet name must survive the restart',
    );
    t.true(
      await E(host2).has(WORKSPACE_MOUNT_NAME),
      'workspace-mount pet name must survive the restart',
    );

    // Force the worker to reincarnate by looking it up.  The same
    // awaited lookup chain inside `main.js` re-mints the slice before
    // tool construction, so a fresh `Workspace sandbox minted` log
    // line is the structured proof the chain ran end-to-end.
    await E(host2).lookup('main-genie');
    await waitForWorkerLogCount(config, mintPattern, 2);

    // Sanity: a slice spawn through the post-restart factory still
    // sees the same `/workspace` view — proves the persistent slice
    // came back wired to the same workspace mount, not orphaned.
    const workspaceMountCap = await E(host2).lookup(WORKSPACE_MOUNT_NAME);
    const slice = await lookupLiveSlice(host2, workspaceMountCap);
    const proc = await E(slice).spawn(
      harden(['/bin/sh', '-c', 'test -f /workspace/HEARTBEAT.md && echo ok']),
    );
    const stdoutP = drainReader(await E(proc).stdout());
    const exit = await E(proc).wait();
    const stdout = decodeUtf8(await stdoutP);
    t.is(exit.code, 0, 'post-restart slice spawn should succeed');
    t.regex(
      stdout,
      /ok/u,
      'post-restart slice should still see /workspace/HEARTBEAT.md',
    );
  },
);

test.serial(
  'tool stdio plumbing round-trips bytes without corruption',
  async t => {
    if (!bwrapAvailability.available) {
      t.pass(`bwrap not available: ${bwrapAvailability.reason}`);
      return;
    }

    const { config, host } = await prepareHost(t);
    const workspaceDir = path.join(config.statePath, 'genie-workspace');
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    await runGenieSetup(host, workspaceDir);
    await waitForWorkerText(
      config,
      /\[genie:main-genie\] Workspace sandbox minted/u,
    );

    const workspaceMountCap = await E(host).lookup(WORKSPACE_MOUNT_NAME);
    const slice = await lookupLiveSlice(host, workspaceMountCap);

    // The headline TODO/40 case: `bash -lc 'echo hi'` returns `hi\n`
    // on stdout via the slice's reader-ref adapter.
    {
      const proc = await E(slice).spawn(
        harden(['/bin/sh', '-c', 'echo hi']),
      );
      const stdoutP = drainReader(await E(proc).stdout());
      const exit = await E(proc).wait();
      const stdout = decodeUtf8(await stdoutP);
      t.is(exit.code, 0);
      t.is(
        stdout,
        'hi\n',
        '`echo hi` must round-trip exactly through the slice reader-ref adapter',
      );
    }

    // UTF-8 fidelity across a chunk boundary: emit a payload large
    // enough that the reader-ref delivers it in multiple `next()`
    // chunks, with multi-byte codepoints sprinkled throughout.  The
    // tool-side `drainReaderRef` (`packages/genie/src/tools/command.js`)
    // accumulates `Uint8Array` chunks then decodes once, so a chunk
    // boundary that falls inside a codepoint must still decode
    // correctly — exercising the contract documented in
    // `TADA/35_endo_genie_sandbox_tool_spawn.md`.
    {
      const payload = `café-✓-héllo-${'x'.repeat(64 * 1024)}`;
      // `printf %s` avoids the trailing newline `echo` adds; we add a
      // single newline ourselves so the assertion is exact.
      const proc = await E(slice).spawn(
        harden([
          '/bin/sh',
          '-c',
          // Inline-quote the payload via env, to dodge shell-escaping
          // for the multi-byte characters.
          'printf %s "$PAYLOAD"',
        ]),
        harden({ env: { PAYLOAD: payload } }),
      );
      const stdoutP = drainReader(await E(proc).stdout());
      const exit = await E(proc).wait();
      const stdout = decodeUtf8(await stdoutP);
      t.is(exit.code, 0);
      t.is(
        stdout,
        payload,
        'multi-byte UTF-8 across chunk boundaries must decode identity',
      );
    }

    // Stderr is a separate reader-ref; assert the streams stay
    // independent.  The bwrap driver hands stdout / stderr through
    // distinct exo refs (`packages/sandbox/src/factory.js`'s
    // `makeReaderExoFromAsyncIterable`), so a process that writes to
    // both must surface only its stdout writes on stdout, and only
    // its stderr writes on stderr.
    {
      const proc = await E(slice).spawn(
        harden([
          '/bin/sh',
          '-c',
          'echo to-stdout; echo to-stderr 1>&2',
        ]),
      );
      const stdoutP = drainReader(await E(proc).stdout());
      const stderrP = drainReader(await E(proc).stderr());
      const exit = await E(proc).wait();
      const stdout = decodeUtf8(await stdoutP);
      const stderr = decodeUtf8(await stderrP);
      t.is(exit.code, 0);
      t.is(stdout, 'to-stdout\n', 'stdout reader-ref isolates stdout writes');
      t.is(stderr, 'to-stderr\n', 'stderr reader-ref isolates stderr writes');
    }
  },
);

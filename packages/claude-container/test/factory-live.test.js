// @ts-nocheck
/* global Buffer, process, setTimeout */
/* eslint-disable import/order, no-await-in-loop */

// Establish a perimeter:
import '@endo/init/debug.js';

import test from 'ava';
import net from 'node:net';
import path from 'node:path';
import url from 'node:url';
import { mkdtemp, rm, access } from 'node:fs/promises';
import os from 'node:os';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

import {
  start as startEndo,
  stop as stopEndo,
  purge,
  makeEndoClient,
} from '@endo/daemon';
import { start as startOrch } from '@endo/claude-orch/src/main.js';
import { buildFrame, consumeFrames } from '@endo/claude-orch/src/stdio/mux.js';

const { raw } = String;
const dirname = url.fileURLToPath(new URL('..', import.meta.url));

let configPathId = 0;

const makeEndoConfig = (...root) => ({
  statePath: path.join(dirname, ...root, 'state'),
  ephemeralStatePath: path.join(dirname, ...root, 'run'),
  cachePath: path.join(dirname, ...root, 'cache'),
  sockPath:
    process.platform === 'win32'
      ? raw`\\?\pipe\endo-${root.join('-')}-claude-container.sock`
      : path.join(dirname, ...root, 'endo.sock'),
  address: '127.0.0.1:0',
  pets: new Map(),
  values: new Map(),
});

const getConfigDir = (title, idx) => {
  const base = title.replace(/\s/giu, '-').replace(/[^\w-]/giu, '');
  const tid = String(configPathId).padStart(4, '0');
  const cid = String(idx).padStart(2, '0');
  configPathId += 1;
  // Keep short — UDS path limit (~108 chars on linux).
  return `${base.slice(0, 16)}#${tid}-${cid}`;
};

const connectEndo = async (config, t) => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  cancelled.catch(() => {});
  t.context.endoConfigs.push({ cancel, cancelled, config });

  const { getBootstrap } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  return { config, host, cancel, cancelled };
};

const prepareEndo = async t => {
  const config = makeEndoConfig(
    'tmp',
    getConfigDir(t.title, t.context.endoConfigs.length),
  );
  await purge(config);
  await startEndo(config);
  return connectEndo(config, t);
};

const waitConnect = sock =>
  new Promise((resolve, reject) => {
    sock.once('connect', resolve);
    sock.once('error', reject);
  });

const readLine = sock =>
  new Promise((resolve, reject) => {
    let buf = '';
    const onData = chunk => {
      buf += chunk.toString('utf8');
      const i = buf.indexOf('\n');
      if (i >= 0) {
        sock.off('data', onData);
        resolve(buf.slice(0, i));
      }
    };
    sock.on('data', onData);
    sock.once('error', reject);
  });

/**
 * Build a mock guest that drives the orchestrator's bootstrap/agent
 * handshake and echoes a single canned stream-json event back when it
 * receives a `claude -p`-shaped user prompt.
 */
const makeMockGuest = ({ record }) => {
  /** @type {net.Server | null} */
  let stdioServer = null;
  /** @type {net.Socket | null} */
  let stdioConn = null;
  /** @type {net.Socket | null} */
  let agentSocket = null;
  let killed = false;

  /** @type {Buffer[]} */
  const promptBuffers = [];

  const onAttachData = payload => {
    promptBuffers.push(payload);
    const all = Buffer.concat(promptBuffers).toString('utf8');
    if (!all.includes('\n')) return;
    // Echo back one assistant event per received line.
    const lines = all.split('\n').filter(l => l.length > 0);
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        const userText =
          msg?.message?.content?.[0]?.text ?? '<no-text>';
        const event = {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: `echo: ${userText}` }],
          },
        };
        if (stdioConn) {
          stdioConn.write(buildFrame('default0', Buffer.from(`${JSON.stringify(event)}\n`)));
        }
      } catch {
        // Ignore non-JSON; the orchestrator's stdio mux may emit framing-
        // probe bytes during start.
      }
    }
    promptBuffers.length = 0;
  };

  const run = async () => {
    stdioServer = net.createServer(conn => {
      stdioConn = conn;
      let buf = Buffer.alloc(0);
      conn.on('data', chunk => {
        buf = consumeFrames(Buffer.concat([buf, chunk]), (id, payload) => {
          if (id === 'default0') onAttachData(Buffer.from(payload));
        });
      });
      conn.on('error', () => {});
      conn.on('close', () => {
        stdioConn = null;
      });
    });
    stdioServer.on('error', () => {});
    await new Promise(r => stdioServer?.listen(record.stdioSocketPath, r));

    const ctl = net.createConnection(record.ctlSocketPath);
    ctl.on('error', () => {});
    await waitConnect(ctl);
    ctl.write(
      `${JSON.stringify({
        type: 'hello',
        sessionId: record.id,
        bootNonce: record.bootNonce,
        agentVersion: '0.0.0',
        hostname: 'mock-guest',
      })}\n`,
    );
    const ctlReply = await readLine(ctl);
    const bootConfig = JSON.parse(ctlReply);
    if (bootConfig.type !== 'boot_config') {
      throw new Error(`expected boot_config, got ${bootConfig.type}`);
    }
    ctl.end();

    agentSocket = net.createConnection(record.agentSocketPath);
    agentSocket.on('error', () => {});
    await waitConnect(agentSocket);
    agentSocket.write(
      `${JSON.stringify({ type: 'ready', capabilities: ['stdio-mux'] })}\n`,
    );

    let buf = '';
    agentSocket.on('data', chunk => {
      buf += chunk.toString('utf8');
      for (;;) {
        const i = buf.indexOf('\n');
        if (i < 0) break;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'terminate') {
            killed = true;
            agentSocket?.end();
          }
        } catch {
          // ignore non-json
        }
      }
    });
  };

  return {
    run,
    stop() {
      killed = true;
      stdioConn?.destroy();
      stdioServer?.close(() => {});
      agentSocket?.destroy();
    },
    get killed() {
      return killed;
    },
  };
};

const makeStubNetwork = () => ({
  async initialize() {
    // no-op
  },
  async attachSession() {
    return {
      qemuArgs: [],
      cleanup: async () => {
        // no-op
      },
    };
  },
  async detachSession() {
    // no-op
  },
  async shutdown() {
    // no-op
  },
});

const makeStubBroker = () => ({
  async issue() {
    return { apiKey: 'sk-test-12345' };
  },
  async revoke() {
    // no-op
  },
  async rotateIfNeeded() {
    return null;
  },
});

const startOrchestrator = async (t, sessionId) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-live-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));

  const apiSock = path.join(dir, 'api.sock');
  const sessionsDir = path.join(dir, 'sessions');

  /** @type {ReturnType<typeof makeMockGuest> | null} */
  let mockGuest = null;
  const mockSpawn = ({ record }) => {
    const guest = makeMockGuest({ record });
    mockGuest = guest;
    setTimeout(() => guest.run().catch(() => {}), 5);
    const child = /** @type {any} */ ({ pid: 99999, killed: false });
    let resolveExit;
    const exitCode = new Promise(r => {
      resolveExit = r;
    });
    return {
      child,
      exitCode,
      kill: () => {
        guest.stop();
        resolveExit?.(0);
      },
    };
  };

  const orch = await startOrch({
    config: {
      socketPath: apiSock,
      imageDir: '/unused',
      sessionDir: sessionsDir,
      brokerSocketPath: '/unused',
      defaults: { arch: 'x86_64', vcpus: 2, memMB: 2048 },
      bootDeadlineMs: 10000,
      heartbeatTimeoutMs: 60000,
    },
    networkController: makeStubNetwork(),
    brokerClient: /** @type {any} */ (makeStubBroker()),
    spawnVm: mockSpawn,
  });
  t.teardown(() => orch.stop());

  return {
    apiSocketPath: apiSock,
    getMockGuest: () => mockGuest,
  };
};

test.beforeEach(t => {
  t.context.endoConfigs = [];
});

test.afterEach.always(async t => {
  for (const { cancel, cancelled, config } of t.context.endoConfigs) {
    await stopEndo(config).catch(() => {});
    cancel(new Error('teardown'));
    await cancelled.catch(() => {});
  }
});

/**
 * Drive the factory caplet through one form submission cycle and
 * return the resulting session metadata. Used by multiple tests that
 * need a populated factory + orchestrator pair.
 *
 * @param {import('ava').ExecutionContext<any>} t
 * @param {object} opts
 * @param {object} opts.host             — Endo host ERef.
 * @param {string} opts.apiSocketPath    — orchestrator UDS path.
 * @param {string} [opts.fsName]         — FS pet name to bind.
 * @param {string} [opts.clientName]     — pet name for the ClaudeClient.
 */
const driveFactorySubmission = async (
  t,
  { host, apiSocketPath, fsName = 'workspace-fs', clientName = 'claude-test' },
) => {
  await E(host).storeValue(
    /** @type {any} */ (harden({ kind: 'mock-fs-cap' })),
    fsName,
  );

  const factoryName = 'claude-container-factory';
  const factorySpecifier = new URL(
    '../src/claude-container-factory.js',
    import.meta.url,
  ).href;
  const profileName = `profile-for-${factoryName}`;

  await E(host).provideGuest(factoryName, {
    introducedNames: harden({ '@agent': 'host-agent' }),
    agentName: profileName,
  });
  await E(host).makeUnconfined('@main', factorySpecifier, {
    powersName: profileName,
    resultName: `controller-for-${factoryName}`,
    env: harden({ ORCHESTRATOR_SOCKET: apiSocketPath }),
  });

  const hostMessages = E(host).followMessages();
  let formNumber;
  let drainsLeft = 8;
  while (drainsLeft > 0) {
    const { value: msg } = await E(hostMessages).next();
    if (msg && msg.type === 'form') {
      formNumber = msg.number;
      break;
    }
    drainsLeft -= 1;
  }
  t.is(typeof formNumber, 'bigint');

  await E(host).submit(
    formNumber,
    harden({
      name: clientName,
      filesystem: fsName,
      network: 'none',
      model: 'claude-sonnet-4-6',
      initialPrompt: '',
    }),
  );

  let replyText;
  drainsLeft = 20;
  while (drainsLeft > 0) {
    const { value: msg } = await E(hostMessages).next();
    if (msg && msg.type === 'package') {
      replyText = (msg.strings ?? []).join('\n');
      break;
    }
    drainsLeft -= 1;
  }
  t.regex(replyText ?? '', new RegExp(`ClaudeClient "${clientName}" created`));

  const client = await E(host).lookup(clientName);
  const status = await E(client).status();
  return { client, status, replyText };
};

test.serial(
  'live: factory provisions ClaudeClient and round-trips a stream-json event',
  async t => {
    const { host } = await prepareEndo(t);
    const { apiSocketPath } = await startOrchestrator(t);

    const { client, status } = await driveFactorySubmission(t, {
      host,
      apiSocketPath,
    });
    t.truthy(status.sessionId);
    t.false(status.terminated);

    const reader = await E(client).send('hello from test');
    const first = await E(reader).next();
    t.false(first.done);
    t.is(first.value.type, 'assistant');
    t.regex(first.value.message.content[0].text, /echo: hello from test/);

    await E(client).terminate();
    const statusAfter = await E(client).status();
    t.true(statusAfter.terminated);
  },
);

test.serial(
  'live: 9P bridge reincarnates after Endo daemon restart (R4 bridge re-attach)',
  async t => {
    const { config, host, cancel } = await prepareEndo(t);
    const { apiSocketPath } = await startOrchestrator(t);

    const { status } = await driveFactorySubmission(t, {
      host,
      apiSocketPath,
      clientName: 'claude-survivor',
    });
    t.truthy(status.sessionId);
    const fsSocketPath = status.fsSocketPath;
    t.truthy(fsSocketPath);

    // Bridge is up — UDS exists at fsSocketPath.
    await access(fsSocketPath);

    // Stop the Endo daemon. Its workers die with it, taking the
    // bridge caplet (and the ClaudeClient caplet) with them. The
    // orchestrator's UDS socket and the session record survive
    // (orchestrator is a separate process).
    await stopEndo(config);
    cancel(new Error('restart'));

    // Sanity: after the daemon stops, the bridge socket's owning
    // process is gone. We don't assert non-existence — the inode may
    // linger if the worker didn't get a chance to unlink — but a
    // fresh connect to it should fail.
    const probe = net.createConnection(fsSocketPath);
    const probeOutcome = await new Promise(resolve => {
      probe.once('connect', () => resolve('connected'));
      probe.once('error', () => resolve('refused'));
      setTimeout(() => resolve('timeout'), 500);
    });
    probe.destroy();
    t.is(probeOutcome, 'refused');

    // Start a fresh daemon at the same statePath. The factory's
    // form-driven submission would normally re-create the bridge, but
    // for R4 we want the bridge to come back without re-submitting —
    // just by looking up the formula by its pet name.
    await startEndo(config);
    const { host: host2 } = await connectEndo(config, t);

    // Trigger bridge reincarnation by resolving its pet name.
    const sessionId = status.sessionId;
    const bridgeName = `bridge-for-${sessionId}`;
    const bridge = await E(host2).lookup(bridgeName);
    t.truthy(bridge);

    // The bridge module's `make` calls `start()` eagerly, so by the
    // time `lookup` resolves, the UDS is listening again.
    await access(fsSocketPath);

    // And a fresh client connection succeeds.
    const probe2 = net.createConnection(fsSocketPath);
    const outcome2 = await new Promise(resolve => {
      probe2.once('connect', () => resolve('connected'));
      probe2.once('error', () => resolve('refused'));
      setTimeout(() => resolve('timeout'), 1000);
    });
    probe2.destroy();
    t.is(outcome2, 'connected');
  },
);

// @ts-nocheck
/* global Buffer, process, setTimeout */
/* eslint-disable import/order, no-await-in-loop */

// Establish a perimeter:
import '@endo/init/debug.js';

import test from 'ava';
import net from 'node:net';
import path from 'node:path';
import url from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
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

const prepareEndo = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  cancelled.catch(() => {});
  const config = makeEndoConfig(
    'tmp',
    getConfigDir(t.title, t.context.endoConfigs.length),
  );
  await purge(config);
  await startEndo(config);
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

test.serial(
  'live: factory provisions ClaudeClient and round-trips a stream-json event',
  async t => {
    const { host } = await prepareEndo(t);
    const { apiSocketPath } = await startOrchestrator(t);

    // Store any value as the FS capability — the 9P bridge will start
    // listening but no client connects to it in this test, so the FS
    // is never called.
    await E(host).storeValue(
      /** @type {any} */ (harden({ kind: 'mock-fs-cap' })),
      'workspace-fs',
    );

    // Provision the factory guest, equivalent to running setup.js.
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

    // The factory caplet, on construction, sends the "Create Claude
    // Container" form to @host's inbox. Wait for it to arrive, then
    // submit a value referencing the workspace-fs we stored above.
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
        name: 'claude-test',
        filesystem: 'workspace-fs',
        network: 'none',
        model: 'claude-sonnet-4-6',
        initialPrompt: '',
      }),
    );

    // Factory replies after storing the ClaudeClient. The first message
    // after submission is the host's own `type: 'value'` self-echo;
    // skip until we see a `package` from the factory.
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
    t.regex(replyText ?? '', /ClaudeClient "claude-test" created/);

    // The ClaudeClient should be visible by pet name on @host.
    const client = await E(host).lookup('claude-test');
    const status = await E(client).status();
    t.truthy(status.sessionId);
    t.false(status.terminated);

    // Round-trip a prompt through the orchestrator's stdio mux and the
    // mock guest's stream-json echo.
    const reader = await E(client).send('hello from test');
    const first = await E(reader).next();
    t.false(first.done);
    t.is(first.value.type, 'assistant');
    t.regex(first.value.message.content[0].text, /echo: hello from test/);

    // Tear the session down through the exo, exercising the
    // orchestrator's DELETE path.
    await E(client).terminate();
    const statusAfter = await E(client).status();
    t.true(statusAfter.terminated);
  },
);

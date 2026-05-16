// @ts-nocheck
/* global Buffer, setTimeout */
/* eslint-disable import/order */

import '@endo/init';
import test from 'ava';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { start } from '../src/main.js';
import { buildFrame, consumeFrames } from '../src/stdio/mux.js';

/**
 * A no-op network controller for tests: skips nftables/pfctl, returns
 * empty qemuArgs, no per-session cleanup.
 *
 * @returns {import('../protocol.types.js').NetworkController}
 */
const makeStubNetwork = () => ({
  async initialize() {
    // no-op
  },
  async attachSession(_id, _opts) {
    return {
      qemuArgs: [],
      cleanup: async () => {
        // no-op
      },
    };
  },
  async detachSession(_id) {
    // no-op
  },
  async shutdown() {
    // no-op
  },
});

/**
 * Stub broker that returns a fixed API key.
 */
const makeStubBroker = () => ({
  async issue(_sessionId) {
    return { apiKey: 'sk-test-12345' };
  },
  async revoke(_sessionId) {
    // no-op
  },
  async rotateIfNeeded(_sessionId) {
    return null;
  },
});

/**
 * Mock guest process. In place of QEMU, opens UDS clients to ctl.sock
 * and agent.sock, drives the bootstrap handshake, sends Ready, and
 * listens on stdio.sock for framed bytes from the orchestrator.
 *
 * @param {{
 *   record: import('../protocol.types.js').SessionRecord,
 *   onAttachData?: (payload: Buffer) => void,
 * }} opts
 */
const makeMockGuest = ({ record, onAttachData }) => {
  /** @type {net.Server | null} */
  let stdioServer = null;
  /** @type {net.Socket | null} */
  let stdioConn = null;
  /** @type {net.Socket | null} */
  let agentSocket = null;
  let killed = false;

  const run = async () => {
    // 0) Mock QEMU stdio chardev (server=on per qemu args): bind a UDS
    // server so the orchestrator's stdio mux can connect to it.
    stdioServer = net.createServer(conn => {
      stdioConn = conn;
      let stdioBuf = Buffer.alloc(0);
      conn.on('data', chunk => {
        stdioBuf = consumeFrames(
          Buffer.concat([stdioBuf, chunk]),
          (id, payload) => {
            if (id === 'default0' && onAttachData) {
              onAttachData(Buffer.from(payload));
            }
          },
        );
      });
      conn.on('error', () => {});
      conn.on('close', () => {});
    });
    stdioServer.on('error', () => {});
    await new Promise(r => stdioServer?.listen(record.stdioSocketPath, r));

    // 1) Connect to ctl.sock, send Hello, expect BootConfig.
    const ctl = net.createConnection(record.ctlSocketPath);
    ctl.on('error', () => {});
    await waitConnect(ctl);
    const hello = `${JSON.stringify({
      type: 'hello',
      sessionId: record.id,
      bootNonce: record.bootNonce,
      agentVersion: '0.0.0',
      hostname: 'mock-guest',
    })}\n`;
    ctl.write(hello);
    const ctlReply = await readLine(ctl);
    const bootConfig = JSON.parse(ctlReply);
    if (bootConfig.type !== 'boot_config') {
      throw new Error(`expected boot_config, got ${bootConfig.type}`);
    }
    ctl.end();

    // 2) Connect to agent.sock, send Ready.
    agentSocket = net.createConnection(record.agentSocketPath);
    agentSocket.on('error', () => {});
    await waitConnect(agentSocket);
    agentSocket.write(
      `${JSON.stringify({ type: 'ready', capabilities: ['stdio-mux'] })}\n`,
    );

    // 3) Stay attached for the test's lifetime; respond to terminate.
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
          // ignore bad lines
        }
      }
    });
  };

  return {
    run,
    sendStdout(/** @type {Buffer} */ data) {
      if (stdioConn) stdioConn.write(buildFrame('default0', data));
    },
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
 * @param {() => boolean} pred
 * @param {number} deadlineMs
 */
const waitFor = async (pred, deadlineMs) => {
  const begin = Date.now();
  while (!pred()) {
    const elapsed = /** @type {number} */ (Date.now() - begin);
    if (elapsed > deadlineMs) throw new Error('waitFor timeout');
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 10));
  }
};

const httpRequest = (socketPath, method, urlPath, body) =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        socketPath,
        method,
        path: urlPath,
        headers: payload
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode,
            body: text ? JSON.parse(text) : null,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

test('e2e: full lifecycle createSession → markReady → attach → terminate', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'orch-e2e-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));

  const apiSock = path.join(dir, 'api.sock');
  const sessionsDir = path.join(dir, 'sessions');

  /** @type {ReturnType<typeof makeMockGuest> | null} */
  let mockGuest = null;
  const guestRx = [];

  // Mock VM "spawner" that, in place of QEMU, bootstraps the mock guest
  // against the orchestrator's per-session UDS endpoints.
  const mockSpawn = ({ record }) => {
    const guest = makeMockGuest({
      record,
      onAttachData: payload => guestRx.push(payload),
    });
    mockGuest = guest;
    // Defer a tick so the orchestrator has time to bind its listeners.
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

  const orch = await start({
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

  // 1) Create session via HTTP.
  const create = await httpRequest(apiSock, 'POST', '/v1/sessions', {
    network: 'none',
    attachMode: 'stream',
  });
  t.is(create.status, 200);
  const session = create.body;
  t.truthy(session.id);
  t.truthy(session.fsSocketPath);
  t.truthy(session.attachSocketPath);

  // 2) Caller pretends to bind fs.sock (test doesn't exercise 9P).
  // 3) Mark ready — kicks off VM spawn, bootstrap handshake, agent link,
  // and stdio mux.
  const ready = await httpRequest(
    apiSock,
    'POST',
    `/v1/sessions/${session.id}/ready`,
  );
  t.is(ready.status, 204);

  // 4) Caller connects to attach socket and writes a prompt.
  const caller = net.createConnection(session.attachSocketPath);
  caller.on('error', () => {});
  await waitConnect(caller);
  caller.write('hello from caller');

  // 5) Mock guest receives the framed payload.
  await waitFor(
    () => Buffer.concat(guestRx).toString('utf8').includes('hello from caller'),
    3000,
  );

  // 6) Mock guest sends data back; caller receives it.
  /** @type {Buffer[]} */
  const callerRx = [];
  caller.on('data', chunk => callerRx.push(chunk));
  mockGuest?.sendStdout(Buffer.from('hello from guest'));
  await waitFor(
    () => Buffer.concat(callerRx).toString('utf8').includes('hello from guest'),
    3000,
  );
  t.pass();

  // 7) Terminate the session.
  caller.destroy();
  const term = await httpRequest(
    apiSock,
    'DELETE',
    `/v1/sessions/${session.id}`,
  );
  t.is(term.status, 204);
  t.true(mockGuest?.killed ?? false);
});

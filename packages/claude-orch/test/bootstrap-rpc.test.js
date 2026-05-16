// @ts-check
/* eslint-disable import/order */

import '@endo/init';
import test from 'ava';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

import { awaitHello } from '../src/bootstrap/rpc-server.js';

const writeLineThenReadLine = (sock, line) =>
  new Promise((resolve, reject) => {
    sock.on('error', reject);
    let buf = '';
    sock.on('data', chunk => {
      buf += chunk.toString('utf8');
      const i = buf.indexOf('\n');
      if (i < 0) return;
      resolve(buf.slice(0, i));
    });
    sock.write(`${line}\n`);
  });

test('awaitHello validates the boot nonce and replies with BootConfig', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-bootstrap-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const ctl = path.join(dir, 'ctl.sock');

  const sessionId = 'abc1234567890def';
  const nonce = 'a'.repeat(64);
  let consumeNonceCalled = 0;

  const bootstrap = awaitHello({
    ctlSocketPath: ctl,
    sessionId,
    consumeNonce: (id, n) => {
      consumeNonceCalled += 1;
      return id === sessionId && n === nonce;
    },
    buildBootConfig: async () =>
      harden({
        type: 'boot_config',
        credentials: { apiKey: 'k' },
        fsMountTag: 'workspace',
        workspaceUidGid: /** @type {[number, number]} */ ([1000, 1000]),
        envExtra: {},
        agentControlPort: '/dev/virtio-ports/agent',
      }),
    deadlineMs: 5000,
  });
  await bootstrap.ready;

  const client = net.createConnection(ctl);
  const replyLine = await writeLineThenReadLine(
    client,
    JSON.stringify({
      type: 'hello',
      sessionId,
      bootNonce: nonce,
      agentVersion: '0.0.0',
      hostname: 'claude-vm',
    }),
  );
  const reply = JSON.parse(replyLine);
  t.is(reply.type, 'boot_config');
  t.is(reply.credentials.apiKey, 'k');
  t.is(reply.agentControlPort, '/dev/virtio-ports/agent');
  client.destroy();

  const hello = await bootstrap.hello;
  t.is(hello.sessionId, sessionId);
  t.is(consumeNonceCalled, 1);
});

test('boot nonce is single-use across two bootstrap attempts on the same session', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-replay-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const ctl = path.join(dir, 'ctl.sock');

  const sessionId = 'replay-test';
  const nonce = 'c'.repeat(64);
  /** @type {boolean[]} */
  const consumeResults = [];
  const consumeNonce = (id, n) => {
    if (id !== sessionId || n !== nonce) {
      consumeResults.push(false);
      return false;
    }
    const ok = consumeResults.filter(x => x).length === 0;
    consumeResults.push(ok);
    return ok; // first call true, second call false
  };

  // First attempt: should succeed.
  const first = awaitHello({
    ctlSocketPath: ctl,
    sessionId,
    consumeNonce,
    buildBootConfig: async () =>
      harden({
        type: 'boot_config',
        credentials: { apiKey: 'k' },
        fsMountTag: 'workspace',
        workspaceUidGid: /** @type {[number, number]} */ ([1000, 1000]),
        envExtra: {},
        agentControlPort: '/dev/virtio-ports/agent',
      }),
    deadlineMs: 5000,
  });
  await first.ready;
  const c1 = net.createConnection(ctl);
  await writeLineThenReadLine(
    c1,
    JSON.stringify({
      type: 'hello',
      sessionId,
      bootNonce: nonce,
      agentVersion: '0.0.0',
      hostname: 'h',
    }),
  );
  await first.hello;
  c1.destroy();

  // Second attempt with the same nonce should be rejected.
  const second = awaitHello({
    ctlSocketPath: ctl,
    sessionId,
    consumeNonce,
    buildBootConfig: async () => {
      throw new Error('should not be called');
    },
    deadlineMs: 2000,
  });
  await second.ready;
  const c2 = net.createConnection(ctl);
  c2.on('error', () => {});
  c2.write(
    `${JSON.stringify({
      type: 'hello',
      sessionId,
      bootNonce: nonce,
      agentVersion: '0.0.0',
      hostname: 'h',
    })}\n`,
  );
  await t.throwsAsync(second.hello, {
    message: /Invalid or replayed boot nonce/,
  });
  c2.destroy();

  t.deepEqual(consumeResults, [true, false]);
});

test('awaitHello rejects a stale nonce', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-bootstrap-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const ctl = path.join(dir, 'ctl.sock');

  const bootstrap = awaitHello({
    ctlSocketPath: ctl,
    sessionId: 'abc',
    consumeNonce: () => false,
    buildBootConfig: async () => {
      throw new Error('should not be called');
    },
    deadlineMs: 5000,
  });
  await bootstrap.ready;

  const client = net.createConnection(ctl);
  client.write(
    `${JSON.stringify({
      type: 'hello',
      sessionId: 'abc',
      bootNonce: 'b'.repeat(64),
      agentVersion: '0.0.0',
      hostname: 'h',
    })}\n`,
  );
  client.on('close', () => {});
  await t.throwsAsync(bootstrap.hello, {
    message: /Invalid or replayed boot nonce/,
  });
  client.destroy();
});

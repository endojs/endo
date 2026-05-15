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

  const helloPromise = awaitHello({
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

  // simulate the guest bootstrap process connecting
  await new Promise(resolve => setTimeout(resolve, 50));
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

  const hello = await helloPromise;
  t.is(hello.sessionId, sessionId);
  t.is(consumeNonceCalled, 1);
});

test('awaitHello rejects a stale nonce', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-bootstrap-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const ctl = path.join(dir, 'ctl.sock');

  const helloPromise = awaitHello({
    ctlSocketPath: ctl,
    sessionId: 'abc',
    consumeNonce: () => false,
    buildBootConfig: async () => {
      throw new Error('should not be called');
    },
    deadlineMs: 5000,
  });

  await new Promise(resolve => setTimeout(resolve, 50));
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
  await t.throwsAsync(helloPromise, { message: /Invalid or replayed boot nonce/ });
  client.destroy();
});

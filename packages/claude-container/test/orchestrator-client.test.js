// @ts-check
/* global Buffer, setTimeout */
/* eslint-disable import/order */

import '@endo/init';
import test from 'ava';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { makeOrchestratorClient } from '../src/orchestrator-client.js';

const startMockServer = async (socketPath, handler) => {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
      : null;
    const out = await handler(req, body);
    if (out === undefined) {
      res.writeHead(204);
      res.end();
      return;
    }
    const json = JSON.stringify(out.body ?? null);
    res.writeHead(out.status ?? 200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(json),
    });
    res.end(json);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => resolve(undefined));
  });
  return server;
};

test('createSession + listSessions + terminate happy path', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'orch-client-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const sockPath = path.join(dir, 'api.sock');

  /** @type {any} */
  let lastCreate = null;
  let terminated = false;
  const server = await startMockServer(sockPath, async (req, body) => {
    if (req.method === 'POST' && req.url === '/v1/sessions') {
      lastCreate = body;
      return {
        status: 200,
        body: {
          id: 's1',
          state: 'pending',
          fsSocketPath: '/x/fs.sock',
          controlSocketPath: '/x/ctl.sock',
          attachSocketPath: '/x/attach.sock',
          createdAt: '2026-05-15T00:00:00Z',
        },
      };
    }
    if (req.method === 'GET' && req.url === '/v1/sessions') {
      return {
        status: 200,
        body: [
          { id: 's1', state: 'pending', createdAt: '2026-05-15T00:00:00Z' },
        ],
      };
    }
    if (req.method === 'POST' && req.url === '/v1/sessions/s1/ready') {
      return undefined; // 204
    }
    if (req.method === 'DELETE' && req.url === '/v1/sessions/s1') {
      terminated = true;
      return undefined;
    }
    return { status: 404, body: { error: 'not found' } };
  });
  t.teardown(() => new Promise(r => server.close(() => r(undefined))));

  const client = makeOrchestratorClient({ socketPath: sockPath });
  const s = await client.createSession({
    network: 'egress',
    attachMode: 'stream',
  });
  t.is(s.id, 's1');
  t.is(lastCreate.network, 'egress');

  await client.markReady('s1');
  const list = await client.listSessions();
  t.is(list.length, 1);
  await client.terminateSession('s1');
  t.true(terminated);
});

test('sendPrompt emits a stream-json user-message frame matching claude -p input format', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'orch-stream-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const sockPath = path.join(dir, 'api.sock');
  const attachPath = path.join(dir, 'attach.sock');

  const server = await startMockServer(sockPath, async () => ({ status: 204 }));
  t.teardown(() => new Promise(r => server.close(() => r(undefined))));

  // Stand up a mock "attach" UDS the orchestrator client will write to.
  /** @type {string[]} */
  const attachRx = [];
  const { default: net } = await import('node:net');
  const attachServer = net.createServer(conn => {
    conn.setEncoding('utf8');
    conn.on('data', chunk => attachRx.push(/** @type {string} */ (chunk)));
    conn.on('error', () => {});
    // Close once we have the prompt line so sendPrompt's iterator wraps up.
    conn.on('data', () => {
      setTimeout(() => conn.end(), 50);
    });
  });
  await new Promise(r => attachServer.listen(attachPath, r));
  t.teardown(() => new Promise(r => attachServer.close(() => r(undefined))));

  const client = makeOrchestratorClient({ socketPath: sockPath });
  const session = {
    id: 's1',
    state: 'ready',
    fsSocketPath: '/x',
    controlSocketPath: '/x',
    attachSocketPath: attachPath,
    createdAt: '2026-05-15T00:00:00Z',
  };
  const reader = await client.sendPrompt(session, 'hi there', {
    model: 'claude-sonnet-4-6',
  });

  // Drain the reader so the connection closes cleanly.
  // eslint-disable-next-line no-unused-vars
  for await (const _ of reader) {
    // ignore
  }

  const line = attachRx.join('').split('\n')[0];
  const parsed = JSON.parse(line);
  t.is(parsed.type, 'user');
  t.is(parsed.message.role, 'user');
  t.deepEqual(parsed.message.content, [{ type: 'text', text: 'hi there' }]);
  t.is(parsed.model, 'claude-sonnet-4-6');
});

test('orchestrator-client surfaces server errors with method+path context', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'orch-client-err-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const sockPath = path.join(dir, 'api.sock');

  const server = await startMockServer(sockPath, async () => ({
    status: 500,
    body: { error: 'boom' },
  }));
  t.teardown(() => new Promise(r => server.close(() => r(undefined))));

  const client = makeOrchestratorClient({ socketPath: sockPath });
  await t.throwsAsync(
    client.createSession({ network: 'none', attachMode: 'none' }),
    {
      message: /POST.*\/v1\/sessions.*boom/,
    },
  );
});

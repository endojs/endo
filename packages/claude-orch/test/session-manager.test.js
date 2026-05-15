// @ts-check
/* eslint-disable import/order */

import '@endo/init';
import test from 'ava';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { makeSessionManager } from '../src/sessions/session-manager.js';

const makeConfig = sessionDir => ({
  socketPath: '/unused',
  imageDir: '/unused',
  sessionDir,
  brokerSocketPath: '/unused',
  defaults: { arch: 'x86_64', vcpus: 2, memMB: 2048 },
  bootDeadlineMs: 30000,
  heartbeatTimeoutMs: 60000,
});

test('createSession allocates per-session UDS paths and a single-use boot nonce', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-test-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));

  const sm = makeSessionManager({ config: makeConfig(dir) });
  const record = await sm.createSession({
    network: 'egress',
    attachMode: 'stream',
  });

  t.is(record.state, 'pending');
  t.is(record.bootNonceUsed, false);
  t.is(record.bootNonce.length, 64); // 32 bytes hex
  t.true(record.sessionDir.startsWith(dir));
  t.true(record.fsSocketPath.endsWith('/fs.sock'));
  t.true(record.ctlSocketPath.endsWith('/ctl.sock'));
  t.true(record.agentSocketPath.endsWith('/agent.sock'));
  t.true(record.stdioSocketPath.endsWith('/stdio.sock'));
  t.true(record.qmpSocketPath.endsWith('/qmp.sock'));
  t.true(record.attachSocketPath.endsWith('/attach.sock'));

  const s = await stat(record.sessionDir);
  t.true(s.isDirectory());
});

test('consumeBootNonce is single-use', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-test-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));

  const sm = makeSessionManager({ config: makeConfig(dir) });
  const record = await sm.createSession({
    network: 'none',
    attachMode: 'none',
  });
  const nonce = record.bootNonce;

  t.true(sm.consumeBootNonce(record.id, nonce));
  t.false(sm.consumeBootNonce(record.id, nonce));
  t.is(sm.getRecord(record.id)?.bootNonceUsed, true);
  t.is(sm.getRecord(record.id)?.bootNonce, '');
});

test('consumeBootNonce rejects wrong nonce', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-test-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));

  const sm = makeSessionManager({ config: makeConfig(dir) });
  const record = await sm.createSession({
    network: 'none',
    attachMode: 'none',
  });

  t.false(sm.consumeBootNonce(record.id, 'a'.repeat(64)));
  t.is(sm.getRecord(record.id)?.bootNonceUsed, false);
  t.not(sm.getRecord(record.id)?.bootNonce, '');
});

test('toSession omits attachSocketPath when attachMode is none', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-test-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));

  const sm = makeSessionManager({ config: makeConfig(dir) });
  const r1 = await sm.createSession({ network: 'none', attachMode: 'none' });
  const r2 = await sm.createSession({ network: 'none', attachMode: 'stream' });

  t.is(sm.getSession(r1.id)?.attachSocketPath, undefined);
  t.truthy(sm.getSession(r2.id)?.attachSocketPath);
});

test('setState updates readyAt and terminatedAt timestamps', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-test-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));

  const sm = makeSessionManager({ config: makeConfig(dir) });
  const r = await sm.createSession({ network: 'none', attachMode: 'none' });
  sm.setState(r.id, 'ready');
  t.truthy(sm.getRecord(r.id)?.readyAt);
  sm.setState(r.id, 'terminated');
  t.truthy(sm.getRecord(r.id)?.terminatedAt);
});

test('forget removes session and cleans its dir', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-orch-test-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));

  const sm = makeSessionManager({ config: makeConfig(dir) });
  const r = await sm.createSession({ network: 'none', attachMode: 'none' });
  const sessionDir = r.sessionDir;

  await sm.forget(r.id);
  t.is(sm.getRecord(r.id), undefined);
  await t.throwsAsync(stat(sessionDir));
});

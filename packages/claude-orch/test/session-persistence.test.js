// @ts-check
/* global setTimeout */
/* eslint-disable import/order */

import '@endo/init';
import test from 'ava';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

const waitForFile = async (p, timeoutMs = 1000) => {
  const start = Date.now();
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await readFile(p, 'utf8');
    } catch {
      // not yet
    }
    if (Date.now() - start > timeoutMs) throw new Error('waitForFile timeout');
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 20));
  }
};

test('session manager persists session state to disk', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'persist-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const statePath = path.join(dir, 'sessions.json');

  const sm = makeSessionManager({
    config: makeConfig(dir),
    persistencePath: statePath,
  });
  const r = await sm.createSession({ network: 'none', attachMode: 'none' });
  sm.setState(r.id, 'ready', { vmPid: 12345 });

  const data = JSON.parse(await waitForFile(statePath));
  t.is(data.length, 1);
  t.is(data[0].id, r.id);
  t.is(data[0].state, 'ready');
  t.is(data[0].vmPid, 12345);
  // Boot nonce should NOT be persisted in cleartext on disk if it's
  // already been consumed; if not consumed we accept it being on disk
  // (the alternative — re-fetching from broker after restart — is the
  // production path).
});

test('restoreFromDisk re-reads sessions and purges the boot nonce', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'persist-restore-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const statePath = path.join(dir, 'sessions.json');

  // First "process": create + persist.
  {
    const sm = makeSessionManager({
      config: makeConfig(dir),
      persistencePath: statePath,
    });
    const r = await sm.createSession({ network: 'none', attachMode: 'none' });
    sm.setState(r.id, 'ready', { vmPid: 12345 });
    await sm.persistNow();
  }

  // Simulated restart.
  const sm2 = makeSessionManager({
    config: makeConfig(dir),
    persistencePath: statePath,
  });
  const restored = await sm2.restoreFromDisk();
  t.is(restored.length, 1);
  t.is(restored[0].state, 'ready');
  t.is(restored[0].vmPid, 12345);
  t.true(restored[0].bootNonceUsed);
  t.is(restored[0].bootNonce, '');

  // The restored session is queryable via the normal API.
  const summary = sm2.listSessions();
  t.is(summary.length, 1);
  t.is(summary[0].id, restored[0].id);
});

test('restoreFromDisk tolerates a missing state file (cold start)', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'persist-cold-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const statePath = path.join(dir, 'sessions.json');

  const sm = makeSessionManager({
    config: makeConfig(dir),
    persistencePath: statePath,
  });
  const restored = await sm.restoreFromDisk();
  t.deepEqual(restored, []);
});

test('persistence is opt-in: manager works without a persistencePath', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'persist-off-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));

  const sm = makeSessionManager({ config: makeConfig(dir) });
  const r = await sm.createSession({ network: 'none', attachMode: 'none' });
  sm.setState(r.id, 'ready');
  t.is(sm.getRecord(r.id)?.state, 'ready');
});

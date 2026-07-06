// @ts-check
/* global process */

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';

import { makeHostSpawner } from '../src/host-spawner.js';

/**
 * Drain an async-iterable byte stream to a UTF-8 string.
 *
 * @param {AsyncIterable<Uint8Array> | null | undefined} stream
 */
const drain = async stream => {
  if (!stream) return '';
  const decoder = new TextDecoder();
  let acc = '';
  for await (const chunk of stream) {
    acc += decoder.decode(chunk, { stream: true });
  }
  acc += decoder.decode();
  return acc;
};

test('makeHostSpawner returns a hardened spawner function', t => {
  const spawner = makeHostSpawner();
  t.is(typeof spawner, 'function');
  t.is(Object(spawner), spawner);
});

test('spawner rejects an empty argv', async t => {
  const spawner = makeHostSpawner();
  await t.throwsAsync(() => spawner([]), {
    message: /argv must be a non-empty/,
  });
});

test('spawner runs a resolved program and surfaces stdout + exit', async t => {
  const spawner = makeHostSpawner();
  const proc = await spawner(['printf', 'hello']);
  const [stdout, status] = await Promise.all([drain(proc.stdout), proc.wait()]);
  t.is(stdout, 'hello');
  t.is(status.code, 0);
});

test('spawner reports command-not-found for an unresolved program', async t => {
  const spawner = makeHostSpawner({ searchPath: '/nonexistent-dir' });
  await t.throwsAsync(() => spawner(['definitely-not-a-real-program']), {
    message: /command not found/,
  });
});

test('spawner passes an explicit env without inheriting a base default', async t => {
  const spawner = makeHostSpawner({
    defaultEnv: { PATH: process.env.PATH },
  });
  const proc = await spawner(['printenv', 'MARKER'], {
    env: { MARKER: 'present' },
  });
  const [stdout, status] = await Promise.all([drain(proc.stdout), proc.wait()]);
  t.is(stdout.trim(), 'present');
  t.is(status.code, 0);
});

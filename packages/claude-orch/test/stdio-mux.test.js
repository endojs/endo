// @ts-nocheck
/* global Buffer, setTimeout */
/* eslint-disable import/order */

import '@endo/init';
import test from 'ava';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_STREAM_ID,
  buildFrame,
  consumeFrames,
  decodeStreamId,
  encodeStreamId,
  makeStdioMux,
} from '../src/stdio/mux.js';

test('encodeStreamId pads or truncates to exactly 8 bytes', t => {
  t.is(encodeStreamId('').length, 8);
  t.is(encodeStreamId('abc').length, 8);
  t.is(encodeStreamId('abcdefgh').length, 8);
  t.is(encodeStreamId('abcdefghi').length, 8);
  t.is(decodeStreamId(encodeStreamId('exec-1')), 'exec-1');
  t.is(decodeStreamId(encodeStreamId(DEFAULT_STREAM_ID)), DEFAULT_STREAM_ID);
});

test('buildFrame + consumeFrames round-trip multiple frames', t => {
  const f1 = buildFrame('exec-1', Buffer.from('hello'));
  const f2 = buildFrame('default0', Buffer.from('world'));
  const concat = Buffer.concat([f1, f2]);

  const collected = [];
  const tail = consumeFrames(concat, (id, payload) =>
    collected.push([id, payload.toString('utf8')]),
  );
  t.is(tail.length, 0);
  t.deepEqual(collected, [
    ['exec-1', 'hello'],
    ['default0', 'world'],
  ]);
});

test('consumeFrames stops on partial frame and leaves it for next read', t => {
  const f = buildFrame('default0', Buffer.from('partial'));
  const truncated = f.subarray(0, f.length - 3);
  const collected = [];
  const tail = consumeFrames(truncated, (id, p) =>
    collected.push([id, p.toString('utf8')]),
  );
  t.is(collected.length, 0);
  t.is(tail.length, truncated.length);
});

test('stdio mux: caller bytes are framed as default0 and reach the guest side', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mux-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const stdioPath = path.join(dir, 'stdio.sock');
  const attachPath = path.join(dir, 'attach.sock');

  // Mock "guest stdio" — QEMU exposes the chardev as a server.
  /** @type {Buffer[]} */
  const guestRx = [];
  let guestConn = null;
  const guestServer = net.createServer(c => {
    guestConn = c;
    c.on('data', chunk => guestRx.push(chunk));
  });
  await new Promise(r => guestServer.listen(stdioPath, r));
  t.teardown(() => new Promise(r => guestServer.close(() => r(undefined))));

  const mux = makeStdioMux({
    stdioSocketPath: stdioPath,
    attachSocketPath: attachPath,
  });
  await mux.start();
  t.teardown(() => mux.stop());

  // Caller connects to attach UDS and writes a prompt.
  const caller = net.createConnection(attachPath);
  await new Promise(r => caller.once('connect', r));
  caller.write('user-input\n');
  await waitFor(() => guestRx.length > 0, 1000);

  const all = Buffer.concat(guestRx);
  const collected = [];
  consumeFrames(all, (id, payload) =>
    collected.push([id, payload.toString('utf8')]),
  );
  t.true(collected.length >= 1);
  t.is(collected[0][0], DEFAULT_STREAM_ID);
  t.is(collected[0][1], 'user-input\n');

  caller.destroy();
  void guestConn;
});

test('stdio mux: guest default0 frames flow back to the caller', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mux-rx-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const stdioPath = path.join(dir, 'stdio.sock');
  const attachPath = path.join(dir, 'attach.sock');

  /** @type {net.Socket | null} */
  let guestConn = null;
  const guestServer = net.createServer(c => {
    guestConn = c;
  });
  await new Promise(r => guestServer.listen(stdioPath, r));
  t.teardown(() => new Promise(r => guestServer.close(() => r(undefined))));

  const mux = makeStdioMux({
    stdioSocketPath: stdioPath,
    attachSocketPath: attachPath,
  });
  await mux.start();
  t.teardown(() => mux.stop());

  const caller = net.createConnection(attachPath);
  /** @type {Buffer[]} */
  const callerRx = [];
  caller.on('data', chunk => callerRx.push(chunk));
  await new Promise(r => caller.once('connect', r));

  await waitFor(() => guestConn !== null, 1000);
  // Send a default0 frame from the guest side.
  guestConn?.write(
    buildFrame(DEFAULT_STREAM_ID, Buffer.from('hello-from-guest')),
  );
  await waitFor(() => callerRx.length > 0, 1000);
  t.is(Buffer.concat(callerRx).toString('utf8'), 'hello-from-guest');

  caller.destroy();
});

test('stdio mux: non-default0 streams are dropped at the caller', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mux-drop-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const stdioPath = path.join(dir, 'stdio.sock');
  const attachPath = path.join(dir, 'attach.sock');

  /** @type {net.Socket | null} */
  let guestConn = null;
  const guestServer = net.createServer(c => {
    guestConn = c;
  });
  await new Promise(r => guestServer.listen(stdioPath, r));
  t.teardown(() => new Promise(r => guestServer.close(() => r(undefined))));

  const mux = makeStdioMux({
    stdioSocketPath: stdioPath,
    attachSocketPath: attachPath,
  });
  await mux.start();
  t.teardown(() => mux.stop());

  const caller = net.createConnection(attachPath);
  /** @type {Buffer[]} */
  const callerRx = [];
  caller.on('data', chunk => callerRx.push(chunk));
  await new Promise(r => caller.once('connect', r));

  await waitFor(() => guestConn !== null, 1000);
  guestConn?.write(buildFrame('exec-001', Buffer.from('ignore-me')));
  guestConn?.write(buildFrame(DEFAULT_STREAM_ID, Buffer.from('keep-me')));

  await waitFor(
    () => Buffer.concat(callerRx).toString('utf8').includes('keep-me'),
    1000,
  );
  t.is(Buffer.concat(callerRx).toString('utf8'), 'keep-me');

  caller.destroy();
});

const waitFor = async (
  /** @type {() => boolean} */ pred,
  /** @type {number} */ deadlineMs,
) => {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > deadlineMs) throw new Error('waitFor timeout');
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 10));
  }
};

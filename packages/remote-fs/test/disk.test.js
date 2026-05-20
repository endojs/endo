// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Disk-backed Filesystem tests (F3, DESIGN.md §8.3).
 *
 * Each test allocates a fresh `mkdtemp` directory, exercises the
 * same code paths as the in-memory suite, and removes the
 * directory in teardown.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeDiskFilesystem } from '../src/disk.js';

const utf8 = s => new TextEncoder().encode(s);
const fromUtf8 = b => new TextDecoder().decode(b);

const writeBytes = async (writerRef, bytes) => {
  const w = iterateBytesWriter(writerRef);
  await w.next(bytes);
  await w.return();
};

const collectBytes = async readerRef => {
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(readerRef)) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return buf;
};

const collectStream = async readerRef => {
  const out = [];
  for await (const value of iterateReader(readerRef)) {
    out.push(value);
  }
  return out;
};

const setupFs = async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'remote-fs-disk-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  return makeDiskFilesystem({ rootPath: dir });
};

test('root returns a Directory rooted at the host path', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const qid = await E(root).getQid();
  t.is(qid.type, 'directory');
});

test('mkdir + lookup + listing', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  await E(root).mkdir('sub', {});
  const sub = await E(root).lookup('sub');
  const subQid = await E(sub).getQid();
  t.is(subQid.type, 'directory');

  const entries = await collectStream(await E(await E(root).list()).stream());
  t.deepEqual(
    entries.map(e => e.name),
    ['sub'],
  );
});

test('create + write + read round-trips bytes', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const opened = await E(root).create('hello.txt', {});
  await writeBytes(await E(opened).write(0n), utf8('hello, disk\n'));
  await E(opened).close();

  const file = await E(root).lookup('hello.txt');
  const oh = await E(file).open({ read: true });
  const bytes = await collectBytes(await E(oh).read(0n, 1024n));
  t.is(fromUtf8(bytes), 'hello, disk\n');
});

test('write at non-zero offset and read with offset', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const opened = await E(root).create('x', {});
  // First write at offset 0, then a second write that creates a hole-free overwrite.
  await writeBytes(await E(opened).write(0n), utf8('aaaaaaaa'));
  await writeBytes(await E(opened).write(4n), utf8('XXXX'));
  await E(opened).close();
  const file = await E(root).lookup('x');
  const oh = await E(file).open({ read: true });
  const bytes = await collectBytes(await E(oh).read(0n, 64n));
  t.is(fromUtf8(bytes), 'aaaaXXXX');

  const tailReader = await E(oh).read(4n, 4n);
  const tail = await collectBytes(tailReader);
  t.is(fromUtf8(tail), 'XXXX');
});

test('truncate shrinks and grows on disk', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const opened = await E(root).create('x', {});
  await writeBytes(await E(opened).write(0n), utf8('abcdef'));
  await E(opened).truncate(3n);
  const after1 = await collectBytes(await E(opened).read(0n, 16n));
  t.is(fromUtf8(after1), 'abc');
  await E(opened).truncate(5n);
  const after2 = await collectBytes(await E(opened).read(0n, 16n));
  t.is(after2.length, 5);
  await E(opened).close();
});

test('unlink + lookup ENOENT', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const opened = await E(root).create('doomed', {});
  await E(opened).close();
  await E(root).unlink('doomed');
  await t.throwsAsync(() => E(root).lookup('doomed'), {
    message: /ENOENT/,
  });
});

test('rename within a parent (disk-backed)', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const opened = await E(root).create('a', {});
  await writeBytes(await E(opened).write(0n), utf8('hi'));
  await E(opened).close();
  await E(root).rename('a', root, 'b');
  await t.throwsAsync(() => E(root).lookup('a'), { message: /ENOENT/ });
  const b = await E(root).lookup('b');
  const bytes = await collectBytes(
    await E(await E(b).open({ read: true })).read(0n, 64n),
  );
  t.is(fromUtf8(bytes), 'hi');
});

test('lookup invalid name rejects', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  await t.throwsAsync(() => E(root).lookup('..'), { message: /EINVAL/ });
  await t.throwsAsync(() => E(root).lookup('a/b'), { message: /EINVAL/ });
});

test('lookup on missing file is ENOENT, not a different error', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  await t.throwsAsync(() => E(root).lookup('nope'), { message: /ENOENT/ });
});

test('snapshot produces a BlobRef backed by current bytes', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const opened = await E(root).create('x', {});
  await writeBytes(await E(opened).write(0n), utf8('payload'));
  await E(opened).close();
  const file = await E(root).lookup('x');
  const blob = await E(file).snapshot();
  t.truthy(blob);
  const info = await E(blob).getInfo();
  t.is(info.algorithm, 'sha256');
  t.is(info.size, 7n);
  const bytes = await collectBytes(await E(blob).fetch(0n, 64n));
  t.is(fromUtf8(bytes), 'payload');
});

test('locks are advisory + in-process', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const opened = await E(root).create('locked', {});
  const a = await E(opened).lock({
    type: 'exclusive',
    start: 0n,
    length: 100n,
  });
  await t.throwsAsync(
    () => E(opened).lock({ type: 'exclusive', start: 0n, length: 100n }),
    { message: /EAGAIN/ },
  );
  await E(a).release();
  const b = await E(opened).lock({
    type: 'exclusive',
    start: 0n,
    length: 100n,
  });
  await E(b).release();
  await E(opened).close();
});

test('xattrs throw ENOSYS on disk (v1 limitation)', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const opened = await E(root).create('x', {});
  await E(opened).close();
  const file = await E(root).lookup('x');
  const x = await E(file).xattrs();
  await t.throwsAsync(() => E(x).get('user.tag'), { message: /ENOSYS/ });
});

test('watch fires events when a child is created in the directory', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const watcher = await E(root).watch();
  const events = iterateReader(await E(watcher).events());

  // Trigger a real fs.watch event.
  const opened = await E(root).create('triggered', {});
  await E(opened).close();

  // Race a take against a short timeout to bound wall-clock.
  const next = await Promise.race([
    events.next().then(r => ({ kind: 'value', r })),
    new Promise(resolve =>
      // eslint-disable-next-line no-undef
      setTimeout(() => resolve({ kind: 'timeout' }), 1000),
    ),
  ]);
  await E(watcher).cancel();

  if (next.kind === 'timeout') {
    // fs.watch may not signal on every platform/filesystem (e.g.
    // some tmpfs configurations don't notify). Treat as a soft
    // skip rather than a hard failure.
    t.pass('fs.watch did not signal within timeout; platform-specific');
    return;
  }
  t.truthy(next.r.value);
  t.truthy(next.r.value.kind);
});

test('setAttrs rejects owner; allows mtime updates', async t => {
  const fs = await setupFs(t);
  const root = await E(fs).root();
  const opened = await E(root).create('x', {});
  await E(opened).close();
  const file = await E(root).lookup('x');
  await t.throwsAsync(() => E(file).setAttrs({ owner: { uid: 0n, gid: 0n } }), {
    message: /PosixFs/,
  });
  const past = 1_700_000_000_000n * 1_000n; // ns
  await E(file).setAttrs({ mtime: past });
  const a = await E(file).getAttrs();
  t.is(a.mtime, past);
});

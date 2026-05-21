// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';

/**
 * Drain a `PassableReader` into an array.
 */
const collectStream = async readerRef => {
  const out = [];
  for await (const value of iterateReader(readerRef)) {
    out.push(value);
  }
  return out;
};

/**
 * Drain a `PassableBytesReader` into a single concatenated
 * `Uint8Array`. `iterateBytesReader` handles base64 decoding.
 */
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

/**
 * Push a single `Uint8Array` payload into a `PassableBytesWriter`
 * and close it. `iterateBytesWriter` handles base64 encoding.
 */
const writeBytes = async (writerRef, bytes) => {
  const writer = iterateBytesWriter(writerRef);
  await writer.next(bytes);
  await writer.return();
};

const utf8 = s => new TextEncoder().encode(s);
const fromUtf8 = b => new TextDecoder().decode(b);

test('Filesystem.root returns a Directory with valid qid', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const qid = await E(root).getQid();
  t.is(qid.type, 'directory');
  t.is(typeof qid.pathId, 'bigint');
  t.is(typeof qid.version, 'bigint');
});

test('mkdir + lookup returns a Directory with a distinct qid', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const subdir = await E(root).mkdir('subdir', {});
  const rootQid = await E(root).getQid();
  const subQid = await E(subdir).getQid();
  t.not(subQid.pathId, rootQid.pathId);
  t.is(subQid.type, 'directory');

  const looked = await E(root).lookup('subdir');
  const lookedQid = await E(looked).getQid();
  t.is(lookedQid.pathId, subQid.pathId);
});

test('create + read round-trips bytes', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const openFile = await E(root).create('hello.txt', {});

  await writeBytes(await E(openFile).write(0n), utf8('hello, world\n'));
  await E(openFile).close();

  const file = await E(root).lookup('hello.txt');
  const fileQid = await E(file).getQid();
  t.is(fileQid.type, 'file');

  const reader = await E(file).open({ read: true });
  const bytesReader = await E(reader).read(0n, 1024n);
  const bytes = await collectBytes(bytesReader);
  t.is(fromUtf8(bytes), 'hello, world\n');
});

test('read past EOF returns empty', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const openFile = await E(root).create('x.txt', {});
  await writeBytes(await E(openFile).write(0n), utf8('ab'));
  const bytesReader = await E(openFile).read(10n, 4n);
  const bytes = await collectBytes(bytesReader);
  t.is(bytes.length, 0);
});

test('write extends file content; getAttrs.size reflects it', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const openFile = await E(root).create('x.txt', {});
  // Two chunks through one writer: drive the iterator explicitly so
  // we don't close after the first chunk.
  const writer = iterateBytesWriter(await E(openFile).write(0n));
  await writer.next(utf8('first '));
  await writer.next(utf8('second'));
  await writer.return();

  const file = await E(root).lookup('x.txt');
  const attrs = await E(file).getAttrs();
  t.is(attrs.size, 12n);
});

test('truncate shrinks and grows', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const openFile = await E(root).create('x', {});
  await writeBytes(await E(openFile).write(0n), utf8('abcdef'));

  await E(openFile).truncate(3n);
  const a = await collectBytes(await E(openFile).read(0n, 64n));
  t.is(fromUtf8(a), 'abc');

  await E(openFile).truncate(5n);
  const b = await collectBytes(await E(openFile).read(0n, 64n));
  t.is(b.length, 5);
  t.is(fromUtf8(b.subarray(0, 3)), 'abc');
});

test('unlink removes a file; subsequent lookup is ENOENT', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const opened = await E(root).create('doomed', {});
  await E(opened).close();
  await E(root).unlink('doomed');
  await t.throwsAsync(() => E(root).lookup('doomed'), {
    message: /ENOENT/,
  });
});

test('unlink on non-empty directory is ENOTEMPTY', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const sub = await E(root).mkdir('sub', {});
  const child = await E(sub).create('child', {});
  await E(child).close();
  await t.throwsAsync(() => E(root).unlink('sub'), {
    message: /ENOTEMPTY/,
  });
  // Empty the directory; now unlink succeeds.
  await E(sub).unlink('child');
  await E(root).unlink('sub');
  await t.throwsAsync(() => E(root).lookup('sub'), {
    message: /ENOENT/,
  });
});

test('rename within the same parent', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const opened = await E(root).create('a', {});
  await writeBytes(await E(opened).write(0n), utf8('hi'));
  await E(opened).close();
  await E(root).rename('a', root, 'b');
  await t.throwsAsync(() => E(root).lookup('a'), { message: /ENOENT/ });
  const b = await E(root).lookup('b');
  const oh = await E(b).open({ read: true });
  const bytes = await collectBytes(await E(oh).read(0n, 64n));
  t.is(fromUtf8(bytes), 'hi');
});

test('rename across parents', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const subA = await E(root).mkdir('a', {});
  const subB = await E(root).mkdir('b', {});
  const f = await E(subA).create('thing', {});
  await writeBytes(await E(f).write(0n), utf8('payload'));
  await E(f).close();
  await E(subA).rename('thing', subB, 'thing');
  await t.throwsAsync(() => E(subA).lookup('thing'), { message: /ENOENT/ });
  const moved = await E(subB).lookup('thing');
  const oh = await E(moved).open({ read: true });
  const bytes = await collectBytes(await E(oh).read(0n, 64n));
  t.is(fromUtf8(bytes), 'payload');
});

test('mutating verbs reject names containing path separators or reserved values', async t => {
  // assertChildName is now applied uniformly across in-memory,
  // node-fs, and from-mount. The names `/`, `.`, `..`, NUL, and the
  // empty string are rejected on every mutating verb.
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await t.throwsAsync(() => E(root).create('foo/bar', {}), { message: /EINVAL/ });
  await t.throwsAsync(() => E(root).mkdir('.', {}), { message: /reserved/ });
  await t.throwsAsync(() => E(root).mkdir('..', {}), { message: /reserved/ });
  await t.throwsAsync(() => E(root).unlink(''), { message: /EINVAL/ });
  await t.throwsAsync(() => E(root).lookup('a\0b'), { message: /separator/ });
});

test('lookup permission-style absence is ENOENT (not a distinct error)', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const err = await t.throwsAsync(() => E(root).lookup('missing'));
  t.regex(err.message, /ENOENT/);
});

test('setAttrs rejects owner updates (PosixFs territory)', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const file = await E(root).create('x', {});
  await E(file).close();
  const f = await E(root).lookup('x');
  await t.throwsAsync(
    () => E(f).setAttrs({ owner: { uid: 1000n, gid: 1000n } }),
    { message: /PosixFs/ },
  );
});

test('xattrs round-trip user-namespace metadata', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const file = await E(root).create('x', {});
  await E(file).close();
  const f = await E(root).lookup('x');
  const xattrs = await E(f).xattrs();

  // Set
  await writeBytes(
    await E(xattrs).set('user.tag', { existence: 'create' }),
    utf8('hello'),
  );

  // Get
  const r = await E(xattrs).get('user.tag');
  const bytes = await collectBytes(r);
  t.is(fromUtf8(bytes), 'hello');

  // List
  const names = await collectStream(await E(xattrs).list());
  t.deepEqual(names, ['user.tag']);

  // Remove
  await E(xattrs).remove('user.tag');
  await t.throwsAsync(() => E(xattrs).get('user.tag'), {
    message: /ENODATA/,
  });
});

test('Filesystem.statfs returns size totals', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const f = await E(root).create('x', {});
  await writeBytes(await E(f).write(0n), utf8('abcdef'));
  await E(f).close();
  const stats = await E(fs).statfs();
  t.is(stats.totalBytes, 6n);
  t.is(typeof stats.freeBytes, 'bigint');
});

// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { encodeBase64, decodeBase64 } from '@endo/base64';

import { makeInMemoryFilesystem } from '../src/in-memory.js';

const collectStream = async readerRef => {
  const out = [];
  while (true) {
    const { done, value } = await E(readerRef).next();
    if (done) return out;
    out.push(value);
  }
};

/**
 * Drain a BytesReader (yielding base64 strings) into a single
 * `Uint8Array`. Tests decode here so the assertions can compare
 * against expected bytes / UTF-8 directly.
 */
const collectBytes = async readerRef => {
  const chunks = await collectStream(readerRef);
  const decoded = chunks.map(c => decodeBase64(c));
  let total = 0;
  for (const c of decoded) total += c.length;
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of decoded) {
    buf.set(c, off);
    off += c.length;
  }
  return buf;
};

/**
 * Push bytes into a BytesWriter, base64-encoding each chunk.
 */
const writeBytes = async (writerRef, bytes) => {
  await E(writerRef).write(encodeBase64(bytes));
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

  const writer = await E(openFile).write(0n);
  await writeBytes(writer, utf8('hello, world\n'));
  await E(writer).close();

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
  const writer = await E(openFile).write(0n);
  await writeBytes(writer, utf8('ab'));
  await E(writer).close();
  const bytesReader = await E(openFile).read(10n, 4n);
  const bytes = await collectBytes(bytesReader);
  t.is(bytes.length, 0);
});

test('write extends file content; getAttrs.size reflects it', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const openFile = await E(root).create('x.txt', {});
  const writer = await E(openFile).write(0n);
  await writeBytes(writer, utf8('first '));
  await writeBytes(writer, utf8('second'));
  await E(writer).close();

  const file = await E(root).lookup('x.txt');
  const attrs = await E(file).getAttrs();
  t.is(attrs.size, 12n);
});

test('truncate shrinks and grows', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const openFile = await E(root).create('x', {});
  const w = await E(openFile).write(0n);
  await writeBytes(w, utf8('abcdef'));
  await E(w).close();

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
  const bytes = await collectBytes(
    await E(await E(b).open({ read: true })).read(0n, 64n),
  );
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
  const bytes = await collectBytes(
    await E(await E(moved).open({ read: true })).read(0n, 64n),
  );
  t.is(fromUtf8(bytes), 'payload');
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
  const w = await E(xattrs).set('user.tag', { existence: 'create' });
  await writeBytes(w, utf8('hello'));
  await E(w).close();

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

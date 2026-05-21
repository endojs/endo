// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * readOnly attenuator tests (F10, DESIGN.md §8.1 / §8.6).
 *
 * Wraps any Filesystem; rejects mutating methods with EACCES; read
 * paths pass through. Tree shape preserved: lookup of a Directory
 * yields a read-only Directory, lookup of a File yields a read-only
 * File.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';
import { readOnly } from '../src/readonly.js';

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

const populate = async () => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const opened = await E(root).create('hello.txt', {});
  await writeBytes(await E(opened).write(0n), utf8('hi'));
  await E(opened).close();
  await E(root).mkdir('sub', {});
  return fs;
};

test('read-through: lookup + read works through readOnly', async t => {
  const fs = await populate();
  const ro = readOnly(fs);
  const root = await E(ro).root();
  const file = await E(root).lookup('hello.txt');
  const oh = await E(file).open({ read: true });
  const bytes = await collectBytes(await E(oh).read(0n, 64n));
  t.is(fromUtf8(bytes), 'hi');
});

test('mutating methods on Directory reject with EACCES', async t => {
  const fs = await populate();
  const ro = readOnly(fs);
  const root = await E(ro).root();
  await t.throwsAsync(() => E(root).create('new', {}), { message: /EACCES/ });
  await t.throwsAsync(() => E(root).mkdir('new', {}), { message: /EACCES/ });
  await t.throwsAsync(() => E(root).unlink('hello.txt'), {
    message: /EACCES/,
  });
  await t.throwsAsync(() => E(root).rename('hello.txt', root, 'b'), {
    message: /EACCES/,
  });
  await t.throwsAsync(() => E(root).fsync(), { message: /EACCES/ });
  await t.throwsAsync(() => E(root).setAttrs({ mtime: 0n }), {
    message: /EACCES/,
  });
});

test('File.open with write|append|truncate rejects', async t => {
  const fs = await populate();
  const ro = readOnly(fs);
  const root = await E(ro).root();
  const file = await E(root).lookup('hello.txt');
  await t.throwsAsync(() => E(file).open({ write: true }), {
    message: /EACCES/,
  });
  await t.throwsAsync(() => E(file).open({ append: true }), {
    message: /EACCES/,
  });
  await t.throwsAsync(() => E(file).open({ truncate: true }), {
    message: /EACCES/,
  });
});

test('OpenFile.write / truncate / lock / fsync reject', async t => {
  const fs = await populate();
  const ro = readOnly(fs);
  const root = await E(ro).root();
  const file = await E(root).lookup('hello.txt');
  const oh = await E(file).open({ read: true });
  await t.throwsAsync(() => E(oh).write(0n), { message: /EACCES/ });
  await t.throwsAsync(() => E(oh).truncate(0n), { message: /EACCES/ });
  await t.throwsAsync(
    () => E(oh).lock({ type: 'exclusive', start: 0n, length: 0n }),
    { message: /EACCES/ },
  );
  await t.throwsAsync(() => E(oh).fsync({}), { message: /EACCES/ });
});

test('Xattrs.set / remove reject; get / list pass through', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const opened = await E(root).create('x', {});
  await E(opened).close();
  const file = await E(root).lookup('x');
  // Pre-populate one xattr on the writable FS.
  const wXattrs = await E(file).xattrs();
  await writeBytes(
    await E(wXattrs).set('user.tag', { existence: 'create' }),
    utf8('v'),
  );

  const ro = readOnly(fs);
  const rRoot = await E(ro).root();
  const rFile = await E(rRoot).lookup('x');
  const rXattrs = await E(rFile).xattrs();

  // read-through:
  const bytes = await collectBytes(await E(rXattrs).get('user.tag'));
  t.is(fromUtf8(bytes), 'v');
  const names = await collectStream(await E(rXattrs).list());
  t.deepEqual(names, ['user.tag']);

  await t.throwsAsync(
    () => E(rXattrs).set('user.tag', { existence: 'replace' }),
    { message: /EACCES/ },
  );
  await t.throwsAsync(() => E(rXattrs).remove('user.tag'), {
    message: /EACCES/,
  });
});

test('Directory.list reads through unchanged', async t => {
  const fs = await populate();
  const ro = readOnly(fs);
  const root = await E(ro).root();
  const cursor = await E(root).list();
  const entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries.map(e => e.name).sort(), ['hello.txt', 'sub']);
});

test('lookup returns a read-only subtype that still rejects mutations', async t => {
  const fs = await populate();
  const ro = readOnly(fs);
  const root = await E(ro).root();
  const sub = await E(root).lookup('sub');
  await t.throwsAsync(() => E(sub).mkdir('nope', {}), { message: /EACCES/ });
});

test('Filesystem.statfs passes through', async t => {
  const fs = await populate();
  const ro = readOnly(fs);
  const stats = await E(ro).statfs();
  t.is(typeof stats.totalBytes, 'bigint');
});

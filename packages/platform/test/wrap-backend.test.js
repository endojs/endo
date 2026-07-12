// @ts-nocheck
/* eslint-disable no-await-in-loop */
/**
 * End-to-end tests for `wrapBackend(makeInMemoryBackend())` — the new
 * three-layer architecture (FsBackend → wrapBackend → porcelain).
 *
 * The wire shapes mirror the existing `Filesystem` exo surface
 * (`PassableBytesReader`/`Writer` for byte transit since CapTP can't
 * marshal raw `Uint8Array`). The new ergonomics are:
 * - `File.read(opts?) → PassableBytesReader` — one-shot, no open ceremony
 * - `File.write(opts?) → PassableBytesWriter` — one-shot, whole-file overwrite
 * - `Cursor.read(limit?)` / `Cursor.toArray()` — paged + drain helpers
 * - `walk(root, path)` — pipelined multi-segment lookup
 * - `Directory.remove` / `Directory.makeDirectory` — renames; legacy
 *   `unlink` / `mkdir` still work
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { wrapBackend } from '../src/fs/extended/wrap-backend.js';
import { makeInMemoryBackend } from '../src/fs/extended/backends/in-memory-backend.js';
import {
  walk,
  collectBytes,
  collectStream,
} from '../src/fs/extended/helpers.js';

const utf8 = s => new TextEncoder().encode(s);
const fromUtf8 = b => new TextDecoder().decode(b);

const drainReader = async readerRef => {
  const chunks = [];
  let total = 0;
  for await (const c of iterateBytesReader(readerRef)) {
    chunks.push(c);
    total += c.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
};

const pushBytes = async (writerRef, bytes) => {
  const writer = iterateBytesWriter(writerRef);
  await writer.next(bytes);
  await writer.return();
};

const makeFs = () => wrapBackend(makeInMemoryBackend());

// ---------- Basic structure ----------

test('Filesystem.root returns a Directory', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  t.truthy(root);
  const qid = await E(root).getQid();
  t.is(qid.type, 'directory');
  t.is(typeof qid.pathId, 'bigint');
});

test('makeDirectory + lookup round-trip', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const subdir = await E(root).makeDirectory('sub', {});
  const looked = await E(root).lookup('sub');
  const subQid = await E(subdir).getQid();
  const lookedQid = await E(looked).getQid();
  t.is(lookedQid.pathId, subQid.pathId);
});

test('legacy mkdir alias works', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const dir = await E(root).mkdir('legacy', {});
  const qid = await E(dir).getQid();
  t.is(qid.type, 'directory');
});

// ---------- OpenFile I/O (reader/writer wire shape) ----------

test('OpenFile.write + read round-trips bytes', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const oh = await E(root).create('hello.txt', { write: true });
  const writer = await E(oh).write(0n);
  await pushBytes(writer, utf8('hello world'));
  await E(oh).close();

  const file = await E(root).lookup('hello.txt');
  const oh2 = await E(file).open({ read: true });
  const reader = await E(oh2).read(0n, 11n);
  const bytes = await drainReader(reader);
  await E(oh2).close();
  t.is(fromUtf8(bytes), 'hello world');
});

test('OpenFile.write at offset is pwrite-shaped (no truncate of tail)', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const oh = await E(root).create('c.txt', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('AAAAAAAAAA'));
  await pushBytes(await E(oh).write(2n), utf8('BBB'));
  await E(oh).close();

  const file = await E(root).lookup('c.txt');
  const oh2 = await E(file).open({ read: true });
  const reader = await E(oh2).read(0n, 10n);
  const bytes = await drainReader(reader);
  await E(oh2).close();
  t.is(fromUtf8(bytes), 'AABBBAAAAA');
});

// ---------- File.read / File.write (one-shot porcelain) ----------

test('File.read returns a PassableBytesReader over whole file', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const oh = await E(root).create('one-shot.txt', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('quick read'));
  await E(oh).close();

  const file = await E(root).lookup('one-shot.txt');
  const reader = await E(file).read();
  const bytes = await drainReader(reader);
  t.is(fromUtf8(bytes), 'quick read');
});

test('File.read({offset, length}) returns a bounded slice', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const oh = await E(root).create('slice.txt', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('0123456789'));
  await E(oh).close();

  const file = await E(root).lookup('slice.txt');
  const reader = await E(file).read({ offset: 2n, length: 4n });
  const bytes = await drainReader(reader);
  t.is(fromUtf8(bytes), '2345');
});

test('File.write() overwrites whole file (truncates tail)', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const oh = await E(root).create('w.txt', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('LONG ORIGINAL CONTENT'));
  await E(oh).close();

  const file = await E(root).lookup('w.txt');
  await pushBytes(await E(file).write(), utf8('short'));

  const reader = await E(file).read();
  const bytes = await drainReader(reader);
  t.is(fromUtf8(bytes), 'short');
});

// ---------- Cursor (paged + drain + stream) ----------

test('Cursor.read returns a bounded page', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  for (let i = 0; i < 5; i += 1) {
    await E(root)
      .create(`f${i}.txt`, { write: true })
      .then(oh => E(oh).close());
  }
  const cursor = await E(root).list();
  const page = await E(cursor).read(3n);
  t.is(page.entries.length, 3);
  t.false(page.atEnd);
  const page2 = await E(cursor).read(10n);
  t.is(page2.entries.length, 2);
  t.true(page2.atEnd);
});

test('Cursor.toArray drains the whole listing', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  for (let i = 0; i < 4; i += 1) {
    await E(root)
      .create(`g${i}.txt`, { write: true })
      .then(oh => E(oh).close());
  }
  const cursor = await E(root).list();
  const all = await E(cursor).toArray();
  t.is(all.length, 4);
  t.deepEqual(all.map(e => e.name).sort(), [
    'g0.txt',
    'g1.txt',
    'g2.txt',
    'g3.txt',
  ]);
  for (const e of all) t.is(e.kind, 'file');
});

test('Cursor.stream is a PassableReader<DirEntry>', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  await E(root)
    .create('h.txt', { write: true })
    .then(oh => E(oh).close());
  await E(root).makeDirectory('d', {});

  const cursor = await E(root).list();
  const reader = await E(cursor).stream();
  const entries = [];
  for await (const entry of iterateReader(reader)) {
    entries.push(entry);
  }
  t.is(entries.length, 2);
  t.deepEqual(entries.map(e => `${e.kind}:${e.name}`).sort(), [
    'directory:d',
    'file:h.txt',
  ]);
});

// ---------- walk porcelain ----------

test('walk drills through nested directories', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const a = await E(root).makeDirectory('a', {});
  const b = await E(a).makeDirectory('b', {});
  const oh = await E(b).create('c.txt', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('deep'));
  await E(oh).close();

  const cap = await walk(root, ['a', 'b', 'c.txt']);
  const reader = await E(cap).read();
  const bytes = await drainReader(reader);
  t.is(fromUtf8(bytes), 'deep');
});

test('walk + File.read pipelines (single await)', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const d = await E(root).makeDirectory('etc', {});
  const oh = await E(d).create('hosts', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('127.0.0.1 localhost\n'));
  await E(oh).close();

  // The chain: walk → File.read → drain. The first three calls
  // (two lookups + a read) pipeline into one CapTP batch.
  const reader = await E(walk(root, ['etc', 'hosts'])).read();
  const bytes = await drainReader(reader);
  t.is(fromUtf8(bytes), '127.0.0.1 localhost\n');
});

// ---------- remove (new) and unlink (legacy) ----------

test('Directory.remove deletes a file', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  await E(root)
    .create('to-go.txt', { write: true })
    .then(oh => E(oh).close());
  await E(root).remove('to-go.txt');
  await t.throwsAsync(E(root).lookup('to-go.txt'), { message: /ENOENT/ });
});

test('legacy unlink alias still works', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  await E(root)
    .create('legacy.txt', { write: true })
    .then(oh => E(oh).close());
  await E(root).unlink('legacy.txt');
  await t.throwsAsync(E(root).lookup('legacy.txt'), { message: /ENOENT/ });
});

// ---------- getStat / setStat (new) ----------

test('File.getStat returns narrow size', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const oh = await E(root).create('s.txt', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('twelve bytes'));
  await E(oh).close();

  const file = await E(root).lookup('s.txt');
  const stat = await E(file).getStat();
  t.is(stat.size, 12n);
});

test('File.setStat({size}) truncates and grows', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const oh = await E(root).create('grow.txt', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('hello'));
  await E(oh).close();

  const file = await E(root).lookup('grow.txt');
  await E(file).setStat({ size: 10n });
  const s1 = await E(file).getStat();
  t.is(s1.size, 10n);

  await E(file).setStat({ size: 3n });
  const s2 = await E(file).getStat();
  t.is(s2.size, 3n);

  const reader = await E(file).read();
  const bytes = await drainReader(reader);
  t.is(fromUtf8(bytes), 'hel');
});

// ---------- Locks (vat-local advisory) ----------

test('OpenFile.lock acquires and releases an exclusive range', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const oh = await E(root).create('locked.txt', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('content'));

  const lock = await E(oh).lock({ type: 'exclusive', start: 0n, length: 0n });

  // A second exclusive lock on the same range should conflict.
  await t.throwsAsync(
    E(oh).lock({ type: 'exclusive', start: 0n, length: 0n }),
    { message: /EAGAIN/ },
  );

  await E(lock).release();
  // Now it's free again.
  const lock2 = await E(oh).lock({ type: 'exclusive', start: 0n, length: 0n });
  await E(lock2).release();
  await E(oh).close();
});

// ---------- collectBytes / collectStream helpers ----------

test('collectBytes drains an OpenFile.read result', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const oh = await E(root).create('big.bin', { write: true });
  await pushBytes(await E(oh).write(0n), utf8('streaming content'));
  await E(oh).close();

  const file = await E(root).lookup('big.bin');
  const oh2 = await E(file).open({ read: true });
  const reader = await E(oh2).read(0n, 17n);
  // collectBytes uses iterateBytesReader from @endo/exo-stream to
  // decode the base64-encoded chunks the wire emits.
  const bytes = await collectBytes(reader);
  await E(oh2).close();
  t.is(fromUtf8(bytes), 'streaming content');
});

test('collectStream drains a Cursor.stream', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  await E(root)
    .create('p.txt', { write: true })
    .then(oh => E(oh).close());
  await E(root)
    .create('q.txt', { write: true })
    .then(oh => E(oh).close());

  const cursor = await E(root).list();
  const reader = await E(cursor).stream();
  const entries = await collectStream(reader);
  t.is(entries.length, 2);
});

// ---------- Catalog naming crossover (fs-interface-reconciliation) ----------

test('lookup resolves a path array in one call (string | string[])', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const a = await E(root).makeDirectory('a', {});
  const b = await E(a).makeDirectory('b', {});
  const bQid = await E(b).getQid();

  // Path-array form, matching @endo/platform/fs and the daemon's
  // EndoDirectory calling convention.
  const walked = await E(root).lookup(['a', 'b']);
  const walkedQid = await E(walked).getQid();
  t.is(walkedQid.type, 'directory');
  t.is(walkedQid.pathId, bQid.pathId);

  // Single-name form resolves the same as a one-element array.
  const aById = await E(root).lookup('a');
  const aByArr = await E(root).lookup(['a']);
  t.is((await E(aById).getQid()).pathId, (await E(aByArr).getQid()).pathId);
});

test('lookup of a missing path-array throws ENOENT', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  await E(root).makeDirectory('a', {});
  await t.throwsAsync(() => E(root).lookup(['a', 'nope']), {
    message: /ENOENT/,
  });
});

test('lookupStep resolves a single segment like one-arg lookup', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const a = await E(root).makeDirectory('a', {});
  const aQid = await E(a).getQid();
  const stepped = await E(root).lookupStep('a');
  t.is((await E(stepped).getQid()).pathId, aQid.pathId);
  // lookupStep('a') and lookup('a') resolve the same node.
  const looked = await E(root).lookup('a');
  t.is((await E(stepped).getQid()).pathId, (await E(looked).getQid()).pathId);
});

test('subView returns a confined directory; rejects non-directories', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const a = await E(root).makeDirectory('a', {});
  await E(a).makeDirectory('b', {});

  const view = await E(root).subView(['a', 'b']);
  t.is((await E(view).getQid()).type, 'directory');

  await E(root).write('file.txt', 'x');
  await t.throwsAsync(() => E(root).subView('file.txt'), {
    message: /ENOTDIR/,
  });
});

test('Directory.write writes a whole blob and truncates on overwrite', async t => {
  const fs = makeFs();
  const root = await E(fs).root();

  await E(root).write('w.txt', 'hello world');
  const f1 = await E(root).lookup('w.txt');
  const r1 = await E(await E(f1).open({ read: true })).read(0n, 11n);
  t.is(fromUtf8(await drainReader(r1)), 'hello world');

  // Overwriting with a shorter value truncates the tail.
  await E(root).write('w.txt', 'hi');
  const f2 = await E(root).lookup('w.txt');
  const oh2 = await E(f2).open({ read: true });
  const r2 = await E(oh2).read(0n, 64n);
  t.is(fromUtf8(await drainReader(r2)), 'hi');
});

test('move relocates an entry via path-to-path (from, to)', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  await E(root).write('src.txt', 'payload');
  await E(root).makeDirectory('dst', {});

  // Catalog form: both args are name | path, relative to this dir.
  await E(root).move('src.txt', ['dst', 'moved.txt']);

  await t.throwsAsync(() => E(root).lookup('src.txt'), { message: /ENOENT/ });
  const moved = await E(root).lookup(['dst', 'moved.txt']);
  const r = await E(await E(moved).open({ read: true })).read(0n, 7n);
  t.is(fromUtf8(await drainReader(r)), 'payload');
});

test('move within the same directory renames in place', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  await E(root).write('a.txt', 'data');
  await E(root).move('a.txt', 'b.txt');
  await t.throwsAsync(() => E(root).lookup('a.txt'), { message: /ENOENT/ });
  const b = await E(root).lookup('b.txt');
  const r = await E(await E(b).open({ read: true })).read(0n, 4n);
  t.is(fromUtf8(await drainReader(r)), 'data');
});

test('copy duplicates a file path-to-path, leaving the source', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  await E(root).write('src.txt', 'payload');
  await E(root).makeDirectory('dst', {});

  await E(root).copy('src.txt', ['dst', 'dup.txt']);

  // Source survives.
  const src = await E(root).lookup('src.txt');
  t.is(
    fromUtf8(
      await drainReader(
        await E(await E(src).open({ read: true })).read(0n, 7n),
      ),
    ),
    'payload',
  );
  // Destination is a faithful copy.
  const dup = await E(root).lookup(['dst', 'dup.txt']);
  t.is(
    fromUtf8(
      await drainReader(
        await E(await E(dup).open({ read: true })).read(0n, 7n),
      ),
    ),
    'payload',
  );
});

test('copy recursively duplicates a directory subtree', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const a = await E(root).makeDirectory('a', {});
  await E(a).write('f.txt', 'leaf');
  const sub = await E(a).makeDirectory('sub', {});
  await E(sub).write('g.txt', 'deep');

  await E(root).copy('a', 'b');

  // Whole subtree copied.
  const bf = await E(root).lookup(['b', 'f.txt']);
  t.is(
    fromUtf8(
      await drainReader(await E(await E(bf).open({ read: true })).read(0n, 4n)),
    ),
    'leaf',
  );
  const bg = await E(root).lookup(['b', 'sub', 'g.txt']);
  t.is(
    fromUtf8(
      await drainReader(await E(await E(bg).open({ read: true })).read(0n, 4n)),
    ),
    'deep',
  );
  // Source intact.
  t.is((await E(await E(root).lookup('a')).getQid()).type, 'directory');
});

test('copy duplicates a binary file byte-for-byte', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  // Includes NUL and high bytes that a text round-trip would corrupt.
  const bin = new Uint8Array([0, 1, 2, 255, 254, 0, 128, 13, 10]);
  const oh = await E(root).create('b.bin', { write: true });
  await pushBytes(await E(oh).write(0n), bin);
  await E(oh).close();

  await E(root).copy('b.bin', 'c.bin');

  const copied = await E(root).lookup('c.bin');
  const got = await drainReader(
    await E(await E(copied).open({ read: true })).read(0n, BigInt(bin.length)),
  );
  t.deepEqual([...got], [...bin]);
});

test('copy into its own descendant is rejected (no infinite recursion)', async t => {
  t.timeout(15_000);
  const fs = makeFs();
  const root = await E(fs).root();
  const a = await E(root).makeDirectory('a', {});
  await E(a).write('f.txt', 'leaf');

  await t.throwsAsync(() => E(root).copy('a', ['a', 'b']), {
    message: /descendant/,
  });
});

test('copy onto an existing directory merges (does not replace)', async t => {
  const fs = makeFs();
  const root = await E(fs).root();
  const a = await E(root).makeDirectory('a', {});
  await E(a).write('from-src.txt', 'src');
  const b = await E(root).makeDirectory('b', {});
  await E(b).write('keep.txt', 'kept');

  await E(root).copy('a', 'b');

  // Contract: copy merges into an existing destination dir, overwriting
  // same-named files and leaving disjoint ones.
  const kept = await E(root).lookup(['b', 'keep.txt']);
  t.is(
    fromUtf8(
      await drainReader(
        await E(await E(kept).open({ read: true })).read(0n, 4n),
      ),
    ),
    'kept',
  );
  const merged = await E(root).lookup(['b', 'from-src.txt']);
  t.is((await E(merged).getQid()).type, 'file');
});

// ---------- content-address hooks: qidFor / blobInfoFor ----------

// A minimal read-only backend whose two paths point at one "blob" (a
// stand-in for a git object OID). It advertises the optional content-
// address hooks so wrapBackend sources QID pathIds and BlobRef hashes
// from the OID instead of the path hash / SHA-256 defaults.
const OID_BLOB = 'ab'.repeat(20); // 40 hex chars, like a git sha1
const OID_TREE = 'cd'.repeat(20);
const makeHookedBackend = () => {
  const files = new Map([
    ['x.txt', utf8('same content\n')],
    ['y.txt', utf8('same content\n')],
  ]);
  const entryFor = path => {
    if (path.length === 0) return { kind: 'directory', oid: OID_TREE };
    const bytes = files.get(path.join('/'));
    return bytes === undefined ? undefined : { kind: 'file', oid: OID_BLOB, bytes };
  };
  return harden({
    async kind(path) {
      const e = entryFor(path);
      return e === undefined ? undefined : e.kind;
    },
    async *list(dirPath) {
      if (dirPath.length !== 0) return;
      for (const name of files.keys()) yield harden({ name, kind: 'file' });
    },
    async read(path) {
      const e = entryFor(path);
      return e !== undefined && e.kind === 'file' ? e.bytes : new Uint8Array(0);
    },
    async write() {
      throw Error('EROFS');
    },
    async makeDirectory() {
      throw Error('EROFS');
    },
    async remove() {
      throw Error('EROFS');
    },
    qidFor(path, kind) {
      const e = entryFor(path);
      if (e === undefined) return undefined;
      return harden({ type: kind, pathId: BigInt(`0x${e.oid}`), version: 0n });
    },
    blobInfoFor(path) {
      const e = entryFor(path);
      if (e === undefined || e.kind !== 'file') return undefined;
      return harden({ algorithm: 'git-sha1', hash: e.oid });
    },
  });
};

test('wrapBackend: qidFor hook sources QID pathId from the backend OID', async t => {
  const fs = wrapBackend(makeHookedBackend());
  const root = await E(fs).root();

  const rootQid = await E(root).getQid();
  t.is(rootQid.type, 'directory');
  t.is(rootQid.pathId, BigInt(`0x${OID_TREE}`));
  t.is(rootQid.version, 0n);

  // Two distinct paths onto one blob → one QID pathId.
  const x = await E(root).lookup('x.txt');
  const y = await E(root).lookup('y.txt');
  const xQid = await E(x).getQid();
  const yQid = await E(y).getQid();
  t.is(xQid.pathId, BigInt(`0x${OID_BLOB}`));
  t.is(xQid.pathId, yQid.pathId);
});

test('wrapBackend: blobInfoFor hook sets BlobRef algorithm + hash', async t => {
  const fs = wrapBackend(makeHookedBackend());
  const root = await E(fs).root();
  const x = await E(root).lookup('x.txt');
  const y = await E(root).lookup('y.txt');

  const xInfo = await E(await E(x).snapshot()).getInfo();
  const yInfo = await E(await E(y).snapshot()).getInfo();
  t.is(xInfo.algorithm, 'git-sha1');
  t.is(xInfo.hash, OID_BLOB);
  t.is(xInfo.size, BigInt('same content\n'.length));
  // Same blob → same BlobRef hash across paths.
  t.is(xInfo.hash, yInfo.hash);
});

test('wrapBackend: without hooks, QID + BlobRef fall back to path hash / sha256', async t => {
  // The plain in-memory backend advertises neither hook, so identity
  // degrades to the path-hash synthQid and SHA-256 BlobRef — two paths
  // with identical content get DIFFERENT QIDs (path identity).
  const fs = makeFs();
  const root = await E(fs).root();
  await E(root).write('x.txt', 'same content\n');
  await E(root).write('y.txt', 'same content\n');
  const x = await E(root).lookup('x.txt');
  const y = await E(root).lookup('y.txt');
  const xQid = await E(x).getQid();
  const yQid = await E(y).getQid();
  t.not(xQid.pathId, yQid.pathId, 'path-hash QID distinguishes the two paths');

  const info = await E(await E(x).snapshot()).getInfo();
  t.is(info.algorithm, 'sha256');
});

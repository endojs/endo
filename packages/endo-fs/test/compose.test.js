// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Composition primitive tests (F11/F13).
 *
 *   emptyFilesystem, chroot, bind, namespace, compose
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';
import { readOnly } from '../src/readonly.js';
import {
  emptyFilesystem,
  chroot,
  bind,
  namespace,
  compose,
} from '../src/compose.js';

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
  for await (const v of iterateReader(readerRef)) {
    out.push(v);
  }
  return out;
};

const writeFile = async (root, name, text) => {
  const opened = await E(root).create(name, {});
  await writeBytes(await E(opened).write(0n), utf8(text));
  await E(opened).close();
};

const readFile = async (root, name) => {
  const file = await E(root).lookup(name);
  const oh = await E(file).open({ read: true });
  const bytes = await collectBytes(await E(oh).read(0n, 4096n));
  return fromUtf8(bytes);
};

// ---------- emptyFilesystem ----------

test('emptyFilesystem has an empty Directory', async t => {
  const fs = emptyFilesystem();
  const root = await E(fs).root();
  const cursor = await E(root).list();
  const entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries, []);
});

test('emptyFilesystem rejects mutations', async t => {
  const fs = emptyFilesystem();
  const root = await E(fs).root();
  await t.throwsAsync(() => E(root).create('x', {}), { message: /ENOSYS/ });
  await t.throwsAsync(() => E(root).mkdir('x', {}), { message: /ENOSYS/ });
  await t.throwsAsync(() => E(root).lookup('x'), { message: /ENOENT/ });
});

// ---------- chroot ----------

test('chroot presents a subtree as root', async t => {
  const inner = makeInMemoryFilesystem();
  const innerRoot = await E(inner).root();
  await E(innerRoot).mkdir('home', {});
  const home = await E(innerRoot).lookup('home');
  await E(home).mkdir('user', {});
  const user = await E(home).lookup('user');
  await writeFile(user, 'note.txt', 'hello');

  const fs = chroot(inner, ['home', 'user']);
  const root = await E(fs).root();
  t.is(await readFile(root, 'note.txt'), 'hello');
});

test('chroot rejects invalid path segments', async t => {
  const inner = makeInMemoryFilesystem();
  t.throws(() => chroot(inner, ['..']), { message: /chroot/ });
  t.throws(() => chroot(inner, ['a/b']), { message: /chroot/ });
});

test('chroot errors if the target is a file', async t => {
  const inner = makeInMemoryFilesystem();
  const innerRoot = await E(inner).root();
  await writeFile(innerRoot, 'file', 'hi');
  const bad = chroot(inner, ['file']);
  await t.throwsAsync(() => E(bad).root(), { message: /ENOTDIR/ });
});

// ---------- bind ----------

test('bind grafts guest at mountPath', async t => {
  const host = makeInMemoryFilesystem();
  const guest = makeInMemoryFilesystem();
  const hostRoot = await E(host).root();
  // POSIX-bind-mount semantics: the host must already have the
  // mount point as a directory.
  await E(hostRoot).mkdir('mnt', {});
  await E(hostRoot).mkdir('host-dir', {});
  await writeFile(hostRoot, 'host-file', 'host');
  const guestRoot = await E(guest).root();
  await writeFile(guestRoot, 'guest-file', 'guest');

  const fs = bind(host, ['mnt'], guest);
  const root = await E(fs).root();
  // host-* entries still visible at root.
  t.is(await readFile(root, 'host-file'), 'host');
  // mnt resolves to guest root; guest-file is reachable.
  const mnt = await E(root).lookup('mnt');
  t.is(await readFile(mnt, 'guest-file'), 'guest');
});

test('bind rejects when host == guest (cycle)', async t => {
  const host = makeInMemoryFilesystem();
  t.throws(() => bind(host, ['mnt'], host), { message: /cycle/ });
});

test('bind rejects mkdir/unlink/rename of the mount name', async t => {
  const host = makeInMemoryFilesystem();
  const guest = makeInMemoryFilesystem();
  const hostRoot = await E(host).root();
  await E(hostRoot).mkdir('mnt', {});
  const fs = bind(host, ['mnt'], guest);
  const root = await E(fs).root();
  await t.throwsAsync(() => E(root).mkdir('mnt', {}), { message: /EBUSY/ });
  await t.throwsAsync(() => E(root).unlink('mnt'), { message: /EBUSY/ });
});

// ---------- namespace ----------

test('namespace exposes named children as mount points', async t => {
  const a = makeInMemoryFilesystem();
  const b = makeInMemoryFilesystem();
  const aRoot = await E(a).root();
  const bRoot = await E(b).root();
  await writeFile(aRoot, 'a-file', 'A');
  await writeFile(bRoot, 'b-file', 'B');
  const fs = namespace({ a, b });
  const root = await E(fs).root();

  const subA = await E(root).lookup('a');
  const subB = await E(root).lookup('b');
  t.is(await readFile(subA, 'a-file'), 'A');
  t.is(await readFile(subB, 'b-file'), 'B');

  const cursor = await E(root).list();
  const entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries.map(e => e.name).sort(), ['a', 'b']);
});

test('namespace cycle detection', async t => {
  const a = makeInMemoryFilesystem();
  // Two slots pointing at the same cap.
  t.throws(() => namespace({ a, again: a }), { message: /cycle/ });
});

test('namespace.named(viewName) returns the underlying root directly', async t => {
  const a = makeInMemoryFilesystem();
  const aRoot = await E(a).root();
  await writeFile(aRoot, 'thing', 'T');
  const fs = namespace({ a });
  const direct = await E(fs).named('a');
  t.is(await readFile(direct, 'thing'), 'T');
});

// ---------- compose (CoW) ----------

test('compose: layer entries shadow backing entries', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  const layerRoot = await E(layer).root();
  await writeFile(backingRoot, 'shared', 'backing');
  await writeFile(layerRoot, 'shared', 'layer');
  await writeFile(backingRoot, 'only-backing', 'B');
  await writeFile(layerRoot, 'only-layer', 'L');

  const cow = compose(layer, backing);
  const root = await E(cow).root();
  t.is(await readFile(root, 'shared'), 'layer');
  t.is(await readFile(root, 'only-backing'), 'B');
  t.is(await readFile(root, 'only-layer'), 'L');
});

test('compose: list merges and applies whiteouts', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'a', '');
  await writeFile(backingRoot, 'b', '');
  await writeFile(backingRoot, 'c', '');

  const cow = compose(layer, backing);
  const root = await E(cow).root();
  // Initial: all three visible.
  let cursor = await E(root).list();
  let entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries.map(e => e.name).sort(), ['a', 'b', 'c']);

  // Whiteout 'b' via the composed unlink.
  await E(root).unlink('b');
  cursor = await E(root).list();
  entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries.map(e => e.name).sort(), ['a', 'c']);

  // Subsequent lookup is ENOENT.
  await t.throwsAsync(() => E(root).lookup('b'), { message: /ENOENT/ });
});

test('compose: create + unlink + recreate round-trips', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'shared', 'backing');
  const cow = compose(layer, backing);
  const root = await E(cow).root();
  // Whiteout the backing entry via composed unlink, then re-create
  // it in the layer.
  await E(root).unlink('shared');
  await t.throwsAsync(() => E(root).lookup('shared'), { message: /ENOENT/ });
  await writeFile(root, 'shared', 'fresh');
  t.is(await readFile(root, 'shared'), 'fresh');
});

test('compose: layer cannot equal backing (cycle)', async t => {
  const a = makeInMemoryFilesystem();
  t.throws(() => compose(a, a), { message: /differ/ });
});

test('compose: setAttrs writes through layer', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'sample', 'hi');
  // Create matching layer entry so setAttrs has a target.
  const layerRoot = await E(layer).root();
  await writeFile(layerRoot, 'sample', 'hi');
  const cow = compose(layer, backing);
  const root = await E(cow).root();
  const f = await E(root).lookup('sample');
  await E(f).setAttrs({ mtime: 123_000_000n });
  // The layer's file should now reflect the new mtime.
  const layerFile = await E(layerRoot).lookup('sample');
  const attrs = await E(layerFile).getAttrs();
  t.is(attrs.mtime, 123_000_000n);
});

// ---------- composition compose ----------

test('chroot(compose(...)) and compose(chroot(...)) compose cleanly', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await E(backingRoot).mkdir('workspace', {});
  const wb = await E(backingRoot).lookup('workspace');
  await writeFile(wb, 'doc.txt', 'work');

  const cow = compose(layer, backing);
  const view = chroot(cow, ['workspace']);
  const root = await E(view).root();
  t.is(await readFile(root, 'doc.txt'), 'work');
});

test('readOnly(compose(...)) blocks writes through the composition', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'sample', 'B');
  const cow = readOnly(compose(layer, backing));
  const root = await E(cow).root();
  t.is(await readFile(root, 'sample'), 'B');
  await t.throwsAsync(() => E(root).create('new', {}), { message: /EACCES/ });
});

// ---------- copy-on-write file semantics (DESIGN.md §8.4) ----------

test('compose CoW: opening a backing-only file for write copies up — backing untouched', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'doc.txt', 'original');

  const cow = compose(layer, backing);
  const root = await E(cow).root();

  // Drive the failure mode the chat file-explorer hits: lookup
  // first (no layer entry exists yet), then open({ write: true }).
  // Before the fix this returned the backing's File cap directly,
  // so the write here would mutate the backing.
  const file = await E(root).lookup('doc.txt');
  const oh = await E(file).open({ write: true });
  await writeBytes(await E(oh).write(0n), utf8('layered!'));
  await E(oh).truncate(BigInt(utf8('layered!').length));
  await E(oh).close();

  // The composed view sees the new contents.
  t.is(await readFile(root, 'doc.txt'), 'layered!');

  // The backing must be unchanged.
  t.is(await readFile(backingRoot, 'doc.txt'), 'original');

  // The layer now holds the copy-up.
  const layerRoot = await E(layer).root();
  const cursor = await E(layerRoot).list();
  const entries = await collectStream(await E(cursor).stream());
  t.true(
    entries.some(e => e.name === 'doc.txt'),
    'layer should hold the copied-up file',
  );
});

test('compose CoW: opening a backing-only file read-only does NOT copy up', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'doc.txt', 'pristine');

  const cow = compose(layer, backing);
  const root = await E(cow).root();

  const file = await E(root).lookup('doc.txt');
  const oh = await E(file).open({ read: true });
  t.is(fromUtf8(await collectBytes(await E(oh).read(0n, 4096n))), 'pristine');
  await E(oh).close();

  // Layer should remain empty — read-only access must not trigger
  // copy-up. Otherwise every browse of a backing would balloon the
  // layer.
  const layerRoot = await E(layer).root();
  const cursor = await E(layerRoot).list();
  const entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries.map(e => e.name).sort(), []);
});

test('compose CoW: setAttrs on a backing-only file copies up before delegating', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'doc.txt', 'bytes');
  const backingFile = await E(backingRoot).lookup('doc.txt');
  const backingAttrsBefore = await E(backingFile).getAttrs();

  const cow = compose(layer, backing);
  const root = await E(cow).root();
  const file = await E(root).lookup('doc.txt');
  await E(file).setAttrs({ mtime: 4_242_000_000n });

  // Composed view reports the new mtime, backing keeps its own.
  const composedAttrs = await E(file).getAttrs();
  t.is(composedAttrs.mtime, 4_242_000_000n);
  const backingAttrsAfter = await E(backingFile).getAttrs();
  t.is(backingAttrsAfter.mtime, backingAttrsBefore.mtime);
});

test('compose CoW: xattrs.set on a backing-only file copies up; xattrs.get without write reads from backing', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'doc.txt', 'bytes');

  // Stamp an xattr on the backing file directly so the read path
  // has something to delegate.
  const backingFile = await E(backingRoot).lookup('doc.txt');
  const bxBack = await E(backingFile).xattrs();
  await writeBytes(await E(bxBack).set('user.tag', {}), utf8('first'));

  const cow = compose(layer, backing);
  const root = await E(cow).root();
  const file = await E(root).lookup('doc.txt');

  // Read before any write — should reach the backing.
  const bxRead = await E(file).xattrs();
  const got = await collectBytes(await E(bxRead).get('user.tag'));
  t.is(fromUtf8(got), 'first');

  // Mutating xattrs.set must trigger copy-up so the backing stays
  // pristine.
  const bxWrite = await E(file).xattrs();
  await writeBytes(await E(bxWrite).set('user.tag', {}), utf8('layered'));

  const layerRoot = await E(layer).root();
  const cursor = await E(layerRoot).list();
  const entries = await collectStream(await E(cursor).stream());
  t.true(
    entries.some(e => e.name === 'doc.txt'),
    'layer should hold the copied-up file after xattrs.set',
  );

  // Backing's xattr value is unchanged.
  const stillFirst = await collectBytes(await E(bxBack).get('user.tag'));
  t.is(fromUtf8(stillFirst), 'first');
});

test('compose CoW: write-then-read through the composed view sees the layer copy', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'a.txt', 'AAA');

  const cow = compose(layer, backing);
  const root = await E(cow).root();
  const file = await E(root).lookup('a.txt');
  const wh = await E(file).open({ write: true, truncate: true });
  await writeBytes(await E(wh).write(0n), utf8('zzz'));
  await E(wh).close();

  // Reading the same File cap back picks up the layer copy now
  // that we've materialised.
  const rh = await E(file).open({ read: true });
  t.is(fromUtf8(await collectBytes(await E(rh).read(0n, 4096n))), 'zzz');
  await E(rh).close();

  // A fresh lookup likewise sees the layer copy.
  t.is(await readFile(root, 'a.txt'), 'zzz');
});

test('compose CoW + Layer.diff: write to a backing-only file shows up as a layer op', async t => {
  const { makeLayer } = await import('../src/layer.js');
  const backing = makeInMemoryFilesystem();
  const layerFs = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await writeFile(backingRoot, 'doc.txt', 'pristine');

  const layer = makeLayer(layerFs, backing);
  const composed = await E(layer).asFilesystem();
  const root = await E(composed).root();

  const file = await E(root).lookup('doc.txt');
  const oh = await E(file).open({ write: true, truncate: true });
  await writeBytes(await E(oh).write(0n), utf8('overlay'));
  await E(oh).close();

  // The layer's diff must capture the change as a layer op.
  const ops = await collectStream(await E(layer).diff());
  const kinds = ops.map(o => o.kind);
  t.true(
    kinds.includes('create-file'),
    `expected create-file in ${kinds.join(',')}`,
  );
  t.true(
    kinds.includes('write-bytes'),
    `expected write-bytes in ${kinds.join(',')}`,
  );

  // And the backing remains pristine.
  t.is(await readFile(backingRoot, 'doc.txt'), 'pristine');
});

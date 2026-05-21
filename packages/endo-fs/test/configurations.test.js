// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Cross-implementation configuration tests.
 *
 * Most of the existing tests exercise each implementation in
 * isolation. This file proves the implementations compose with one
 * another — the contract from DESIGN.md §8.6 that the primitives
 * "compose with themselves: readOnly(compose(...)), compose(chroot(
 * big, ['workspace']), scratch), etc."
 */

import '@endo/init/debug.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';
import { makeNodeFilesystem } from '../src/node-fs.js';
import { readOnly } from '../src/readonly.js';
import {
  emptyFilesystem,
  chroot,
  bind,
  namespace,
  compose,
} from '../src/compose.js';
import { makeLayer } from '../src/layer.js';

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
  for await (const v of iterateReader(readerRef)) out.push(v);
  return out;
};

const writeFile = async (root, name, text) => {
  const opened = await E(root).create(name, {});
  await writeBytes(await E(opened).write(0n), utf8(text));
  await E(opened).close();
};

const readFile = async (root, name) => {
  const f = await E(root).lookup(name);
  const oh = await E(f).open({ read: true });
  return fromUtf8(await collectBytes(await E(oh).read(0n, 4096n)));
};

const setupDisk = async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'endo-fs-cfg-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  return makeNodeFilesystem({ rootPath: dir });
};

// ---------- multi-layer composition ----------

test('compose(L2, compose(L1, B)) — three-layer stack reads top-most win', async t => {
  const backing = makeInMemoryFilesystem();
  const l1 = makeInMemoryFilesystem();
  const l2 = makeInMemoryFilesystem();

  // backing: shared = "B", only-B
  await writeFile(await E(backing).root(), 'shared', 'B');
  await writeFile(await E(backing).root(), 'only-B', 'B');

  // l1: shared = "L1", only-L1
  await writeFile(await E(l1).root(), 'shared', 'L1');
  await writeFile(await E(l1).root(), 'only-L1', 'L1');

  // l2: shared = "L2", only-L2
  await writeFile(await E(l2).root(), 'shared', 'L2');
  await writeFile(await E(l2).root(), 'only-L2', 'L2');

  const stacked = compose(l2, compose(l1, backing));
  const root = await E(stacked).root();

  t.is(await readFile(root, 'shared'), 'L2'); // l2 wins
  t.is(await readFile(root, 'only-L2'), 'L2'); // only in l2
  t.is(await readFile(root, 'only-L1'), 'L1'); // only in l1
  t.is(await readFile(root, 'only-B'), 'B'); // only in backing
});

test('chroot then compose: read-through works, writes auto-copy-up the layer parent', async t => {
  const backing = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await E(backingRoot).mkdir('workspace', {});
  const ws = await E(backingRoot).lookup('workspace');
  await writeFile(ws, 'orig.txt', 'original');
  await E(backingRoot).mkdir('outside', {});
  await writeFile(await E(backingRoot).lookup('outside'), 'secret', 's');

  const layer = makeInMemoryFilesystem();
  const view = chroot(compose(layer, backing), ['workspace']);
  const root = await E(view).root();
  t.is(await readFile(root, 'orig.txt'), 'original');

  await writeFile(root, 'new.txt', 'fresh');
  t.is(await readFile(root, 'new.txt'), 'fresh');

  // The chroot hides /outside entirely.
  await t.throwsAsync(() => E(root).lookup('outside'), {
    message: /ENOENT/,
  });

  // The layer holds the new file at /workspace/new.txt.
  const layerRoot = await E(layer).root();
  const layerWs = await E(layerRoot).lookup('workspace');
  t.is(await readFile(layerWs, 'new.txt'), 'fresh');
});

test('compose auto-copies-up parent dirs that exist only in the backing on first write', async t => {
  // DESIGN.md §8.4 promises CoW for FILES. The dual case — writing
  // inside a directory that exists only in the backing — used to
  // error EROFS; the impl now materializes the matching layer
  // parent chain on first write below it.
  const backing = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await E(backingRoot).mkdir('workspace', {});
  const layer = makeInMemoryFilesystem();

  const cow = compose(layer, backing);
  const root = await E(cow).root();
  const ws = await E(root).lookup('workspace');
  await writeFile(ws, 'new.txt', 'fresh');

  // Read-through composed view returns the new bytes.
  t.is(await readFile(ws, 'new.txt'), 'fresh');

  // The layer now has the matching /workspace directory and the
  // file landed there (not in the backing).
  const layerRoot = await E(layer).root();
  const layerWs = await E(layerRoot).lookup('workspace');
  t.is(await readFile(layerWs, 'new.txt'), 'fresh');
  const backingWs = await E(backingRoot).lookup('workspace');
  await t.throwsAsync(() => E(backingWs).lookup('new.txt'), {
    message: /ENOENT/,
  });
});

test('readOnly(compose(...)) — the CoW view is read through, writes blocked', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  await writeFile(await E(backing).root(), 'sample', 'B');
  const ro = readOnly(compose(layer, backing));
  const root = await E(ro).root();
  t.is(await readFile(root, 'sample'), 'B');
  await t.throwsAsync(() => E(root).create('new', {}), { message: /EACCES/ });
});

test('compose over a disk-backed backing — content flows through', async t => {
  const backing = await setupDisk(t);
  const layer = makeInMemoryFilesystem();
  await writeFile(await E(backing).root(), 'disk.txt', 'on disk');

  const cow = compose(layer, backing);
  const root = await E(cow).root();
  t.is(await readFile(root, 'disk.txt'), 'on disk');

  // Write through layer; backing unmodified.
  await writeFile(root, 'disk.txt', 'overwritten via layer');
  t.is(await readFile(root, 'disk.txt'), 'overwritten via layer');

  // Direct backing still has the original.
  t.is(await readFile(await E(backing).root(), 'disk.txt'), 'on disk');
});

test('bind a CoW into a host filesystem', async t => {
  const host = makeInMemoryFilesystem();
  const hostRoot = await E(host).root();
  await E(hostRoot).mkdir('mnt', {});
  await writeFile(hostRoot, 'host-file', 'H');

  const backing = makeInMemoryFilesystem();
  await writeFile(await E(backing).root(), 'b.txt', 'backing');
  const layer = makeInMemoryFilesystem();
  const guest = compose(layer, backing);

  const fs = bind(host, ['mnt'], guest);
  const root = await E(fs).root();
  t.is(await readFile(root, 'host-file'), 'H');
  const mnt = await E(root).lookup('mnt');
  t.is(await readFile(mnt, 'b.txt'), 'backing');

  // Writes through the bound CoW go into its own layer.
  await writeFile(mnt, 'b.txt', 'modified');
  t.is(await readFile(mnt, 'b.txt'), 'modified');
  // Backing is untouched.
  t.is(await readFile(await E(backing).root(), 'b.txt'), 'backing');
});

test('namespace of CoW + chroot + readOnly — heterogeneous mount points', async t => {
  // a/ = read-only chroot of a populated FS
  // b/ = CoW over an empty backing (writable scratch)
  const aBase = makeInMemoryFilesystem();
  const aRoot = await E(aBase).root();
  await E(aRoot).mkdir('view', {});
  await writeFile(await E(aRoot).lookup('view'), 'note', 'frozen');
  const a = readOnly(chroot(aBase, ['view']));

  const bBacking = emptyFilesystem();
  const bLayer = makeInMemoryFilesystem();
  const b = compose(bLayer, bBacking);

  const ns = namespace({ readonly: a, scratch: b });
  const root = await E(ns).root();

  // readonly is read-through but writes blocked.
  t.is(await readFile(await E(root).lookup('readonly'), 'note'), 'frozen');
  const roSub = await E(root).lookup('readonly');
  await t.throwsAsync(() => E(roSub).create('new', {}), {
    message: /EACCES/,
  });

  // scratch is writable through the CoW.
  await writeFile(await E(root).lookup('scratch'), 'jot.txt', 'scratched');
  t.is(await readFile(await E(root).lookup('scratch'), 'jot.txt'), 'scratched');
});

// ---------- Layer.apply across implementations ----------

test('Layer.apply replays an in-memory layer onto a disk-backed target', async t => {
  const layerFs = makeInMemoryFilesystem();
  const layerRoot = await E(layerFs).root();
  await E(layerRoot).mkdir('proj', {});
  await writeFile(await E(layerRoot).lookup('proj'), 'src.txt', 'code');
  await writeFile(layerRoot, 'top.md', '# top');

  const target = await setupDisk(t);
  const layer = makeLayer(layerFs, emptyFilesystem());
  await E(layer).apply(target);

  const tRoot = await E(target).root();
  t.is(await readFile(tRoot, 'top.md'), '# top');
  t.is(await readFile(await E(tRoot).lookup('proj'), 'src.txt'), 'code');
});

// ---------- snapshot through composition ----------

test("snapshot() on a layer file reflects the layer's content, not the backing", async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  await writeFile(await E(backing).root(), 'shared', 'backing-content');
  await writeFile(await E(layer).root(), 'shared', 'layer-content');

  const cow = compose(layer, backing);
  const root = await E(cow).root();
  const file = await E(root).lookup('shared');
  const blob = await E(file).snapshot();
  t.truthy(blob);
  const info = await E(blob).getInfo();
  t.is(info.size, BigInt('layer-content'.length));
});

// ---------- watch through composition (weakness probe) ----------

test('watch on a composed view surfaces events from both layer and backing', async t => {
  // DESIGN.md §8.7 promises merged events on a composed view.
  // The watcher subscribes to both participants and interleaves
  // their events into one stream; cancelling the composed watcher
  // cancels both underlying subscriptions.
  t.timeout(5_000);
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  const cow = compose(layer, backing);
  const root = await E(cow).root();
  const watcher = await E(root).watch();
  const events = iterateReader(await E(watcher).events());
  t.teardown(() => E(watcher).cancel());

  // Mutating the backing fires through the composed watcher.
  await writeFile(await E(backing).root(), 'b', 'B');
  const first = await events.next();
  t.truthy(first.value);
  t.truthy(first.value.kind);
});

// ---------- list through composition ----------

test('list() on a composed view exposes both sides minus whiteouts', async t => {
  const backing = makeInMemoryFilesystem();
  const layer = makeInMemoryFilesystem();
  for (const n of ['a', 'b', 'c']) {
    await writeFile(await E(backing).root(), n, '');
  }
  for (const n of ['c', 'd', 'e']) {
    // 'c' overrides; 'd' and 'e' are new.
    await writeFile(await E(layer).root(), n, '');
  }

  const cow = compose(layer, backing);
  const root = await E(cow).root();
  let cursor = await E(root).list();
  let entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries.map(e => e.name).sort(), ['a', 'b', 'c', 'd', 'e']);

  // Whiteout 'a': it disappears from both lookup and list.
  await E(root).unlink('a');
  cursor = await E(root).list();
  entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries.map(e => e.name).sort(), ['b', 'c', 'd', 'e']);
});

// ---------- chroot of an in-memory FS, then deep walk ----------

test('chroot + lookup chain stays inside the chrooted subtree', async t => {
  const inner = makeInMemoryFilesystem();
  const innerRoot = await E(inner).root();
  await E(innerRoot).mkdir('project', {});
  const p = await E(innerRoot).lookup('project');
  await E(p).mkdir('src', {});
  const src = await E(p).lookup('src');
  await E(src).mkdir('lib', {});
  const lib = await E(src).lookup('lib');
  await writeFile(lib, 'mod.js', 'export const x = 1;');

  const view = chroot(inner, ['project']);
  const root = await E(view).root();

  // Walk deep within chroot — works.
  const srcP = E(root).lookup('src');
  const libP = E(srcP).lookup('lib');
  const got = await E(libP).lookup('mod.js');
  t.is((await E(got).getQid()).type, 'file');
});

// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Layer.diff / Layer.apply tests (F12, DESIGN.md §8.5).
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';
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

test('Layer.diff() enumerates create-dir / create-file / write-bytes', async t => {
  const backing = makeInMemoryFilesystem();
  const layerFs = makeInMemoryFilesystem();
  const layerRoot = await E(layerFs).root();
  await E(layerRoot).mkdir('docs', {});
  const docs = await E(layerRoot).lookup('docs');
  await writeFile(docs, 'readme.md', 'hello');

  const layer = makeLayer(layerFs, backing);
  const ops = await collectStream(await E(layer).diff());

  const kinds = ops.map(o => o.kind);
  t.true(kinds.includes('create-dir'));
  t.true(kinds.includes('create-file'));
  t.true(kinds.includes('write-bytes'));
});

test('Layer.apply replays the diff onto a clean target', async t => {
  const backing = makeInMemoryFilesystem();
  const layerFs = makeInMemoryFilesystem();
  const layerRoot = await E(layerFs).root();
  await E(layerRoot).mkdir('docs', {});
  const docs = await E(layerRoot).lookup('docs');
  await writeFile(docs, 'readme.md', 'hello from layer');
  await writeFile(layerRoot, 'top.txt', 'top-level');

  const layer = makeLayer(layerFs, backing);
  const target = makeInMemoryFilesystem();

  await E(layer).apply(target);

  const targetRoot = await E(target).root();
  t.is(await readFile(targetRoot, 'top.txt'), 'top-level');
  const targetDocs = await E(targetRoot).lookup('docs');
  t.is(await readFile(targetDocs, 'readme.md'), 'hello from layer');
});

test("Layer.apply idempotency: applying twice doesn't error on existing dirs", async t => {
  const backing = makeInMemoryFilesystem();
  const layerFs = makeInMemoryFilesystem();
  const layerRoot = await E(layerFs).root();
  await E(layerRoot).mkdir('a', {});
  await writeFile(layerRoot, 'x', 'x');

  const layer = makeLayer(layerFs, backing);
  const target = makeInMemoryFilesystem();
  await E(layer).apply(target);
  // Second apply: should not throw on existing dir.
  await E(layer).apply(target);
  const targetRoot = await E(target).root();
  t.is(await readFile(targetRoot, 'x'), 'x');
});

test('Layer.backing exposes the original backing cap', async t => {
  const backing = makeInMemoryFilesystem();
  const layerFs = makeInMemoryFilesystem();
  const layer = makeLayer(layerFs, backing);
  const b = await E(layer).backing();
  // backing's root() should match the original's root() qid.
  const r1 = await E(b).root();
  const r2 = await E(backing).root();
  const q1 = await E(r1).getQid();
  const q2 = await E(r2).getQid();
  t.is(q1.pathId, q2.pathId);
});

test('Layer.seal returns a read-only Filesystem over the layer', async t => {
  const backing = makeInMemoryFilesystem();
  const layerFs = makeInMemoryFilesystem();
  const layerRoot = await E(layerFs).root();
  await writeFile(layerRoot, 'sealed.txt', 'frozen');
  const layer = makeLayer(layerFs, backing);
  const sealed = await E(layer).seal();
  const r = await E(sealed).root();
  t.is(await readFile(r, 'sealed.txt'), 'frozen');
  await t.throwsAsync(() => E(r).create('new', {}), { message: /EACCES/ });
});

test('whiteout filenames appear in diff as whiteout ops', async t => {
  const backing = makeInMemoryFilesystem();
  const layerFs = makeInMemoryFilesystem();
  const layerRoot = await E(layerFs).root();
  // Synthesize a whiteout marker filename (mimicking what `compose`
  // would write).
  await writeFile(layerRoot, '__whiteout__deleted.txt', '');
  const layer = makeLayer(layerFs, backing);
  const ops = await collectStream(await E(layer).diff());
  const wo = ops.find(o => o.kind === 'whiteout');
  t.truthy(wo);
  t.deepEqual(wo.path, ['deleted.txt']);
});

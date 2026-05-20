// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Pipelined-walk tests (DESIGN.md §3 principle 2).
 *
 * A deeply-nested walk + open + read should fan out as one batch of
 * eventual-send messages and produce one batch of results. We can't
 * directly measure "round trips" inside a single process, but we
 * can:
 *   - chain `E(...).lookup(a).lookup(b).lookup(c).open(...)` without
 *     awaiting intermediate stages, and assert the whole chain
 *     resolves successfully
 *   - assert the type discrimination from §4.3 lookup-returns-the-
 *     right-subtype, since otherwise the chain would error on the
 *     wrong method on an intermediate cap
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';

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
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
};

const buildTree = async fs => {
  const root = await E(fs).root();
  const a = await E(root).mkdir('a', {});
  const b = await E(a).mkdir('b', {});
  const c = await E(b).mkdir('c', {});
  const deep = await E(c).create('deep.txt', {});
  await writeBytes(await E(deep).write(0n), utf8('found it'));
  await E(deep).close();
  return root;
};

test('pipelined chain: root.lookup(a).lookup(b).lookup(c).lookup(deep) resolves', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await buildTree(fs);

  // Build the chain WITHOUT awaiting intermediate stages.
  const deepRef = E(E(E(E(root).lookup('a')).lookup('b')).lookup('c')).lookup(
    'deep.txt',
  );

  const qid = await E(deepRef).getQid();
  t.is(qid.type, 'file');
});

test('pipelined chain: terminal open + read in one expression', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await buildTree(fs);

  const reader = E(
    E(
      E(E(E(E(root).lookup('a')).lookup('b')).lookup('c')).lookup('deep.txt'),
    ).open({ read: true }),
  ).read(0n, 1024n);

  const bytes = await collectBytes(await reader);
  t.is(fromUtf8(bytes), 'found it');
});

test('pipelined chain fails cleanly at a missing intermediate', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await buildTree(fs);

  // Missing intermediate ('zzz') causes the chain to reject; the
  // subsequent calls short-circuit on the rejected promise.
  const chain = E(
    E(E(E(E(root).lookup('a')).lookup('zzz')).lookup('c')).lookup('deep.txt'),
  ).getQid();

  const err = await t.throwsAsync(chain);
  t.regex(err.message, /ENOENT/);
});

test('lookup returns Directory or File subtype', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await E(root).mkdir('thedir', {});
  const open = await E(root).create('thefile', {});
  await E(open).close();

  const d = await E(root).lookup('thedir');
  const f = await E(root).lookup('thefile');

  // Directory has methods that File doesn't (`list`, `create`).
  // File has methods that Directory doesn't (`open`, `snapshot`).
  t.is((await E(d).getQid()).type, 'directory');
  t.is((await E(f).getQid()).type, 'file');

  // Calling list() on the directory works (empty dir → no entries).
  const cursor = await E(d).list();
  const entries = [];
  for await (const e of iterateReader(await E(cursor).stream())) {
    entries.push(e);
  }
  t.deepEqual(entries, []);

  // Calling open() on the file works.
  const oh = await E(f).open({ read: true });
  await E(oh).close();
});

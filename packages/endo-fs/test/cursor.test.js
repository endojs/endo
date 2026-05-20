// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Cursor tests (DESIGN.md §4.5).
 *
 * `Directory.list() → Cursor`. The Cursor is the iteration state;
 * its `stream()` opens a fresh reader from the cursor's current
 * position, `skip(n)` advances without reading, `rewind()` resets.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';

const collectStream = async readerRef => {
  const out = [];
  for await (const value of iterateReader(readerRef)) {
    out.push(value);
  }
  return out;
};

const populateDir = async dir => {
  for (const name of ['a', 'b', 'c', 'd', 'e']) {
    const o = await E(dir).create(name, {});
    await E(o).close();
  }
};

test('Cursor.stream yields every DirEntry once', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populateDir(root);
  const cursor = await E(root).list();
  const entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries.map(e => e.name).sort(), ['a', 'b', 'c', 'd', 'e']);
  for (const e of entries) {
    t.is(e.qid.type, 'file');
  }
});

test('Cursor.stream resumes from current position when reopened', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populateDir(root);
  const cursor = await E(root).list();

  // First stream: consume only 2 entries, then close.
  const it1 = iterateReader(await E(cursor).stream());
  const { value: first } = await it1.next();
  const { value: second } = await it1.next();
  await it1.return();

  // Second stream: should start AFTER the second entry.
  const remaining = await collectStream(await E(cursor).stream());
  t.is(remaining.length, 3);

  const all = [first.name, second.name, ...remaining.map(e => e.name)];
  // Every original entry shows up exactly once.
  t.deepEqual(all.sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('Cursor.skip advances without reading', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populateDir(root);
  const cursor = await E(root).list();

  await E(cursor).skip(3n);
  const remaining = await collectStream(await E(cursor).stream());
  t.is(remaining.length, 2);
});

test('Cursor.rewind resets to the start', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populateDir(root);
  const cursor = await E(root).list();

  await E(cursor).skip(4n);
  await E(cursor).rewind();

  const all = await collectStream(await E(cursor).stream());
  t.is(all.length, 5);
});

test('Cursor.skip beyond end clamps; no negative', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populateDir(root);
  const cursor = await E(root).list();

  await E(cursor).skip(100n);
  const empty = await collectStream(await E(cursor).stream());
  t.deepEqual(empty, []);

  await t.throwsAsync(() => E(cursor).skip(-1n), {
    message: /EINVAL/,
  });
});

test('multiple Cursors from the same Directory are independent', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populateDir(root);

  const c1 = await E(root).list();
  const c2 = await E(root).list();

  await E(c1).skip(2n);
  // c2 untouched
  const left1 = (await collectStream(await E(c1).stream())).length;
  const left2 = (await collectStream(await E(c2).stream())).length;
  t.is(left1, 3);
  t.is(left2, 5);
});

test('Cursor on an empty directory yields nothing', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const empty = await E(root).mkdir('empty', {});
  const cursor = await E(empty).list();
  const entries = await collectStream(await E(cursor).stream());
  t.deepEqual(entries, []);
});

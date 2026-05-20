// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */
/* global setTimeout */

/**
 * Watch tests (F7: Node.watch).
 *
 * Each Node yields events via its `watch().events()` PassableReader.
 * Mutations to the watched node — content writes, attribute changes,
 * xattr edits, and (for directories) child add/remove/rename — surface
 * as events with a `kind` discriminator.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';

const utf8 = s => new TextEncoder().encode(s);

const writeBytes = async (writerRef, bytes) => {
  const w = iterateBytesWriter(writerRef);
  await w.next(bytes);
  await w.return();
};

const takeUpTo = async (iter, n, timeoutMs = 1000) => {
  const events = [];
  const target = Number(n);
  const deadline = Date.now() + Number(timeoutMs);
  while (events.length < target && Date.now() < deadline) {
    const left = deadline - Date.now();
    const next = iter.next();
    const res = await Promise.race([
      next.then(r => ({ kind: 'value', r })),
      new Promise(resolve =>
        setTimeout(() => resolve({ kind: 'timeout' }), Math.max(0, left)),
      ),
    ]);
    if (res.kind === 'timeout') break;
    if (res.r.done) break;
    events.push(res.r.value);
  }
  return events;
};

test('writing to a File fires "changed" on its watcher', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const openFile = await E(root).create('w', {});
  const file = await E(root).lookup('w');
  const watcher = await E(file).watch();
  const events = iterateReader(await E(watcher).events());

  await writeBytes(await E(openFile).write(0n), utf8('payload'));

  const got = await takeUpTo(events, 1);
  t.is(got.length, 1);
  t.is(got[0].kind, 'changed');

  await E(watcher).cancel();
});

test('mkdir / unlink fire child-added / child-removed on parent', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const watcher = await E(root).watch();
  const events = iterateReader(await E(watcher).events());

  await E(root).mkdir('sub', {});
  await E(root).unlink('sub');

  const got = await takeUpTo(events, 4);
  const kinds = got.map(e => e.kind);
  t.true(kinds.includes('child-added'));
  t.true(kinds.includes('child-removed'));

  await E(watcher).cancel();
});

test('xattrs set/remove fires "changed" on the node', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const opened = await E(root).create('x', {});
  await E(opened).close();
  const file = await E(root).lookup('x');

  const watcher = await E(file).watch();
  const events = iterateReader(await E(watcher).events());

  const xattrs = await E(file).xattrs();
  await writeBytes(
    await E(xattrs).set('user.tag', { existence: 'create' }),
    utf8('value'),
  );
  await E(xattrs).remove('user.tag');

  const got = await takeUpTo(events, 2);
  t.true(got.length >= 1);
  for (const e of got) t.is(e.kind, 'changed');

  await E(watcher).cancel();
});

test('cancel ends the event stream', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const watcher = await E(root).watch();
  const events = iterateReader(await E(watcher).events());

  await E(watcher).cancel();

  // After cancel, the iterator should complete cleanly.
  const got = await takeUpTo(events, 5, 500);
  t.deepEqual(got, []);
});

test('multiple watchers on the same node each receive events', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const w1 = await E(root).watch();
  const w2 = await E(root).watch();
  const e1 = iterateReader(await E(w1).events());
  const e2 = iterateReader(await E(w2).events());

  await E(root).mkdir('a', {});

  // mkdir fires both a `changed` (via bumpVersion) and a `child-added`.
  // Both watchers should see the `child-added` event; collect a few.
  const g1 = await takeUpTo(e1, 4);
  const g2 = await takeUpTo(e2, 4);
  t.true(g1.some(e => e.kind === 'child-added'));
  t.true(g2.some(e => e.kind === 'child-added'));

  await E(w1).cancel();
  await E(w2).cancel();
});

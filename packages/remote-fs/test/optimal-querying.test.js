// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Optimal querying patterns + design-weakness probes.
 *
 * Each test demonstrates either:
 *   (a) a pattern the design supports well (pipelined walks,
 *       streamed bulk transfer, snapshot+fetch, parallel ops); or
 *   (b) a gap in the API that's worth knowing about (no batch
 *       lookup, no field-selection on getAttrs, sequential xattrs
 *       listing, watch races with list, etc.).
 *
 * Tests in category (b) are tagged `WEAKNESS:` so DESIGN.md §10
 * stays accurate as the implementations evolve.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';

const utf8 = s => new TextEncoder().encode(s);

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

const populate = async (root, namesAndContent) => {
  for (const [name, content] of namesAndContent) {
    await writeFile(root, name, content);
  }
};

// =====================================================================
// Patterns the design supports well
// =====================================================================

test('PATTERN: pipelined chain — single batch for walk + open + read', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const a = await E(root).mkdir('a', {});
  const b = await E(a).mkdir('b', {});
  const c = await E(b).mkdir('c', {});
  await writeFile(c, 'deep.txt', 'found');

  // Build the chain WITHOUT awaiting intermediates. CapTP's
  // eventual-send queue dispatches all four lookups + the open +
  // the read as one batch of pipelined messages; only the final
  // PassableBytesReader needs to make the round trip.
  const reader = E(
    E(
      E(E(E(E(root).lookup('a')).lookup('b')).lookup('c')).lookup(
        'deep.txt',
      ),
    ).open({ read: true }),
  ).read(0n, 1024n);
  const bytes = await collectBytes(await reader);
  t.is(new TextDecoder().decode(bytes), 'found');
});

test('PATTERN: parallel lookups for known sibling names — Promise.all of N lookups', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populate(root, [
    ['a', '1'],
    ['b', '2'],
    ['c', '3'],
    ['d', '4'],
  ]);

  // The optimal pattern for "give me N specific siblings' qids":
  // issue N parallel lookups + getQid, then Promise.all.
  const names = ['a', 'b', 'c', 'd'];
  const qids = await Promise.all(
    names.map(n => E(E(root).lookup(n)).getQid()),
  );
  t.is(qids.length, 4);
  for (const q of qids) t.is(q.type, 'file');
});

test('PATTERN: snapshot + fetch — read bytes without holding the file open', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await writeFile(root, 'big.bin', 'A'.repeat(1024));
  const file = await E(root).lookup('big.bin');

  // Snapshot captures the bytes at this moment. fetch() can be
  // called repeatedly with different ranges; the source file can
  // mutate without affecting the snapshot.
  const blob = await E(file).snapshot();
  const oh = await E(file).open({ write: true, truncate: true });
  await writeBytes(await E(oh).write(0n), utf8('mutated'));
  await E(oh).close();

  // Original bytes still served by the BlobRef.
  const head = await collectBytes(await E(blob).fetch(0n, 16n));
  t.is(new TextDecoder().decode(head), 'A'.repeat(16));
  const tail = await collectBytes(await E(blob).fetch(1008n, 16n));
  t.is(new TextDecoder().decode(tail), 'A'.repeat(16));
});

test('PATTERN: Cursor.skip + stream — seek to page boundary', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  // 50 entries.
  await populate(
    root,
    Array.from({ length: 50 }, (_, i) => [`f${String(i).padStart(2, '0')}`, '']),
  );
  const cursor = await E(root).list();
  await E(cursor).skip(40n);
  const tail = await collectStream(await E(cursor).stream());
  t.is(tail.length, 10);
});

test('PATTERN: watch + edit observes a "changed" event', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await writeFile(root, 'note.txt', 'first');
  const file = await E(root).lookup('note.txt');
  const watcher = await E(file).watch();
  const events = iterateReader(await E(watcher).events());

  // Mutate.
  const oh = await E(file).open({ write: true, truncate: true });
  await writeBytes(await E(oh).write(0n), utf8('second'));
  await E(oh).close();

  const next = await Promise.race([
    events.next().then(r => ({ kind: 'value', r })),
    new Promise(resolve => {
      // eslint-disable-next-line no-undef
      setTimeout(() => resolve({ kind: 'timeout' }), 1000);
    }),
  ]);
  await E(watcher).cancel();
  t.is(next.kind, 'value');
  t.is(next.r.value.kind, 'changed');
});

// =====================================================================
// Design weaknesses — tests that pin the gap
// =====================================================================

test('WEAKNESS: no batch lookup — N specific names require N separate calls', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populate(
    root,
    Array.from({ length: 100 }, (_, i) => [`f${i}`, '']),
  );

  // To get ALL children, `list()` is one call → one Cursor → one
  // stream. Cheap.
  const all = await collectStream(await E(await E(root).list()).stream());
  t.is(all.length, 100);

  // But to look up exactly 10 specific names, the only way is 10
  // separate calls. Promise.all parallelises them but it's still N
  // method invocations end-to-end, not one batched request.
  //
  // A `Directory.batchLookup(names: string[]) → Node[]` (or even
  // `Directory.lookupMany(...)` returning Promise<Node[]>) would
  // collapse this to a single CapTP round-trip. Documented in the
  // design's §10 open questions as a follow-up.
  const wanted = ['f3', 'f17', 'f42', 'f88'];
  const got = await Promise.all(
    wanted.map(n => E(root).lookup(n)),
  );
  t.is(got.length, 4);
});

test('WEAKNESS: no field-selection on getAttrs — always pulls every field', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await writeFile(root, 'x', 'hi');
  const file = await E(root).lookup('x');

  // The contract returns the full Attrs record even when the caller
  // only needs `size`. For an in-memory FS this is free; for a
  // disk-backed FS, stat() is "free" too (one syscall); for a
  // remote-over-CapTP FS, the full struct rides the wire on every
  // call. A getAttrs(['size']) field-selection variant would let
  // the server skip computing/transmitting unneeded fields. POSIX-
  // style statx() solves this with a request_mask; we deliberately
  // dropped that pattern but the cost is the unmasked transfer.
  const attrs = await E(file).getAttrs();
  t.is(typeof attrs.size, 'bigint');
  t.is(typeof attrs.mtime, 'bigint');
  // No way to skip these.
});

test('WEAKNESS: watch + list TOCTOU — events between can be missed', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populate(root, [['a', ''], ['b', '']]);

  // Optimal pattern would be "watch + initial-snapshot" as a single
  // atomic operation — but the design has no such primitive. The
  // caller must list() first, then watch(), and accept that
  // mutations between the two calls won't appear in either: list()
  // already returned, watch() starts AFTER. inotify has the same
  // problem; documented as "Reconnecting after a missed event is
  // the caller's problem; there is no replay" in DESIGN.md §4.2.

  const cursor = await E(root).list();
  // Adversary inserts 'c' between list() and stream(); this DOES
  // surface in the stream because the cursor snapshots at stream()
  // time in our impl. But a watch() set up AFTER the stream() will
  // not see the insertion.
  const watcher = await E(root).watch();
  await writeFile(root, 'c', '');
  const events = iterateReader(await E(watcher).events());

  const initial = await collectStream(await E(cursor).stream());
  // 'c' MAY appear here because the cursor snapshot happens at
  // stream() time, but a `list-then-watch-with-strict-ordering`
  // semantic would require the impl to pause writes between the
  // two. The interface has no such guarantee.
  t.true(initial.length >= 2);

  // After watch(), additional writes DO fire events.
  await writeFile(root, 'd', '');
  const next = await Promise.race([
    events.next().then(r => ({ kind: 'value', r })),
    new Promise(resolve => {
      // eslint-disable-next-line no-undef
      setTimeout(() => resolve({ kind: 'timeout' }), 500);
    }),
  ]);
  await E(watcher).cancel();
  t.is(next.kind, 'value');
});

test('WEAKNESS: compose rename is ENOSYS — copy+unlink workaround needed', async t => {
  const fs = makeInMemoryFilesystem();
  const backing = makeInMemoryFilesystem();
  await writeFile(await E(backing).root(), 'src', 'data');
  const layer = makeInMemoryFilesystem();
  // Import locally to keep the WEAKNESS test self-contained.
  const { compose } = await import('../src/compose.js');
  const cow = compose(layer, backing);
  const root = await E(cow).root();
  await t.throwsAsync(() => E(root).rename('src', root, 'dest'), {
    message: /ENOSYS/,
  });
  void fs;
});

test('WEAKNESS: Cursor.skip is O(n) for in-memory + Mount adapter, not O(log n)', async t => {
  // DESIGN.md §4.5 documents `skip(n)` as "Default impl reads-and-
  // discards; backings with ordered indexes (b-trees, sorted
  // directories) can implement it in O(log n)." Our two backings
  // (in-memory + Mount adapter) do the default; only a future
  // disk-backed impl with a sorted index would do better. We can't
  // measure complexity here, but we can document that skip(N)'s
  // wall-clock grows with N and pin behaviour.
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populate(
    root,
    Array.from({ length: 500 }, (_, i) => [`f${String(i).padStart(3, '0')}`, '']),
  );
  const cursor = await E(root).list();
  // Skip 400 then stream — should produce 100 entries.
  await E(cursor).skip(400n);
  const tail = await collectStream(await E(cursor).stream());
  t.is(tail.length, 100);
});

test('WEAKNESS: Filesystem.statfs is metadata-only — no aggregation across mounts', async t => {
  // The `namespace` and `bind` primitives expose multiple
  // underlying filesystems through one composed Filesystem cap.
  // statfs() on the composed view returns zeros (no aggregation
  // across mounts). DESIGN.md §8.6 namespace block notes this:
  // "Aggregate would need cross-mount stats; report zeros for v1."
  const { namespace, emptyFilesystem } = await import('../src/compose.js');
  const a = makeInMemoryFilesystem();
  await writeFile(await E(a).root(), 'sample', 'X'.repeat(100));
  const ns = namespace({ a, _empty: emptyFilesystem() });
  const stats = await E(ns).statfs();
  // a has 100 bytes of file content, but ns.statfs() reports zero.
  t.is(stats.totalBytes, 0n);
});

test('WEAKNESS: getQid is sync-returning on the exo state, but goes through CapTP', async t => {
  // The design promises "eager" qid — readable without a round
  // trip. The cap's exo state pairs the qid with the slot, so the
  // server-side getter is sync. But callers reach it via E().getQid()
  // which IS a method call. In a single-vat process, this resolves
  // on the next microtask. Across CapTP, it's one round-trip,
  // which contradicts the "no round trip" promise. A true eager
  // qid would require CapTP to ship the state alongside the slot;
  // it doesn't today.
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  // The call returns a promise even though server-side it's sync.
  const promise = E(root).getQid();
  t.true(typeof promise.then === 'function');
  const qid = await promise;
  t.is(qid.type, 'directory');
});

test('WEAKNESS: xattrs.list returns names sequentially via a stream', async t => {
  // For a node with thousands of xattrs (rare but legal), the
  // PassableReader<string> protocol's per-message synchronization
  // overhead bites. A `xattrs.listAll() → string[]` shortcut would
  // be cheaper for small lists. Pin current behaviour.
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await writeFile(root, 'x', '');
  const file = await E(root).lookup('x');
  const x = await E(file).xattrs();
  await writeBytes(
    await E(x).set('user.tag1', { existence: 'create' }),
    utf8('a'),
  );
  await writeBytes(
    await E(x).set('user.tag2', { existence: 'create' }),
    utf8('b'),
  );
  const names = await collectStream(await E(x).list());
  t.deepEqual(names.sort(), ['user.tag1', 'user.tag2']);
});

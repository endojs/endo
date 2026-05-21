// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Optimal querying patterns + design-weakness probes.
 *
 * The cost framework we care about is **serial round-trips that
 * can't be pipelined over**. Operations that compose via CapTP's
 * eventual-send queue (`E()` chains, `Promise.all([... E()])`)
 * collapse to one effective batch regardless of how many method
 * calls are involved. So "N method invocations" is only a cost
 * concern when the calls have data dependencies the queue can't
 * resolve in advance.
 *
 * Each test demonstrates either:
 *   (a) a PATTERN the design supports well — pipelined walks,
 *       parallel lookups, streamed bulk transfer, snapshot+fetch;
 *   (b) a WEAKNESS where the API forces serial round-trips that
 *       a richer primitive could collapse, OR a non-round-trip
 *       gap that's still worth pinning (bandwidth, complexity,
 *       semantics).
 *
 * Weakness tests are tagged in the title with their cost
 * category: `[RT]` for genuine round-trip cost,
 * `[bandwidth]` / `[complexity]` / `[semantics]` for the
 * non-RT cases. Round-trip weaknesses are the ones to prioritise
 * for primitive additions.
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
  const aP = E(root).lookup('a');
  const bP = E(aP).lookup('b');
  const cP = E(bP).lookup('c');
  const deepP = E(cP).lookup('deep.txt');
  const openP = E(deepP).open({ read: true });
  const reader = E(openP).read(0n, 1024n);
  const bytes = await collectBytes(await reader);
  t.is(new TextDecoder().decode(bytes), 'found');
});

test('PATTERN: M.await pipelines `lookup → rename` to one round-trip', async t => {
  // `Directory.rename`'s guard uses `M.callWhen(M.string(),
  // M.await(M.remotable("Directory")), M.string())` — the
  // dispatcher awaits the newParent argument before invoking the
  // method body. That means a caller can pass a PROMISE of a
  // Directory in the argument position; the rename dispatches in
  // the same batch as the lookup that produced it.
  //
  // Without M.await, the caller would need a serial round-trip
  // pair: await the lookup result, then call rename. With it, the
  // two collapse to a single batch.
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const subA = await E(root).mkdir('a', {});
  await E(root).mkdir('b', {});
  const f = await E(subA).create('thing', {});
  await writeBytes(await E(f).write(0n), utf8('moved'));
  await E(f).close();

  // Pipelined: pass the lookup's promise straight to rename, no
  // intermediate await. The guard's M.await unwraps it server-
  // side.
  await E(subA).rename('thing', E(root).lookup('b'), 'thing');

  // Verify the move: original gone, new location has the bytes.
  await t.throwsAsync(() => E(subA).lookup('thing'), { message: /ENOENT/ });
  const subB = await E(root).lookup('b');
  const moved = await E(subB).lookup('thing');
  const oh = await E(moved).open({ read: true });
  const bytes = await collectBytes(await E(oh).read(0n, 64n));
  t.is(new TextDecoder().decode(bytes), 'moved');
});

test('PATTERN: parallel lookups for known sibling names — Promise.all of N lookups pipelines to 1 round-trip', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populate(root, [
    ['a', '1'],
    ['b', '2'],
    ['c', '3'],
    ['d', '4'],
  ]);

  // The cost-optimal pattern for "give me N specific siblings' qids":
  // issue N parallel `E(root).lookup(n)` + `E(child).getQid()` calls
  // and `Promise.all` them. CapTP's eventual-send queue dispatches
  // all N pairs as ONE batch of messages; the responder processes
  // them and the responses come back as one batch. Serial
  // round-trips: 1, regardless of N.
  //
  // This is why "no batch lookup primitive" is NOT a round-trip
  // weakness — pipelining + Promise.all already deliver the
  // single-round-trip behaviour a hypothetical `batchLookup`
  // would. A real `batchLookup` would only help with the per-
  // message bandwidth overhead (header bytes × N), not latency.
  const names = ['a', 'b', 'c', 'd'];
  const qids = await Promise.all(
    names.map(n => {
      const childP = E(root).lookup(n);
      return E(childP).getQid();
    }),
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
    Array.from({ length: 50 }, (_, i) => [
      `f${String(i).padStart(2, '0')}`,
      '',
    ]),
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

test('PATTERN: list() is the right call when you want ALL children', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populate(
    root,
    Array.from({ length: 100 }, (_, i) => [`f${i}`, '']),
  );

  // For "give me ALL the children," `list()` is one call → one
  // Cursor → one stream. Cheap.
  const cursor = await E(root).list();
  const all = await collectStream(await E(cursor).stream());
  t.is(all.length, 100);
});

test('WEAKNESS [bandwidth]: no field-selection on getAttrs — always pulls every field', async t => {
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

test('PATTERN: Directory.watchFrom atomically snapshots entries + subscribes (TOCTOU-free)', async t => {
  // The standalone `list()` + `watch()` pair has a TOCTOU race:
  // mutations between the two calls are invisible to both — list
  // already returned, watch starts AFTER. `watchFrom` mints both
  // halves in a single exo method invocation, so any mutation
  // observable after `watchFrom` returns is in the watcher.
  t.timeout(5_000);
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populate(root, [
    ['a', ''],
    ['b', ''],
  ]);

  const { cursor, watcher } = await E(root).watchFrom();
  t.teardown(() => E(watcher).cancel());
  const events = iterateReader(await E(watcher).events());

  // The cursor reflects the entries at the moment of subscription.
  const initial = await collectStream(await E(cursor).stream());
  t.deepEqual(initial.map(e => e.name).sort(), ['a', 'b']);

  // A post-subscription mutation fires on the watcher.
  await writeFile(root, 'c', '');
  const next = await events.next();
  t.truthy(next.value);
  t.truthy(next.value.kind);
});

test('PATTERN: brand-based cycle detection catches a CapTP-mediated cycle', async t => {
  // The Symbol-based check keys on per-presence identity, so a
  // Filesystem cap that's been marshalled out and back through
  // CapTP shows up as a different presence with a freshly-minted
  // tag set — the construction-time check misses the cycle. The
  // brand-based check (extractable bigint that survives CapTP)
  // catches it on first use of the composed cap.
  const fs = makeInMemoryFilesystem();
  const { makeConnectedPair } = await import('./_captp-pair.js');
  // Round-trip `fs` through a CapTP loopback so the local side
  // sees a remote presence with a freshly-minted Symbol tag.
  const { bootstrapRef: remoteFs } = makeConnectedPair(fs);

  const { compose } = await import('../src/compose.js');
  // The Symbol check passes (different presences). The async
  // brand check should reject because both participants share the
  // same primitive brand.
  const cow = compose(fs, remoteFs);
  await t.throwsAsync(() => E(cow).root(), { message: /cycle/ });
});

test('PATTERN: Directory.materialise creates missing path segments in one call', async t => {
  // Before materialise, callers had to do per-segment lookup+mkdir
  // (sequential round-trips, conditional on lookup's rejection).
  // The server-side primitive collapses the walk into one method
  // invocation — across CapTP that's one round-trip regardless of
  // depth.
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  // Mixed: 'a' already exists, 'b' and 'c' don't yet.
  await E(root).mkdir('a', {});
  const leaf = await E(root).materialise(['a', 'b', 'c'], {});
  t.is((await E(leaf).getQid()).type, 'directory');
  // The intermediates are real directories under root.
  const a = await E(root).lookup('a');
  const b = await E(a).lookup('b');
  const c = await E(b).lookup('c');
  t.is((await E(b).getQid()).type, 'directory');
  t.is((await E(c).getQid()).type, 'directory');
});

test('PATTERN: Directory.materialise refuses non-directory existing segments with ENOTDIR', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  // Create a regular file at the path materialise wants to walk
  // through.
  await writeFile(root, 'a', 'i am a file');
  await t.throwsAsync(() => E(root).materialise(['a', 'b'], {}), {
    message: /ENOTDIR/,
  });
});

test('PATTERN: compose rename of a backing-only file copies up + whiteouts the source', async t => {
  const backing = makeInMemoryFilesystem();
  await writeFile(await E(backing).root(), 'src', 'data');
  const layer = makeInMemoryFilesystem();
  const { compose } = await import('../src/compose.js');
  const cow = compose(layer, backing);
  const root = await E(cow).root();

  await E(root).rename('src', root, 'dest');

  // Source is gone from the composed view; dest holds the bytes.
  await t.throwsAsync(() => E(root).lookup('src'), { message: /ENOENT/ });
  const dest = await E(root).lookup('dest');
  const oh = await E(dest).open({ read: true });
  const bytes = new TextDecoder().decode(
    await collectBytes(await E(oh).read(0n, 64n)),
  );
  await E(oh).close();
  t.is(bytes, 'data');
});

test('PATTERN: compose rename of a directory recursively copies up the subtree', async t => {
  // Directory rename across the CoW boundary recursively
  // materialises the destination tree and copies every file
  // visible through the composed view. The source then gets
  // whiteouted from the composed perspective.
  const backing = makeInMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await E(backingRoot).mkdir('proj', {});
  const proj = await E(backingRoot).lookup('proj');
  await writeFile(proj, 'a.txt', 'alpha');
  await E(proj).mkdir('sub', {});
  const sub = await E(proj).lookup('sub');
  await writeFile(sub, 'deep.txt', 'deep value');

  const layer = makeInMemoryFilesystem();
  const { compose } = await import('../src/compose.js');
  const cow = compose(layer, backing);
  const root = await E(cow).root();

  await E(root).rename('proj', root, 'archive');

  // Source is hidden from the composed view.
  await t.throwsAsync(() => E(root).lookup('proj'), { message: /ENOENT/ });

  // Destination has the full subtree.
  const archive = await E(root).lookup('archive');
  const a = await E(archive).lookup('a.txt');
  const aOh = await E(a).open({ read: true });
  t.is(
    new TextDecoder().decode(await collectBytes(await E(aOh).read(0n, 64n))),
    'alpha',
  );
  await E(aOh).close();
  const subDst = await E(archive).lookup('sub');
  const deep = await E(subDst).lookup('deep.txt');
  const deepOh = await E(deep).open({ read: true });
  t.is(
    new TextDecoder().decode(await collectBytes(await E(deepOh).read(0n, 64n))),
    'deep value',
  );
  await E(deepOh).close();
});

test('PATTERN: Cursor.skip is O(1) per call after the first stream-snapshot', async t => {
  // `skip(n)` is a position update, not a read-and-discard scan —
  // the snapshot is materialised once (lazily, on first `stream()`
  // / `skip()`), and every subsequent skip is constant-time.
  // O(log N) skip-to-position would need a sorted-index backing,
  // which none of in-memory / node-fs / from-mount provides.
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await populate(
    root,
    Array.from({ length: 500 }, (_, i) => [
      `f${String(i).padStart(3, '0')}`,
      '',
    ]),
  );
  const cursor = await E(root).list();
  await E(cursor).skip(400n);
  const tail = await collectStream(await E(cursor).stream());
  t.is(tail.length, 100);
});

test('PATTERN: Filesystem.statfs aggregates across mounts (namespace sums participants)', async t => {
  // `namespace`, `bind`, and `compose` sum their participants'
  // `statfs` numbers (`totalBytes`, `freeBytes`, `availableBytes`).
  // A namespace with one populated mount carries that mount's
  // bytes-used; participants reporting zeros don't affect the sum.
  const { namespace, emptyFilesystem } = await import('../src/compose.js');
  const a = makeInMemoryFilesystem();
  await writeFile(await E(a).root(), 'sample', 'X'.repeat(100));
  const ns = namespace({ a, _empty: emptyFilesystem() });
  const stats = await E(ns).statfs();
  t.is(stats.totalBytes, 100n);
});


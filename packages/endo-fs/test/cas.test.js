// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Reference CAS consumer over a real CapTP connection
 * (DESIGN.md §6 — content-addressed-cache shortcut).
 *
 * The contract: a consumer that holds a CAS keyed by
 * `(algorithm, hash)` can answer reads locally and skip
 * `BlobRef.fetch()` on cache hits. These tests verify the
 * property by snapshotting the wire transcript for two
 * scenarios:
 *
 *   - **Cache miss** — first read of a new BlobRef. The
 *     transcript shows `BlobRef.getInfo` → `BlobRef.fetch` →
 *     bytes flowing over the wire. After the read, the CAS
 *     holds the bytes keyed by hash.
 *
 *   - **Cache hit** — second read of a BlobRef whose hash is
 *     already in the CAS. The transcript shows
 *     `BlobRef.getInfo` (still needed to learn the hash) but
 *     **no** `BlobRef.fetch` — the bytes are served from the
 *     local CAS. The `fetch` call (and its byte payload) does
 *     not cross the wire; the `getInfo` call still does. See
 *     ROADMAP §1.1 / §1.5 for what these in-process CapTP
 *     transcripts do and don't prove.
 *
 * Snapshot fixtures pin the contrast; assertions on the
 * transcript verify the "no fetch on hit" property directly.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import { makeInMemoryFilesystem } from '../src/in-memory.js';
import { makeMemoryCas, cacheBackedRead } from '../src/cas.js';
import { makeConnectedPair, settle } from './_captp-pair.js';

const utf8 = s => new TextEncoder().encode(s);
const fromUtf8 = b => new TextDecoder().decode(b);

const writeBytes = async (writerRef, bytes) => {
  const w = iterateBytesWriter(writerRef);
  await w.next(bytes);
  await w.return();
};

const populateFile = async (fs, name, contents) => {
  const root = await E(fs).root();
  const opened = await E(root).create(name, {});
  await writeBytes(await E(opened).write(0n), utf8(contents));
  await E(opened).close();
  return E(root).lookup(name);
};

// Trim the bootstrap-exchange entries off the front of a
// transcript so the snapshot/assertion focuses on the
// consumer's traffic.
const sliceAfterBootstrap = transcript => {
  // The bootstrap exchange is the first `CTP_BOOTSTRAP` plus its
  // matching `CTP_RETURN`. Drop both.
  const idx = transcript.findIndex(
    e => e.type === 'CTP_RETURN' && e.answerID === transcript[0].questionID,
  );
  return idx === -1 ? transcript : transcript.slice(idx + 1);
};

test('CAS-cached read: miss populates the CAS and fetches over the wire', async t => {
  const fs = makeInMemoryFilesystem();
  await populateFile(fs, 'greet.txt', 'hello, world');
  const { bootstrapRef, transcript } = makeConnectedPair(fs);

  const cas = makeMemoryCas();
  t.is(cas.size, 0, 'CAS starts empty');

  const root = await E(bootstrapRef).root();
  const file = await E(root).lookup('greet.txt');
  const blob = await E(file).snapshot();
  const bytes = await cacheBackedRead(blob, cas);
  t.is(fromUtf8(bytes), 'hello, world');
  t.is(cas.size, 1, 'CAS now holds one blob');
  await settle();

  // The miss path called both `getInfo` and `fetch`.
  const issued = sliceAfterBootstrap(transcript);
  const methods = issued.filter(e => e.type === 'CTP_CALL').map(e => e.method);
  t.true(methods.includes('getInfo'), 'getInfo travels over the wire');
  t.true(methods.includes('fetch'), 'fetch travels over the wire on a miss');

  t.snapshot(transcript, 'cache miss transcript (fetched over wire)');
});

test('CAS-cached read: hit serves locally, no fetch crosses the wire', async t => {
  const fs = makeInMemoryFilesystem();
  await populateFile(fs, 'greet.txt', 'hello, world');
  const { bootstrapRef, transcript } = makeConnectedPair(fs);

  const cas = makeMemoryCas();

  // First read populates the CAS.
  const root = await E(bootstrapRef).root();
  const file1 = await E(root).lookup('greet.txt');
  const blob1 = await E(file1).snapshot();
  await cacheBackedRead(blob1, cas);
  await settle();
  t.is(cas.size, 1);
  const populateEnd = transcript.length;

  // Second read of the same bytes — hash matches, CAS hits, no
  // `fetch` should appear on the wire after this point.
  const file2 = await E(root).lookup('greet.txt');
  const blob2 = await E(file2).snapshot();
  const bytes = await cacheBackedRead(blob2, cas);
  t.is(fromUtf8(bytes), 'hello, world');
  t.is(cas.size, 1, 'CAS still holds exactly one blob');
  await settle();

  const hitTraffic = transcript.slice(populateEnd);
  const hitMethods = hitTraffic
    .filter(e => e.type === 'CTP_CALL')
    .map(e => e.method);
  t.true(
    hitMethods.includes('getInfo'),
    'getInfo still travels on a hit (the consumer needs the hash to look up)',
  );
  t.is(
    hitMethods.filter(m => m === 'fetch').length,
    0,
    'cache hit: no fetch() call crosses the wire',
  );

  t.snapshot(hitTraffic, 'cache hit transcript (no fetch crosses the wire)');
});

test('different blobs in the same CAS stay distinct by hash', async t => {
  const fs = makeInMemoryFilesystem();
  await populateFile(fs, 'a.txt', 'alpha');
  await populateFile(fs, 'b.txt', 'beta');
  const { bootstrapRef } = makeConnectedPair(fs);
  const root = await E(bootstrapRef).root();

  const cas = makeMemoryCas();

  const aFile = await E(root).lookup('a.txt');
  const a = await cacheBackedRead(await E(aFile).snapshot(), cas);
  const bFile = await E(root).lookup('b.txt');
  const b = await cacheBackedRead(await E(bFile).snapshot(), cas);

  t.is(fromUtf8(a), 'alpha');
  t.is(fromUtf8(b), 'beta');
  t.is(cas.size, 2, 'distinct hashes occupy distinct CAS slots');
});

test('identical bytes from different files share a single CAS slot', async t => {
  const fs = makeInMemoryFilesystem();
  await populateFile(fs, 'one.txt', 'same bytes');
  await populateFile(fs, 'two.txt', 'same bytes');
  const { bootstrapRef } = makeConnectedPair(fs);
  const root = await E(bootstrapRef).root();

  const cas = makeMemoryCas();

  const oneFile = await E(root).lookup('one.txt');
  await cacheBackedRead(await E(oneFile).snapshot(), cas);
  const twoFile = await E(root).lookup('two.txt');
  await cacheBackedRead(await E(twoFile).snapshot(), cas);

  t.is(cas.size, 1, 'identical content → one CAS slot');
});

test('cacheBackedRead with { offset, length } returns a slice of the cached payload', async t => {
  // Whole-blob hits cache, range read is a slice of the cached bytes.
  const fs = makeInMemoryFilesystem();
  await populateFile(fs, 'long.txt', '0123456789abcdef');
  const { bootstrapRef, transcript } = makeConnectedPair(fs);
  const root = await E(bootstrapRef).root();
  const file = await E(root).lookup('long.txt');
  const blob = await E(file).snapshot();
  const cas = makeMemoryCas();

  // Miss: fetches the whole blob, populates CAS.
  const head = await cacheBackedRead(blob, cas, { offset: 0n, length: 4n });
  t.is(fromUtf8(head), '0123');
  await settle();
  t.is(cas.size, 1);
  const afterMiss = transcript.length;

  // Hit: no fetch on the wire; slice comes from cache.
  const tail = await cacheBackedRead(blob, cas, { offset: 10n, length: 6n });
  t.is(fromUtf8(tail), 'abcdef');
  await settle();
  const hitCalls = transcript
    .slice(afterMiss)
    .filter(e => e.type === 'CTP_CALL')
    .map(e => e.method);
  t.is(
    hitCalls.filter(m => m === 'fetch').length,
    0,
    'second-range read is served from the CAS — no fetch crosses the wire',
  );
});

test('makeMemoryCas: LRU eviction drops the least-recently-used entry when over capacity', t => {
  const cas = makeMemoryCas({ capacity: 2 });
  const mk = h => ({ algorithm: 'sha256', hash: h, size: 0n });
  cas.put(mk('a'), new Uint8Array([1]));
  cas.put(mk('b'), new Uint8Array([2]));
  // Touch 'a' to make it most-recent.
  t.deepEqual([...(cas.get(mk('a')) || new Uint8Array())], [1]);
  // Inserting a third entry evicts 'b' (now LRU).
  cas.put(mk('c'), new Uint8Array([3]));
  t.is(cas.size, 2);
  t.true(cas.has(mk('a')));
  t.false(cas.has(mk('b')));
  t.true(cas.has(mk('c')));
});

test('makeMemoryCas: invalid capacity rejects', t => {
  t.throws(() => makeMemoryCas({ capacity: 0 }), { message: /positive/ });
  t.throws(() => makeMemoryCas({ capacity: -1 }), { message: /positive/ });
  t.throws(() => makeMemoryCas({ capacity: 1.5 }), { message: /positive/ });
});

test('cacheBackedRead range rejects out-of-bounds offset with EINVAL', async t => {
  const fs = makeInMemoryFilesystem();
  await populateFile(fs, 'small.txt', 'abc');
  const { bootstrapRef } = makeConnectedPair(fs);
  const root = await E(bootstrapRef).root();
  const blob = await E(await E(root).lookup('small.txt')).snapshot();
  const cas = makeMemoryCas();

  await t.throwsAsync(
    () => cacheBackedRead(blob, cas, { offset: 99n, length: 1n }),
    { message: /EINVAL/ },
  );
});

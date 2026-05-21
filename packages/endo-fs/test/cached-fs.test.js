// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Transparent CAS-cached `Filesystem` wrapper over a real CapTP
 * connection (DESIGN.md §6, ROADMAP §2.2).
 *
 * `withCachedReads(fs, cas)` is a `Filesystem → Filesystem`
 * transformation that drops into the existing composition algebra.
 * Its read path dispatches `snapshot`, `getInfo`, and the underlying
 * `read` as a single pipelined CapTP batch, so each wrapper `read`
 * costs exactly one round-trip — same as a plain (uncached) read.
 *
 * Tests:
 *
 *   - **Cache miss** — first read of a file. The transcript shows
 *     `snapshot` + `getInfo` + `read` issued in one batch, then the
 *     background cache populate (`fetch` + `streamBase64`). The
 *     speculative `read`'s bytes flow to the caller; the
 *     populating `fetch` runs after the caller has already received
 *     the response.
 *
 *   - **Cache hit** — second read of a file whose hash is in the
 *     CAS. The transcript shows `snapshot` + `getInfo` + a
 *     speculative `read` invocation, but the bytes from that
 *     speculative read **never flow** (`@endo/exo-stream` is
 *     pull-based; the wrapper returns a different reader and the
 *     speculative one is GC'd unused). Concrete assertion: the
 *     hit-side transcript carries no `streamBase64` CTP_CALL.
 *
 *   - **No extra RTT** — by the time the caller's `await` resolves,
 *     the wire has carried exactly one `read` round-trip and the
 *     bytes are in hand. The miss/hit transcript snapshots pin
 *     this directly.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { makeInMemoryFilesystem } from '../src/in-memory.js';
import { makeNodeFilesystem } from '../src/node-fs.js';
import { makeMemoryCas } from '../src/cas.js';
import { withCachedReads } from '../src/cached-fs.js';
import { makeConnectedPair, settle } from './_captp-pair.js';

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

const populateFile = async (fs, name, contents) => {
  const root = await E(fs).root();
  const opened = await E(root).create(name, {});
  await writeBytes(await E(opened).write(0n), utf8(contents));
  await E(opened).close();
};

test('withCachedReads: miss serves speculative read in one RTT batch, populates cache in background', async t => {
  const innerFs = makeInMemoryFilesystem();
  await populateFile(innerFs, 'greet.txt', 'hello, world');
  const { bootstrapRef, transcript } = makeConnectedPair(innerFs);

  const cas = makeMemoryCas();
  const fs = withCachedReads(bootstrapRef, cas);

  // Drain the bootstrap exchange so the snapshot below focuses on
  // the wrapper traffic.
  await E(fs).root();

  const root = await E(fs).root();
  const file = await E(root).lookup('greet.txt');
  const oh = await E(file).open({ read: true });

  // Checkpoint right before the wrapper's read call so the
  // assertion below isolates the read's batch from the lookup /
  // open / getQid traffic.
  const beforeRead = transcript.length;
  const reader = await E(oh).read(0n, 64n);
  const bytes = await collectBytes(reader);
  t.is(fromUtf8(bytes), 'hello, world');

  // Wait long enough for the background cache populate to finish
  // so the snapshot captures both the miss read and the populate.
  await settle(20);

  t.is(cas.size, 1, 'CAS populated after the miss');

  // The wrapper's miss path issues `snapshot` + `getInfo` +
  // (speculative) `read` in a single pipelined batch. Verify all
  // three CTP_CALLs appear in the read's segment of the
  // transcript before any reply to them lands.
  const readSegment = transcript.slice(beforeRead);
  const firstReturnAt = readSegment.findIndex(e => e.type === 'CTP_RETURN');
  const callsBefore = readSegment
    .slice(0, firstReturnAt)
    .filter(e => e.type === 'CTP_CALL')
    .map(e => e.method);
  t.true(
    callsBefore.includes('snapshot'),
    `snapshot in pipelined batch, got ${callsBefore.join(', ')}`,
  );
  t.true(
    callsBefore.includes('getInfo'),
    `getInfo in pipelined batch, got ${callsBefore.join(', ')}`,
  );
  t.true(
    callsBefore.includes('read'),
    `speculative read in pipelined batch, got ${callsBefore.join(', ')}`,
  );

  t.snapshot(
    transcript,
    'miss transcript: speculative read + background populate',
  );
});

test('withCachedReads: hit returns cached bytes without flowing the speculative read', async t => {
  const innerFs = makeInMemoryFilesystem();
  await populateFile(innerFs, 'greet.txt', 'hello, world');
  const { bootstrapRef, transcript } = makeConnectedPair(innerFs);

  const cas = makeMemoryCas();
  const fs = withCachedReads(bootstrapRef, cas);

  // Prime the cache with a first read; settle the background
  // populate.
  await E(fs).root();
  const rootP1 = await E(fs).root();
  const fileP1 = await E(rootP1).lookup('greet.txt');
  const ohP1 = await E(fileP1).open({ read: true });
  await collectBytes(await E(ohP1).read(0n, 64n));
  await settle(20);
  t.is(cas.size, 1, 'cache populated after the first read');
  const primingEnd = transcript.length;

  // Second read of the same content. The wrapper should serve
  // from the CAS; the speculative read's bytes must not flow.
  const root = await E(fs).root();
  const file = await E(root).lookup('greet.txt');
  const oh = await E(file).open({ read: true });
  const reader = await E(oh).read(0n, 64n);
  const bytes = await collectBytes(reader);
  t.is(fromUtf8(bytes), 'hello, world');
  await settle(5);

  const hitTraffic = transcript.slice(primingEnd);
  const hitMethods = hitTraffic
    .filter(e => e.type === 'CTP_CALL')
    .map(e => e.method);

  // The wrapper still dispatches snapshot + getInfo + read in a
  // batch (it can't know it's a hit before getInfo resolves).
  t.true(hitMethods.includes('snapshot'));
  t.true(hitMethods.includes('getInfo'));
  t.true(hitMethods.includes('read'));

  // The hit signature: the speculative read's PassableBytesReader
  // is never iterated, so no `streamBase64` CALL ever crosses the
  // wire. This is what makes the cache hit a real win — the bytes
  // themselves never travel.
  t.is(
    hitMethods.filter(m => m === 'streamBase64').length,
    0,
    "speculative reader is GC'd unused; no streamBase64 on the wire",
  );

  t.snapshot(
    hitTraffic,
    'hit transcript: snapshot + getInfo + speculative read, no streamBase64',
  );
});

test('withCachedReads: distinct files with the same content share one CAS slot', async t => {
  const innerFs = makeInMemoryFilesystem();
  await populateFile(innerFs, 'one.txt', 'same bytes');
  await populateFile(innerFs, 'two.txt', 'same bytes');
  const { bootstrapRef } = makeConnectedPair(innerFs);

  const cas = makeMemoryCas();
  const fs = withCachedReads(bootstrapRef, cas);

  const root = await E(fs).root();

  for (const name of ['one.txt', 'two.txt']) {
    const file = await E(root).lookup(name);
    const oh = await E(file).open({ read: true });
    await collectBytes(await E(oh).read(0n, 64n));
  }
  await settle(20);

  t.is(cas.size, 1, 'identical content → one CAS slot');
});

test('withCachedReads: subsequent reads of different ranges of the same file all hit', async t => {
  const innerFs = makeInMemoryFilesystem();
  await populateFile(innerFs, 'long.txt', 'a'.repeat(1024));
  const { bootstrapRef, transcript } = makeConnectedPair(innerFs);

  const cas = makeMemoryCas();
  const fs = withCachedReads(bootstrapRef, cas);

  const root = await E(fs).root();
  const file = await E(root).lookup('long.txt');
  const oh = await E(file).open({ read: true });

  // Prime the cache.
  await collectBytes(await E(oh).read(0n, 128n));
  await settle(20);
  const primedEnd = transcript.length;

  // Range reads from the cached content.
  const headBytes = await collectBytes(await E(oh).read(0n, 16n));
  t.is(headBytes.length, 16);
  const tailBytes = await collectBytes(await E(oh).read(1008n, 16n));
  t.is(tailBytes.length, 16);
  await settle(5);

  // Range reads after the priming should all be hits — no
  // `streamBase64` should travel.
  const subsequent = transcript.slice(primedEnd);
  const streamCalls = subsequent.filter(
    e => e.type === 'CTP_CALL' && e.method === 'streamBase64',
  );
  t.is(
    streamCalls.length,
    0,
    'range reads after cache populate are all hits — no bytes on the wire',
  );
});

test('withCachedReads: subsequent reads through the same File cap skip snapshot+getInfo (zero RTT on hit)', async t => {
  // After the first read warms both the CAS and the per-File hash
  // cache, a second read on the *same* File cap should serve the
  // bytes locally without issuing snapshot/getInfo/read.
  const innerFs = makeInMemoryFilesystem();
  await populateFile(innerFs, 'greet.txt', 'hello, world');
  const { bootstrapRef, transcript } = makeConnectedPair(innerFs);

  const cas = makeMemoryCas();
  const fs = withCachedReads(bootstrapRef, cas);

  const root = await E(fs).root();
  const file = await E(root).lookup('greet.txt');
  const oh = await E(file).open({ read: true });

  // Prime: first read populates the CAS and the per-File hash.
  await collectBytes(await E(oh).read(0n, 64n));
  await settle(20);
  const afterPrime = transcript.length;

  // Second read on the same File-derived OpenFile. The hash is
  // known, no watcher event has fired, the CAS holds the payload —
  // so no CTP_CALL crosses the wire from the read path.
  const bytes = await collectBytes(await E(oh).read(0n, 64n));
  t.is(fromUtf8(bytes), 'hello, world');
  await settle(5);

  const secondCalls = transcript
    .slice(afterPrime)
    .filter(e => e.type === 'CTP_CALL')
    .map(e => e.method);
  t.deepEqual(
    secondCalls,
    [],
    'zero-RTT second read: no snapshot/getInfo/read crosses the wire',
  );
});

test('withCachedReads: rename across wrapped directories unwraps the destination', async t => {
  // The disk-backed `node-fs.js` identifies the rename destination
  // by a private `WeakMap` keyed on the underlying Directory exo.
  // A wrapped Directory is a different exo, so passing it through
  // unchanged would raise EXDEV. The wrapper must unwrap before
  // forwarding.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cached-fs-rename-'));
  t.teardown(() => rm(dir, { recursive: true, force: true }));
  const innerFs = makeNodeFilesystem({ rootPath: dir });
  const innerRoot = await E(innerFs).root();
  const opened = await E(innerRoot).create('moveme.txt', {});
  await E(opened).close();
  await E(innerRoot).mkdir('subdir', {});

  const cas = makeMemoryCas();
  const fs = withCachedReads(innerFs, cas);

  const root = await E(fs).root();
  const subdir = await E(root).lookup('subdir');

  // The destination here is the wrapped Directory cap from the
  // cached-fs wrapper. Without the unwrap, the underlying
  // node-fs.rename would surface EXDEV.
  await E(root).rename('moveme.txt', subdir, 'moved.txt');

  const after = await E(subdir).lookup('moved.txt');
  t.is((await E(after).getAttrs()).size, 0n);
});

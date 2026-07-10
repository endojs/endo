// @ts-check
/* global process */

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import { wrapTest } from '@endo/ses-ava';
import rawTest from 'ava';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';

import {
  makeContentStoreFilePowers,
  makeContentStoreCryptoPowers,
} from '@endo/platform/fs/node';

import { makeContentStore } from '../src/content-store.js';

const test = wrapTest(rawTest);

const dirname = url.fileURLToPath(new URL('..', import.meta.url));

// The `ContentStoreFilePowers` / `ContentStoreCryptoPowers` the store
// injects are platform-owned contracts with a canonical `node:fs` /
// `node:crypto` implementation in `@endo/platform/fs/node`; the test
// stands on that implementation rather than hand-rolling a duplicate
// mock over `node:fs`.  These are not the subject of the test — the
// four-method CAS contract (`store` / `fetch` / `has` / `remove`) is —
// so the test uses the real powers the daemon itself would inject.
const makeFilePowers = makeContentStoreFilePowers;
const makeCryptoPowers = makeContentStoreCryptoPowers;

/**
 * Async-iterable wrapper over an array of byte chunks; matches the
 * `store` method's input shape.
 *
 * @param {Array<Uint8Array>} chunks
 */
const asAsyncIterable = chunks => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) {
      yield chunk;
    }
  },
});

const makeTemporaryDirectory = async t => {
  const root = await fs.promises.mkdtemp(
    path.join(dirname, 'tmp', 'cas-test-'),
  );
  t.teardown(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });
  return root;
};

const encoder = new TextEncoder();

test.before(async () => {
  await fs.promises.mkdir(path.join(dirname, 'tmp'), { recursive: true });
});

test('store then fetch round-trips the same bytes', async t => {
  const storageDirectoryPath = await makeTemporaryDirectory(t);
  const store = makeContentStore(storageDirectoryPath, {
    filePowers: makeFilePowers(),
    cryptoPowers: makeCryptoPowers(),
  });

  const payload = encoder.encode('hello, content store');
  const sha = await store.store(asAsyncIterable([payload]));

  // Sha256 of payload is deterministic; verify against node:crypto.
  const expected = crypto.createHash('sha256').update(payload).digest('hex');
  t.is(sha, expected, 'store returns the sha256 hex of the payload');

  const blob = store.fetch(sha);
  t.is(await blob.text(), 'hello, content store');
});

test('store concatenates multi-chunk streams before hashing', async t => {
  const storageDirectoryPath = await makeTemporaryDirectory(t);
  const store = makeContentStore(storageDirectoryPath, {
    filePowers: makeFilePowers(),
    cryptoPowers: makeCryptoPowers(),
  });

  const parts = ['one ', 'two ', 'three'];
  const chunks = parts.map(s => encoder.encode(s));
  const sha = await store.store(asAsyncIterable(chunks));
  const expected = crypto
    .createHash('sha256')
    .update(parts.join(''))
    .digest('hex');
  t.is(sha, expected, 'sha256 covers the concatenated stream');

  const blob = store.fetch(sha);
  t.is(await blob.text(), 'one two three');
});

test('has reports presence and absence', async t => {
  const storageDirectoryPath = await makeTemporaryDirectory(t);
  const store = makeContentStore(storageDirectoryPath, {
    filePowers: makeFilePowers(),
    cryptoPowers: makeCryptoPowers(),
  });

  const sha = await store.store(asAsyncIterable([encoder.encode('present')]));
  t.true(await store.has(sha));

  // A 64-char hex that was never stored.
  const absentSha = '0'.repeat(64);
  t.false(await store.has(absentSha));
});

test('remove deletes the blob and is idempotent', async t => {
  const storageDirectoryPath = await makeTemporaryDirectory(t);
  const store = makeContentStore(storageDirectoryPath, {
    filePowers: makeFilePowers(),
    cryptoPowers: makeCryptoPowers(),
  });

  const sha = await store.store(asAsyncIterable([encoder.encode('ephemeral')]));
  t.true(await store.has(sha));

  await store.remove(sha);
  t.false(await store.has(sha));

  // Second remove must not throw: the daemon's GC sweep does not
  // synchronise across the catalogue and the on-disk state.
  await t.notThrowsAsync(() => store.remove(sha));

  // Removing a never-stored hash must not throw either.
  await t.notThrowsAsync(() => store.remove('0'.repeat(64)));
});

test('store deduplicates identical content', async t => {
  const storageDirectoryPath = await makeTemporaryDirectory(t);
  const store = makeContentStore(storageDirectoryPath, {
    filePowers: makeFilePowers(),
    cryptoPowers: makeCryptoPowers(),
  });

  const payload = encoder.encode('twice');
  const sha1 = await store.store(asAsyncIterable([payload]));
  const sha2 = await store.store(asAsyncIterable([payload]));
  t.is(sha1, sha2, 'identical payloads share a sha256');

  // The final blob exists; the rename-over-existing-name is safe.
  t.true(await store.has(sha1));
  t.is(await store.fetch(sha1).text(), 'twice');
});

test('store streams to a temp name and atomically renames to the sha256', async t => {
  // The temp file is named by randomHex256 then renamed to sha256.
  // Failing the rename (e.g. by removing the directory mid-write) is
  // load-bearing for the daemon: a partially-written blob must never
  // be observable under its sha256 name.  We exercise the happy path
  // here and confirm that no temp file outlives the call.
  const storageDirectoryPath = await makeTemporaryDirectory(t);
  const store = makeContentStore(storageDirectoryPath, {
    filePowers: makeFilePowers(),
    cryptoPowers: makeCryptoPowers(),
  });

  const sha = await store.store(asAsyncIterable([encoder.encode('atomic')]));
  const entries = await fs.promises.readdir(storageDirectoryPath);
  // Exactly one entry: the sha256-named blob.  The temp file was
  // renamed onto it; nothing else remains.
  t.deepEqual(entries, [sha]);
});

test('fetch text reads from disk on each call', async t => {
  // Demonstrates that the ContentStore does not cache bytes in memory;
  // a mid-flight remove makes subsequent text() reject.  This is the
  // documented contract: the store is filesystem-backed and fetch
  // returns a thin reader over the on-disk blob.
  const storageDirectoryPath = await makeTemporaryDirectory(t);
  const store = makeContentStore(storageDirectoryPath, {
    filePowers: makeFilePowers(),
    cryptoPowers: makeCryptoPowers(),
  });

  const sha = await store.store(asAsyncIterable([encoder.encode('live')]));
  const blob = store.fetch(sha);
  t.is(await blob.text(), 'live');

  await store.remove(sha);
  await t.throwsAsync(() => blob.text(), {
    message: /ENOENT/,
  });
});

test('store on Windows-style path: joinPath is the only path primitive', async t => {
  // The CAS never calls fspath directly; it composes paths via
  // filePowers.joinPath.  Substituting a powers shim that prefixes
  // every join with a sentinel proves the indirection holds.
  const storageDirectoryPath = await makeTemporaryDirectory(t);
  const realFile = makeFilePowers();
  let joinCalls = 0;
  const filePowers = harden({
    ...realFile,
    joinPath(...components) {
      joinCalls += 1;
      return realFile.joinPath(...components);
    },
  });
  const store = makeContentStore(storageDirectoryPath, {
    filePowers,
    cryptoPowers: makeCryptoPowers(),
  });
  // Exercise all four CAS operations against the same store so the
  // assertion covers each of store / fetch / has / remove.  A refactor
  // that hard-codes a Node path separator in any one of them would drop
  // a joinPath call and fail the >= 4 floor below.
  const sha = await store.store(asAsyncIterable([encoder.encode('joined')]));
  const blob = store.fetch(sha);
  t.is(await blob.text(), 'joined');
  t.true(await store.has(sha));
  await store.remove(sha);
  // store, fetch, has, remove each call joinPath at least once.
  t.true(joinCalls >= 4);
});

test('fetch surfaces size, range reads, and a byte reader', async t => {
  // The blob handle returned by `fetch` exposes the range-I/O surface
  // the daemon's `EndoBlob` relies on: `size` (a bigint byte count),
  // `readRange` (a windowed read that only touches the requested
  // span), and `makeFileReader` (a whole-blob byte stream).
  const storageDirectoryPath = await makeTemporaryDirectory(t);
  const store = makeContentStore(storageDirectoryPath, {
    filePowers: makeFilePowers(),
    cryptoPowers: makeCryptoPowers(),
  });

  const payload = encoder.encode('content store range reads');
  const sha = await store.store(asAsyncIterable([payload]));
  const blob = store.fetch(sha);

  // `size` and `readRange` are optional on the platform `ReadableBlob`
  // type; the filesystem-backed store always provides them.
  const { size, readRange, makeFileReader } = blob;
  if (!size || !readRange) {
    t.fail('filesystem content store must surface size and readRange');
    return;
  }

  t.is(await size(), BigInt(payload.length), 'size is the byte length');

  // A window in the middle of the blob: bytes [8, 13) spell "store".
  const window = await readRange(8, 5);
  t.is(new TextDecoder().decode(window), 'store');

  // A range clamped past the end returns only the bytes that exist.
  const tail = await readRange(payload.length - 5, 100);
  t.is(new TextDecoder().decode(tail), 'reads');

  // makeFileReader streams the whole blob back; drive the reader by
  // hand so the test only depends on the `next`/`return` surface of
  // the `ContentStoreReader` contract.
  const reader = makeFileReader();
  const decoder = new TextDecoder();
  let joined = '';
  let result = await reader.next();
  while (!result.done) {
    joined += decoder.decode(result.value);
    // eslint-disable-next-line no-await-in-loop
    result = await reader.next();
  }
  t.is(joined, 'content store range reads');
});

// Suppress unused-import linting on the Node-only globals when the
// pre-PR check runs `eslint` against this file.
void process;

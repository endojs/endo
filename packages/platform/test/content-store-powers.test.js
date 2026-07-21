// @ts-nocheck

/**
 * `makeContentStoreFilePowers` / `makeContentStoreCryptoPowers` tests —
 * the reusable real-`node:fs` / `node:crypto` powers a filesystem-backed
 * `ContentStore` (such as `@endo/daemon-cas`) injects. The powers are
 * exercised directly here (not through a `ContentStore`, which lives
 * downstream in `@endo/daemon-cas`) so the contract is pinned at its
 * source. The final case drives the same write -> hash -> atomic-rename
 * -> read-back loop the CAS `store` / `fetch` methods run.
 */

import '@endo/init/debug.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import test from 'ava';

import {
  makeContentStoreFilePowers,
  makeContentStoreCryptoPowers,
} from '../src/fs-node/content-store-powers.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const makeTemporaryDirectory = t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-store-powers-'));
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

const collectReader = async reader => {
  let joined = '';
  let result = await reader.next();
  while (!result.done) {
    joined += decoder.decode(result.value);
    // eslint-disable-next-line no-await-in-loop
    result = await reader.next();
  }
  return joined;
};

test('makeSha256 hex matches node:crypto and is streaming', t => {
  const cryptoPowers = makeContentStoreCryptoPowers();
  const digester = cryptoPowers.makeSha256();
  digester.update(encoder.encode('one '));
  digester.update(encoder.encode('two '));
  digester.update(encoder.encode('three'));
  const expected = createHash('sha256').update('one two three').digest('hex');
  t.is(
    digester.digestHex(),
    expected,
    'digestHex is lowercase hex over the stream',
  );
});

test('randomHex256 returns 64 lowercase hex chars, distinct each call', async t => {
  const cryptoPowers = makeContentStoreCryptoPowers();
  const a = await cryptoPowers.randomHex256();
  const b = await cryptoPowers.randomHex256();
  t.regex(a, /^[0-9a-f]{64}$/, 'a 32-byte hex string');
  t.regex(b, /^[0-9a-f]{64}$/, 'the second draw is also a 32-byte hex string');
  t.not(a, b, 'two draws differ');
});

test('joinPath composes via node:path', t => {
  const filePowers = makeContentStoreFilePowers();
  t.is(
    filePowers.joinPath('a', 'store-sha256', 'b'),
    path.join('a', 'store-sha256', 'b'),
  );
});

test('makePath creates directories recursively', async t => {
  const filePowers = makeContentStoreFilePowers();
  const root = makeTemporaryDirectory(t);
  const nested = path.join(root, 'store-sha256', 'nested');
  await filePowers.makePath(nested);
  t.true(fs.statSync(nested).isDirectory());
});

test('makeFileWriter then makeFileReader round-trips multi-chunk bytes', async t => {
  const filePowers = makeContentStoreFilePowers();
  const root = makeTemporaryDirectory(t);
  const target = path.join(root, 'blob');
  const writer = filePowers.makeFileWriter(target);
  await writer.next(encoder.encode('content '));
  await writer.next(encoder.encode('store '));
  await writer.next(encoder.encode('range reads'));
  await writer.return(undefined);
  t.is(
    await collectReader(filePowers.makeFileReader(target)),
    'content store range reads',
  );
  t.is(await filePowers.readFileText(target), 'content store range reads');
});

test('empty blob: zero-update digest and zero-chunk round-trip', async t => {
  // The empty blob is a legitimate content-store input; its sha256 is the
  // well-known e3b0c442... Pin both the crypto and the file seam at that
  // corner: a digester fed nothing, and a writer closed without a chunk.
  const filePowers = makeContentStoreFilePowers();
  const cryptoPowers = makeContentStoreCryptoPowers();
  const emptyDigest = cryptoPowers.makeSha256().digestHex();
  t.is(
    emptyDigest,
    createHash('sha256').update('').digest('hex'),
    'the zero-update digest is the empty-input sha256',
  );

  const root = makeTemporaryDirectory(t);
  const target = path.join(root, 'empty-blob');
  const writer = filePowers.makeFileWriter(target);
  await writer.return(undefined);
  t.is(await collectReader(filePowers.makeFileReader(target)), '');
  t.is(await filePowers.readFileText(target), '');
  t.is((await filePowers.statPath(target)).size, 0n);
});

test('readFileRange windows and clamps at end of file', async t => {
  const filePowers = makeContentStoreFilePowers();
  const root = makeTemporaryDirectory(t);
  const target = path.join(root, 'blob');
  fs.writeFileSync(target, 'content store range reads');
  const window = await filePowers.readFileRange(target, 8, 5);
  t.is(decoder.decode(window), 'store');
  const tail = await filePowers.readFileRange(target, 20, 100);
  t.is(decoder.decode(tail), 'reads', 'clamped past the end');
  const empty = await filePowers.readFileRange(target, 0, 0);
  t.is(empty.length, 0, 'zero-length window is empty');
});

test('statPath reports kind and bigint size', async t => {
  const filePowers = makeContentStoreFilePowers();
  const root = makeTemporaryDirectory(t);
  const target = path.join(root, 'blob');
  fs.writeFileSync(target, 'twelve bytes');
  const stat = await filePowers.statPath(target);
  t.is(stat.kind, 'file');
  t.is(stat.size, 12n);
  t.is(typeof stat.mtime, 'bigint');
  const dirStat = await filePowers.statPath(root);
  t.is(dirStat.kind, 'directory');
});

test('renamePath atomically moves the temp blob onto its final name', async t => {
  const filePowers = makeContentStoreFilePowers();
  const root = makeTemporaryDirectory(t);
  const temp = path.join(root, 'temp-name');
  const final = path.join(root, 'final-name');
  fs.writeFileSync(temp, 'atomic');
  await filePowers.renamePath(temp, final);
  t.deepEqual(fs.readdirSync(root), ['final-name']);
  t.is(fs.readFileSync(final, 'utf-8'), 'atomic');
});

test('removePath is idempotent', async t => {
  const filePowers = makeContentStoreFilePowers();
  const root = makeTemporaryDirectory(t);
  const target = path.join(root, 'blob');
  fs.writeFileSync(target, 'ephemeral');
  await filePowers.removePath(target);
  t.false(fs.existsSync(target));
  await t.notThrowsAsync(
    () => filePowers.removePath(target),
    'second remove is a no-op',
  );
  await t.notThrowsAsync(
    () => filePowers.removePath(path.join(root, 'never-stored')),
    'removing a missing path is a no-op',
  );
});

test('store loop: write to a temp name, hash the stream, rename to the sha256, read back', async t => {
  // Mirrors the `makeContentStore.store` / `fetch` sequence so the powers
  // are proven against the exact contract the CAS layer stands on.
  const filePowers = makeContentStoreFilePowers();
  const cryptoPowers = makeContentStoreCryptoPowers();
  const root = makeTemporaryDirectory(t);
  const storageDirectoryPath = path.join(root, 'store-sha256');
  await filePowers.makePath(storageDirectoryPath);

  const chunks = ['hello, ', 'content ', 'store'].map(s => encoder.encode(s));
  const digester = cryptoPowers.makeSha256();
  const temporaryName = await cryptoPowers.randomHex256();
  const temporaryPath = filePowers.joinPath(
    storageDirectoryPath,
    temporaryName,
  );
  const writer = filePowers.makeFileWriter(temporaryPath);
  for (const chunk of chunks) {
    digester.update(chunk);
    // eslint-disable-next-line no-await-in-loop
    await writer.next(chunk);
  }
  await writer.return(undefined);

  const sha256 = digester.digestHex();
  const expected = createHash('sha256')
    .update('hello, content store')
    .digest('hex');
  t.is(sha256, expected, 'the streamed digest matches node:crypto');

  const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
  await filePowers.renamePath(temporaryPath, storagePath);
  t.deepEqual(
    fs.readdirSync(storageDirectoryPath),
    [sha256],
    'only the sha256-named blob remains',
  );
  t.is(await filePowers.readFileText(storagePath), 'hello, content store');
  t.is((await filePowers.statPath(storagePath)).size, 20n);
});

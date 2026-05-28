// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import { makeInMemoryFilesystem } from '@endo/endo-fs';
import { makeTreeView } from '../src/tree-view.js';

const utf8 = s => new TextEncoder().encode(s);

const writeBytes = async (writerRef, bytes) => {
  const writer = iterateBytesWriter(writerRef);
  await writer.next(bytes);
  await writer.return();
};

/**
 * Walk an array of directory names from the given root, returning
 * the leaf Directory. The pipelined `materialise` is one round-trip
 * per segment (server-side branching), avoiding a per-segment
 * mkdir/lookup race.
 */
const ensureDir = async (root, segments) => {
  if (segments.length === 0) {
    return root;
  }
  return E(root).materialise(segments, {});
};

const writeFileAt = async (root, segments, bytes) => {
  const parent = await ensureDir(root, segments.slice(0, -1));
  const name = segments[segments.length - 1];
  const openFile = await E(parent).create(name, {});
  await writeBytes(await E(openFile).write(0n), bytes);
  await E(openFile).close();
};

test('lookup(string) reads a root-level file', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await writeFileAt(
    root,
    ['compartment-map.json'],
    utf8('{"compartments":{}}'),
  );

  const tree = makeTreeView(fs);
  const blob = await E(tree).lookup('compartment-map.json');
  t.is(await E(blob).text(), '{"compartments":{}}');
});

test('lookup(array) reads a nested file', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await writeFileAt(
    root,
    ['app', 'src', 'foo.js'],
    utf8('export const x = 1;'),
  );

  const tree = makeTreeView(fs);
  const blob = await E(tree).lookup(['app', 'src', 'foo.js']);
  t.is(await E(blob).text(), 'export const x = 1;');
});

test('subPath rebases lookups', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await writeFileAt(
    root,
    ['apps', 'widget', 'compartment-map.json'],
    utf8('{"widget":true}'),
  );

  const tree = makeTreeView(fs, { subPath: 'apps/widget' });
  const blob = await E(tree).lookup('compartment-map.json');
  t.is(await E(blob).text(), '{"widget":true}');
});

test('subPath accepts an array form', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await writeFileAt(root, ['a', 'b', 'file.txt'], utf8('hi'));

  const tree = makeTreeView(fs, { subPath: ['a', 'b'] });
  const blob = await E(tree).lookup('file.txt');
  t.is(await E(blob).text(), 'hi');
});

test('embedded slashes in lookup segments are split', async t => {
  // Mirrors the daemon's `archivePath.split('/').filter(Boolean)`:
  // callers may pass slash-joined segments and they must walk
  // through intermediate directories.
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  await writeFileAt(root, ['app', 'src', 'foo.js'], utf8('ok'));

  const tree = makeTreeView(fs);
  const blob = await E(tree).lookup(['app', 'src/foo.js']);
  t.is(await E(blob).text(), 'ok');
});

test('missing file rejects', async t => {
  const fs = makeInMemoryFilesystem();
  const tree = makeTreeView(fs);
  const blob = await E(tree).lookup('nope.json');
  await t.throwsAsync(E(blob).text());
});

test('empty lookup rejects', async t => {
  const fs = makeInMemoryFilesystem();
  const tree = makeTreeView(fs);
  await t.throwsAsync(E(tree).lookup(''), { message: /non-empty path/ });
});

test('traversal segments are rejected at lookup', async t => {
  const fs = makeInMemoryFilesystem();
  const tree = makeTreeView(fs);
  await t.throwsAsync(E(tree).lookup('..'), { message: /traversal/ });
  await t.throwsAsync(E(tree).lookup(['a', '..']), { message: /traversal/ });
  await t.throwsAsync(E(tree).lookup(['.']), { message: /traversal/ });
});

test('traversal segments are rejected in subPath', async t => {
  const fs = makeInMemoryFilesystem();
  t.throws(() => makeTreeView(fs, { subPath: '../escape' }), {
    message: /traversal/,
  });
});

test('non-UTF-8 contents surface a decode error rather than mojibake', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  // 0xff 0xfe 0xfd is not valid UTF-8.
  await writeFileAt(root, ['bin.dat'], new Uint8Array([0xff, 0xfe, 0xfd]));

  const tree = makeTreeView(fs);
  const blob = await E(tree).lookup('bin.dat');
  await t.throwsAsync(E(blob).text());
});

test('zero-byte file reads as empty string', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const openFile = await E(root).create('empty', {});
  await E(openFile).close();

  const tree = makeTreeView(fs);
  const blob = await E(tree).lookup('empty');
  t.is(await E(blob).text(), '');
});

test('round-trips a payload larger than the default 100KB string limit', async t => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  // 200 KB of 'x' — exceeds the M.string default cap; the per-frame
  // stringLengthLimit in drainBytesReader must lift it.
  const big = 'x'.repeat(200_000);
  await writeFileAt(root, ['big.txt'], utf8(big));

  const tree = makeTreeView(fs);
  const blob = await E(tree).lookup('big.txt');
  t.is(await E(blob).text(), big);
});

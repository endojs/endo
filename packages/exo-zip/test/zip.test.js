// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import { ZipReader } from '@endo/zip/reader.js';
import { inflate } from '@endo/zip/inflate.js';
import { unzip } from '@endo/exo-unzip';

import { zip } from '../index.js';

const textEncoder = new TextEncoder();

// `zip()` emits DEFLATE entries on hosts with `CompressionStream`
// (the project's full Node 18+ matrix and modern browsers); the
// re-read assertions therefore go through the async `get()` path
// with `inflate` injected so the round-trip is symmetric.
const openOutput = bytes => new ZipReader(bytes, { inflate });

test('round-trip: zip(unzip(bytes)) recovers entries byte-for-byte', async t => {
  // Build a fixture archive directly via @endo/zip so we know the
  // expected byte content of each entry.
  const { ZipWriter } = await import('@endo/zip/writer.js');
  const original = {
    'README.md': textEncoder.encode('# Hello\n'),
    'src/index.js': textEncoder.encode('export {};\n'),
    'src/util/math.js': textEncoder.encode('export const one = 1;\n'),
    'docs/intro.md': textEncoder.encode('intro\n'),
  };
  const w = new ZipWriter();
  for (const [name, content] of Object.entries(original)) {
    w.write(name, content);
  }
  const inputBytes = w.snapshot();

  // Round-trip: decode, re-encode, decode again.
  const tree = unzip(inputBytes, { name: 'fixture.zip' });
  const outputBytes = await zip(tree);

  const reread = openOutput(outputBytes);
  t.deepEqual([...reread.files.keys()].sort(), Object.keys(original).sort());
  for (const [name, expected] of Object.entries(original)) {
    // eslint-disable-next-line no-await-in-loop
    t.deepEqual([...(await reread.get(name))], [...expected]);
  }
});

test('zip preserves binary content', async t => {
  const { ZipWriter } = await import('@endo/zip/writer.js');
  const w = new ZipWriter();
  const payload = new Uint8Array([0, 1, 2, 3, 0xff, 0xfe, 0xfd, 0x80]);
  w.write('binary.dat', payload);
  const inputBytes = w.snapshot();

  const tree = unzip(inputBytes);
  const outputBytes = await zip(tree);

  const reread = openOutput(outputBytes);
  t.deepEqual([...(await reread.get('binary.dat'))], [...payload]);
});

test('zip preserves a single entry at the root', async t => {
  const { ZipWriter } = await import('@endo/zip/writer.js');
  const w = new ZipWriter();
  w.write('only.txt', textEncoder.encode('alone'));
  const inputBytes = w.snapshot();

  const tree = unzip(inputBytes);
  const outputBytes = await zip(tree);

  const reread = openOutput(outputBytes);
  t.deepEqual([...reread.files.keys()], ['only.txt']);
  t.is(new TextDecoder().decode(await reread.get('only.txt')), 'alone');
});

test('zip preserves a deeply nested entry', async t => {
  const { ZipWriter } = await import('@endo/zip/writer.js');
  const w = new ZipWriter();
  w.write('a/b/c/d/e.txt', textEncoder.encode('deep'));
  const inputBytes = w.snapshot();

  const tree = unzip(inputBytes);
  const outputBytes = await zip(tree);

  const reread = openOutput(outputBytes);
  t.deepEqual([...reread.files.keys()], ['a/b/c/d/e.txt']);
  t.is(new TextDecoder().decode(await reread.get('a/b/c/d/e.txt')), 'deep');
});

test('zip drains a multi-chunk streamBase64 across base64 group boundaries', async t => {
  // The `@endo/exo-unzip` blob producer chunks at 48 KiB raw to keep
  // CapTP frames small; this test feeds it a payload large enough to
  // span multiple chunks and itself not a multiple of 3 bytes, so the
  // accumulate-then-decode path in `drainBase64` is exercised across
  // a boundary that would silently misalign under per-chunk decode if
  // any non-final chunk ever included `=` padding.
  const { ZipWriter } = await import('@endo/zip/writer.js');
  const w = new ZipWriter();
  const total = 100_000;
  const payload = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    payload[i] = (i * 31 + 7) % 256;
  }
  w.write('big.bin', payload);
  const inputBytes = w.snapshot();

  const tree = unzip(inputBytes);
  const outputBytes = await zip(tree);

  const reread = openOutput(outputBytes);
  t.deepEqual([...(await reread.get('big.bin'))], [...payload]);
});

test('zip on an empty tree produces a parseable archive with no entries', async t => {
  const { ZipWriter } = await import('@endo/zip/writer.js');
  const inputBytes = new ZipWriter().snapshot();

  const tree = unzip(inputBytes);
  const outputBytes = await zip(tree);

  const reread = openOutput(outputBytes);
  t.deepEqual([...reread.files.keys()], []);
});

test('zip honours the date option for entry mtimes', async t => {
  const { ZipWriter } = await import('@endo/zip/writer.js');
  const w = new ZipWriter();
  w.write('marker.txt', textEncoder.encode('x'));
  const inputBytes = w.snapshot();

  const tree = unzip(inputBytes);
  const stableDate = new Date(2026, 0, 1);
  const outputBytes = await zip(tree, { date: stableDate });

  // Two zips with the same date should produce byte-identical output
  // (modulo entry-order). Re-zipping a second time with the same date
  // and verifying byte equality is the cheapest determinism check.
  const outputBytes2 = await zip(tree, { date: stableDate });
  t.deepEqual([...outputBytes], [...outputBytes2]);
});

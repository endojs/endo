// @ts-nocheck

/**
 * `makeLocalBlob` tests — the host-file ReadableBlob now also exposes the
 * richer `BlobRef` range-I/O surface (getInfo / fetch). See
 * designs/fs-interface-consolidation.md § C4.
 */

import '@endo/init/debug.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';

import { makeLocalBlob } from '../src/fs-node/local-blob.js';

const fromUtf8 = b => new TextDecoder().decode(b);

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

const makeTempFile = (t, contents) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-blob-'));
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'blob.txt');
  fs.writeFileSync(filePath, contents);
  return filePath;
};

test('LocalBlob.getInfo returns the content-address triple', async t => {
  const payload = 'hello world\n'; // 12 bytes
  const blob = makeLocalBlob(makeTempFile(t, payload));
  const info = await E(blob).getInfo();
  t.is(info.algorithm, 'sha256');
  t.is(info.size, 12n);
  t.is(info.hash, createHash('sha256').update(payload).digest('base64'));
});

test('LocalBlob.fetch reads a clamped byte range', async t => {
  const blob = makeLocalBlob(makeTempFile(t, 'hello world\n'));
  t.is(
    fromUtf8(await collectBytes(await E(blob).fetch(0n, 12n))),
    'hello world\n',
  );
  t.is(fromUtf8(await collectBytes(await E(blob).fetch(0n, 5n))), 'hello');
  t.is(fromUtf8(await collectBytes(await E(blob).fetch(6n, 100n))), 'world\n');
  t.is(fromUtf8(await collectBytes(await E(blob).fetch(100n, 4n))), '');
});

test('LocalBlob.fetch rejects a negative or out-of-range window with EINVAL', async t => {
  const blob = makeLocalBlob(makeTempFile(t, 'hello world\n'));
  // A negative offset must throw EINVAL (via toSafeNumber), not slip through
  // to fs.read with a negative position. Same for a negative length and an
  // over-MAX_SAFE_INTEGER bigint.
  await t.throwsAsync(() => E(blob).fetch(-1n, 4n), { message: /EINVAL/ });
  await t.throwsAsync(() => E(blob).fetch(0n, -4n), { message: /EINVAL/ });
  await t.throwsAsync(() => E(blob).fetch(2n ** 60n, 4n), {
    message: /EINVAL/,
  });
});

test('LocalBlob.fetch clamps a huge length to the file size (no over-allocation)', async t => {
  const blob = makeLocalBlob(makeTempFile(t, 'hi')); // 2 bytes
  // A length far larger than the file (and far larger than is sane to
  // allocate) must clamp to the available bytes rather than allocating a
  // multi-GB buffer. `5_000_000_000` is a valid safe integer, so it passes
  // toSafeNumber; the clamp is what keeps the read bounded.
  t.is(
    fromUtf8(await collectBytes(await E(blob).fetch(0n, 5_000_000_000n))),
    'hi',
  );
});

test('LocalBlob still exposes the whole-value surface', async t => {
  const blob = makeLocalBlob(makeTempFile(t, '{"k":1}'));
  t.is(await E(blob).text(), '{"k":1}');
  t.deepEqual(await E(blob).json(), { k: 1 });
});

test('LocalBlob exposes only the rich public ReadableBlob Exo surface', async t => {
  const blob = makeLocalBlob(makeTempFile(t, 'hello world\n'));
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(blob).__getMethodNames__();
  t.deepEqual(methods.filter(name => !name.startsWith('__')).sort(), [
    'fetch',
    'getInfo',
    'help',
    'json',
    'rangeRead',
    'rangeReadText',
    'streamBase64',
    'text',
  ]);
  t.false(methods.includes('readRange'));
  t.false(methods.includes('size'));
  t.false(methods.includes('makeFileReader'));
});

test('LocalBlob.rangeRead returns a clamped byte range as a Uint8Array', async t => {
  const blob = makeLocalBlob(makeTempFile(t, 'hello world\n'));
  const whole = await E(blob).rangeRead(0n, 12n);
  t.true(whole instanceof Uint8Array);
  t.is(fromUtf8(whole), 'hello world\n');
  t.is(fromUtf8(await E(blob).rangeRead(0n, 5n)), 'hello');
  t.is(fromUtf8(await E(blob).rangeRead(6n, 100n)), 'world\n'); // clamps at EOF
  t.is(fromUtf8(await E(blob).rangeRead(100n, 4n)), ''); // past EOF
  t.is(fromUtf8(await E(blob).rangeRead(0n, 0n)), ''); // empty window
});

test('LocalBlob.rangeRead rejects a negative or out-of-range window with EINVAL', async t => {
  const blob = makeLocalBlob(makeTempFile(t, 'hello world\n'));
  await t.throwsAsync(() => E(blob).rangeRead(-1n, 4n), { message: /EINVAL/ });
  await t.throwsAsync(() => E(blob).rangeRead(0n, -4n), { message: /EINVAL/ });
  await t.throwsAsync(() => E(blob).rangeRead(2n ** 60n, 4n), {
    message: /EINVAL/,
  });
});

test('LocalBlob.rangeReadText returns a 0-based, end-exclusive line range', async t => {
  const blob = makeLocalBlob(makeTempFile(t, 'a\nb\nc\nd\ne\n'));
  // Lines are ['a', 'b', 'c', 'd', 'e', ''] (trailing '' after the last '\n').
  t.is(await E(blob).rangeReadText(0, 2), 'a\nb'); // first two lines
  t.is(await E(blob).rangeReadText(1, 3), 'b\nc');
  t.is(await E(blob).rangeReadText(3, 100), 'd\ne\n'); // 'd','e','' joined by '\n'
});

test('LocalBlob.rangeReadText clamps past-the-end and handles the trailing newline', async t => {
  // Trailing '\n' means split yields a final '' element (the empty line after
  // the last newline); slicing past the end clamps rather than throwing.
  const blob = makeLocalBlob(makeTempFile(t, 'a\nb\nc\n'));
  // Lines are ['a', 'b', 'c', ''].
  t.is(await E(blob).rangeReadText(2, 100), 'c\n'); // 'c' + '' joined by '\n'
  t.is(await E(blob).rangeReadText(0, 100), 'a\nb\nc\n');
  t.is(await E(blob).rangeReadText(2, 2), ''); // empty range
  t.is(await E(blob).rangeReadText(5, 9), ''); // wholly past the end
});

test('LocalBlob.rangeReadText rejects a negative or non-integer line index', async t => {
  const blob = makeLocalBlob(makeTempFile(t, 'a\nb\n'));
  await t.throwsAsync(() => E(blob).rangeReadText(-1, 2), {
    message: /EINVAL/,
  });
  await t.throwsAsync(() => E(blob).rangeReadText(0, 1.5), {
    message: /EINVAL/,
  });
});

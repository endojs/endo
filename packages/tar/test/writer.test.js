// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import {
  tarFileHeader,
  tarFilePadding,
  tarEndMarker,
  readTarEntries,
} from '../index.js';

const TAR_BLOCK_SIZE = 512;
const utf8 = new TextEncoder();

/**
 * Concatenate the writer primitives into a single-pass tar archive of the
 * given regular files, then collect the byte chunks.
 *
 * @param {Array<{ path: string, content: string }>} files
 */
const buildTar = files => {
  /** @type {Uint8Array[]} */
  const chunks = [];
  for (const { path, content } of files) {
    const body = utf8.encode(content);
    chunks.push(tarFileHeader(path, body.byteLength));
    chunks.push(body);
    const padding = tarFilePadding(body.byteLength);
    if (padding.byteLength !== 0) {
      chunks.push(padding);
    }
  }
  chunks.push(tarEndMarker());
  return chunks;
};

/** @param {Uint8Array[]} chunks */
const readAll = async chunks => {
  /** @type {Array<{ path: string, type: string, text: string }>} */
  const entries = [];
  const source = (async function* chunkSource() {
    yield* chunks;
  })();
  for await (const entry of readTarEntries(source)) {
    /** @type {Uint8Array[]} */
    const parts = [];
    for await (const part of entry.content) {
      parts.push(part);
    }
    const joined = new Uint8Array(entry.size);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.byteLength;
    }
    entries.push({
      path: entry.path,
      type: entry.type,
      text: new TextDecoder().decode(joined),
    });
  }
  return entries;
};

test('writer round-trips regular files through the reader', async t => {
  const chunks = buildTar([
    { path: 'alpha.txt', content: 'alpha' },
    { path: 'nested/beta.txt', content: 'beta' },
    // A body that exactly fills a block exercises the empty-padding path.
    { path: 'block.bin', content: 'x'.repeat(TAR_BLOCK_SIZE) },
  ]);
  const entries = await readAll(chunks);
  t.deepEqual(
    entries,
    [
      { path: 'alpha.txt', type: 'file', text: 'alpha' },
      { path: 'nested/beta.txt', type: 'file', text: 'beta' },
      { path: 'block.bin', type: 'file', text: 'x'.repeat(TAR_BLOCK_SIZE) },
    ],
    'entries decode with their original paths and contents',
  );
});

test('tarFileHeader emits a valid ustar block with checksum', async t => {
  const header = tarFileHeader('a.txt', 3);
  t.is(header.byteLength, TAR_BLOCK_SIZE);
  // ustar magic at offset 257.
  t.is(new TextDecoder().decode(header.subarray(257, 262)), 'ustar');
  // Regular-file type flag at offset 156.
  t.is(String.fromCharCode(header[156]), '0');
  // The stored checksum must equal the sum of all bytes with the checksum
  // field taken as spaces.
  const stored = parseInt(
    new TextDecoder().decode(header.subarray(148, 156)).replace(/\0.*$/s, ''),
    8,
  );
  const recomputed = [...header].reduce(
    (sum, byte, index) =>
      index >= 148 && index < 156 ? sum + 0x20 : sum + byte,
    0,
  );
  t.is(stored, recomputed);
});

test('tarFilePadding aligns bodies to the block size', t => {
  t.is(tarFilePadding(0).byteLength, 0);
  t.is(tarFilePadding(TAR_BLOCK_SIZE).byteLength, 0);
  t.is(tarFilePadding(1).byteLength, TAR_BLOCK_SIZE - 1);
  t.is(tarFilePadding(TAR_BLOCK_SIZE + 10).byteLength, TAR_BLOCK_SIZE - 10);
});

test('tarFileHeader rejects a path too long for the ustar name field', t => {
  t.throws(() => tarFileHeader('a'.repeat(101), 0), {
    message: /too long for a ustar tar header/,
  });
});

test('tarEndMarker is two zero blocks', t => {
  const marker = tarEndMarker();
  t.is(marker.byteLength, TAR_BLOCK_SIZE * 2);
  t.true(marker.every(byte => byte === 0));
});

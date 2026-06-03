// @ts-check
// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import { makeReaderRef } from '../index.js';
import { checkinTarTree } from '../src/tar-checkin.js';

const TAR_BLOCK_SIZE = 512;

/**
 * Wrap a byte source as the CapTP reader ref `checkinTarTree` consumes.
 * `makeReaderRef` yields a `FarRef<Reader<string>>`; the production call
 * site receives the same shape from `E(archiveTree).archiveTar()`, typed
 * as `ERef<AsyncIterator<string>>`. Cast at this single test boundary
 * rather than scattering assertions across the call sites.
 *
 * @param {Parameters<typeof makeReaderRef>[0]} source
 * @returns {import('@endo/far').ERef<AsyncIterator<string>>}
 */
const makeArchiveReaderRef = source =>
  /** @type {import('@endo/far').ERef<AsyncIterator<string>>} */ (
    /** @type {unknown} */ (makeReaderRef(source))
  );

/**
 * Build a minimal ustar entry (header + content + block padding).
 *
 * @param {string} name
 * @param {Uint8Array} content
 * @param {string} [typeFlag] single-character ustar type flag (default '0',
 *   a regular file). 'x'/'g' produce pax extended-header blocks.
 */
const tarEntry = (name, content, typeFlag = '0') => {
  const header = new Uint8Array(TAR_BLOCK_SIZE);
  const enc = new TextEncoder();
  header.set(enc.encode(name).subarray(0, 100), 0);
  header.set(enc.encode('0000644\0'), 100);
  header.set(enc.encode('0000000\0'), 108);
  header.set(enc.encode('0000000\0'), 116);
  header.set(
    enc.encode(`${content.byteLength.toString(8).padStart(11, '0')}\0`),
    124,
  );
  header.set(enc.encode('00000000000\0'), 136);
  header.set(enc.encode(typeFlag), 156);
  header.set(enc.encode('ustar\0'), 257);
  const pad =
    (TAR_BLOCK_SIZE - (content.byteLength % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
  const out = new Uint8Array(TAR_BLOCK_SIZE + content.byteLength + pad);
  out.set(header, 0);
  out.set(content, TAR_BLOCK_SIZE);
  return out;
};

const utf8 = new TextEncoder();

/**
 * Build a pax extended-header block (`typeFlag` 'x' for next-entry scope,
 * 'g' for global scope) from a record map, mirroring `git archive
 * --format=tar`. Each pax record is `"<length> <key>=<value>\n"` where
 * `<length>` is the self-referential decimal byte length of the whole
 * record.
 *
 * @param {Record<string, string>} records
 * @param {string} [typeFlag]
 */
const paxHeader = (records, typeFlag = 'x') => {
  let body = '';
  for (const [key, value] of Object.entries(records)) {
    const tail = ` ${key}=${value}\n`;
    let length = tail.length + 1;
    while (`${length}`.length + tail.length !== length) {
      length = `${length}`.length + tail.length;
    }
    body += `${length}${tail}`;
  }
  return tarEntry('@PaxHeader', utf8.encode(body), typeFlag);
};

// A content store that captures each stored blob's bytes keyed by its
// returned sha so tests can read back what landed.
const makeCapturingStore = () => {
  /** @type {Map<string, Uint8Array>} */
  const byHash = new Map();
  let counter = 0;
  return {
    byHash,
    store: async iterable => {
      /** @type {Uint8Array[]} */
      const parts = [];
      for await (const chunk of iterable) {
        parts.push(chunk);
      }
      const total = parts.reduce((n, p) => n + p.byteLength, 0);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const p of parts) {
        bytes.set(p, offset);
        offset += p.byteLength;
      }
      counter += 1;
      const hash = `sha-${counter}`;
      byHash.set(hash, bytes);
      return hash;
    },
  };
};

const text = bytes => new TextDecoder().decode(bytes);

// Resolve a `[name, kind, hash]` tree-JSON entry list from the root hash
// `checkinTarTree` returns, then read a single top-level file's content.
const readTopLevelFile = (store, rootHash, name) => {
  const entries = JSON.parse(text(store.byHash.get(rootHash)));
  const match = entries.find(([entryName]) => entryName === name);
  return match && match[1] === 'blob'
    ? text(store.byHash.get(match[2]))
    : match;
};

const concatBytes = parts => {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
};

// A content store that records, per stored blob, how many chunks the
// streamed generator yielded and a caller-supplied probe value sampled
// the moment each store completes.
const makeRecordingStore = probe => {
  /** @type {Array<{ chunks: number, probeAtComplete: number }>} */
  const blobs = [];
  let counter = 0;
  return {
    blobs,
    store: async iterable => {
      let chunks = 0;
      // eslint-disable-next-line no-unused-vars
      for await (const chunk of iterable) {
        chunks += 1;
      }
      counter += 1;
      blobs.push({ chunks, probeAtComplete: Number(probe()) });
      // Deterministic, content-independent fake hash.
      return `sha-${counter}`;
    },
  };
};

test('checkinTarTree streams entries without buffering the whole archive', async t => {
  // First file is tiny; second file is large (many content blocks).
  const small = new TextEncoder().encode('a');
  const large = new Uint8Array(4096).fill(98); // 'b' * 4096 → 8 content blocks
  const archive = concatBytes([
    tarEntry('a.txt', small),
    tarEntry('b.txt', large),
    new Uint8Array(TAR_BLOCK_SIZE * 2), // two zero blocks terminate the tar
  ]);

  // Deliver the archive in 64-byte slices (smaller than one tar block)
  // and count how many slices have been pulled so far.
  let chunksPulled = 0;
  const sliceSize = 64;
  const totalSlices = Math.ceil(archive.byteLength / sliceSize);
  async function* sliced() {
    for (let offset = 0; offset < archive.byteLength; offset += sliceSize) {
      chunksPulled += 1;
      yield archive.slice(offset, offset + sliceSize);
    }
  }

  const store = makeRecordingStore(() => chunksPulled);
  const readerRef = makeArchiveReaderRef(sliced());
  await checkinTarTree(readerRef, store);

  // Two blobs were stored plus tree-JSON blobs; the first two stored are
  // the file contents in archive order.
  t.true(store.blobs.length >= 2);
  const [aBlob, bBlob] = store.blobs;

  // Fail-closed: the previous implementation buffered the ENTIRE archive
  // (`readAllBase64`) before storing any blob, so every slice would have
  // been pulled (`chunksPulled === totalSlices`) by the time the first
  // blob completed. Incremental streaming completes `a.txt` long before
  // the large `b.txt` content has been pulled.
  t.true(
    aBlob.probeAtComplete < totalSlices,
    `expected a.txt to store before the archive was fully pulled (pulled ${aBlob.probeAtComplete} of ${totalSlices})`,
  );

  // The large blob is streamed as multiple chunks, not one buffered slab.
  t.true(
    bBlob.chunks > 1,
    `expected b.txt to stream in multiple chunks, got ${bBlob.chunks}`,
  );
});

test('checkinTarTree honors a pax size override for the content span', async t => {
  // The ustar size field claims the full content block (4 bytes), but a
  // preceding pax `size` record narrows the real payload to 3 bytes. The
  // parser must trust the pax override; reading 4 would fold the 1 byte
  // of NUL padding into the stored blob.
  const padded = new Uint8Array(4);
  padded.set(utf8.encode('abc'), 0); // 'abc' + one NUL padding byte
  const archive = concatBytes([
    paxHeader({ size: '3' }),
    tarEntry('sized.txt', padded),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);

  const store = makeCapturingStore();
  const rootHash = await checkinTarTree(makeArchiveReaderRef([archive]), store);

  // Fail-closed: without honoring the pax `size`, the stored blob would
  // be the full 4-byte block (`'abc\0'`), not the 3-byte payload.
  t.is(readTopLevelFile(store, rootHash, 'sized.txt'), 'abc');
});

test('checkinTarTree applies a global pax header across following entries', async t => {
  // A global pax header (typeflag 'g') persists across every subsequent
  // entry until overridden. Here a single `g` header supplies the path
  // for the file entry whose own ustar name is a truncated stand-in.
  const longName = `${'global-pax-segment-'.repeat(6)}tail.txt`;
  t.true(longName.length > 100);
  const archive = concatBytes([
    paxHeader({ path: longName }, 'g'),
    tarEntry(longName.slice(0, 100), utf8.encode('payload'), '0'),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);

  const store = makeCapturingStore();
  const rootHash = await checkinTarTree(makeArchiveReaderRef([archive]), store);

  const entries = JSON.parse(text(store.byHash.get(rootHash)));
  // Fail-closed: without the global-pax branch the file would land under
  // the truncated ustar name, never the full long path.
  t.deepEqual(
    entries.map(([name]) => name),
    [longName],
  );
});

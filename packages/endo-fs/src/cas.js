// @ts-check
/**
 * Reference content-addressed-store (CAS) consumer for `BlobRef`s
 * (DESIGN.md §6).
 *
 * `BlobRef.getInfo()` carries `{ algorithm, hash, size }`. Callers
 * pipeline it alongside the surrounding call (snapshot, fetch) so
 * the incremental round-trip is zero (DESIGN.md §4.10). A
 * consumer that maintains a local CAS keyed by `(algorithm,
 * hash)` can answer reads locally and skip `BlobRef.fetch()`
 * entirely on cache hits — the central performance claim that
 * motivates BlobRef in the first place.
 *
 * Two pieces:
 *
 * - `makeMemoryCas()` — minimal in-memory CAS: a `Map` from
 *   `${algorithm}:${hash}` to `Uint8Array`. Suitable for tests
 *   and small-scale callers; a disk-backed or distributed CAS
 *   that implements the same surface is a drop-in replacement.
 *
 * - `cacheBackedRead(blobRef, cas)` — the consumer. Calls
 *   `getInfo()` once, looks up the CAS, and either serves bytes
 *   from the cache (hit, no `fetch`) or fetches once and
 *   populates the cache (miss). Returns the full content as a
 *   `Uint8Array`.
 *
 * The function returns the full content rather than a slice
 * because the CAS contract is whole-blob: the hash identifies
 * the entire payload. Callers who only want a range can slice
 * the returned `Uint8Array` themselves.
 */

import { E } from '@endo/eventual-send';
import { makeError, X, q } from '@endo/errors';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';

/**
 * @typedef {{ algorithm: string, hash: string, size: bigint }} BlobInfo
 * @typedef {{
 *   has: (info: BlobInfo) => boolean,
 *   get: (info: BlobInfo) => Uint8Array | undefined,
 *   put: (info: BlobInfo, bytes: Uint8Array) => void,
 *   size: number,
 * }} ContentAddressedStore
 */

/**
 * Build the lookup key for a `BlobInfo`. `algorithm:hash` is
 * sufficient — different files with the same SHA-256 (or other
 * algorithm) collision-free hash have the same bytes regardless
 * of any other field.
 *
 * @param {BlobInfo} info
 */
const keyOf = info => {
  if (typeof info.algorithm !== 'string' || typeof info.hash !== 'string') {
    throw makeError(
      X`CAS: BlobInfo must carry string algorithm + hash, got ${q(info)}`,
    );
  }
  return `${info.algorithm}:${info.hash}`;
};

/**
 * Build a fresh in-memory CAS.
 *
 * Backing is a plain `Map` whose iteration order tracks LRU (every
 * `get`/`put` moves the entry to the back of the Map). When the
 * caller passes `capacity`, `put` evicts least-recently-used entries
 * once the count exceeds the limit. The default is unbounded — same
 * shape as before, suitable for tests and short-lived consumers.
 * Long-running consumers should set `capacity` to keep memory
 * bounded.
 *
 * Not safe for use across vat boundaries (the CAS is a host-process
 * resource).
 *
 * @param {{ capacity?: number }} [opts]
 * @returns {ContentAddressedStore}
 */
export const makeMemoryCas = (opts = {}) => {
  const { capacity } = opts;
  if (capacity !== undefined) {
    if (
      typeof capacity !== 'number' ||
      !Number.isInteger(capacity) ||
      capacity <= 0
    ) {
      throw makeError(
        X`makeMemoryCas: capacity must be a positive integer, got ${q(capacity)}`,
      );
    }
  }
  /** @type {Map<string, Uint8Array>} */
  const map = new Map();
  // LRU via Map insertion order: `get` deletes + re-sets so the
  // most-recently-used entry sits at the back; eviction pops the
  // first (oldest) key.
  const touch = key => {
    const v = map.get(key);
    if (v !== undefined) {
      map.delete(key);
      map.set(key, v);
    }
    return v;
  };
  const evictIfFull = () => {
    if (capacity === undefined) return;
    while (map.size > capacity) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) return;
      map.delete(oldest);
    }
  };
  return harden({
    has(info) {
      return map.has(keyOf(info));
    },
    get(info) {
      return touch(keyOf(info));
    },
    put(info, bytes) {
      const key = keyOf(info);
      // `set` on an existing key keeps insertion order; delete first
      // so the entry moves to the back.
      if (map.has(key)) map.delete(key);
      map.set(key, harden(new Uint8Array(bytes)));
      evictIfFull();
    },
    get size() {
      return map.size;
    },
  });
};
harden(makeMemoryCas);

/**
 * Drain a `PassableBytesReader` into a single `Uint8Array`. The
 * per-frame `stringLengthLimit` is raised to accommodate backings
 * (notably `makeBytesReaderFromBytes`) that yield the entire
 * payload in one frame; without it, the default 100-KB cap on
 * `M.string()` would reject anything bigger.
 *
 * @param {any} readerRef
 * @param {bigint | number} expectedSize  total bytes; sets the per-frame
 *   base64 string limit just above the worst-case 4/3 expansion of the
 *   payload so a one-shot frame fits.
 */
const drainBytesReader = async (readerRef, expectedSize) => {
  const size =
    typeof expectedSize === 'bigint' ? Number(expectedSize) : expectedSize;
  const stringLengthLimit = Math.max(
    100_000,
    Math.ceil((size * 4) / 3) + 1024,
  );
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  const consumer = iterateBytesReader(readerRef, { stringLengthLimit });
  for await (const chunk of consumer) {
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

/**
 * Read a `BlobRef`'s bytes, consulting `cas` first. On cache
 * hit, the bytes are served locally without calling
 * `BlobRef.fetch()` — no `fetch` round-trip touches the wire.
 * On miss, fetch the full content from the underlying blob,
 * populate the CAS, and return.
 *
 * `BlobRef.getInfo()` is always called (one round-trip); callers
 * that need to avoid even that round-trip should pipeline `getInfo`
 * alongside the call that produced the BlobRef — see
 * `withCachedReads` in `cached-fs.js` for the realisation.
 *
 * With `{ offset, length }`, returns a slice of the blob. The
 * full blob is still fetched on a miss because the CAS contract
 * is whole-blob (the hash names the entire payload); partial
 * fetches couldn't be safely cached. The return is a copy of
 * the requested slice.
 *
 * @param {any} blobRef
 * @param {ContentAddressedStore} cas
 * @param {{ offset?: bigint, length?: bigint }} [range]
 * @returns {Promise<Uint8Array>}
 */
export const cacheBackedRead = async (blobRef, cas, range) => {
  const info = /** @type {BlobInfo} */ (await E(blobRef).getInfo());
  let bytes = cas.get(info);
  if (bytes === undefined) {
    // Miss: pull the full payload over the wire and cache it.
    const reader = await E(blobRef).fetch(0n, info.size);
    bytes = await drainBytesReader(reader, info.size);
    cas.put(info, bytes);
  }
  if (range === undefined) return bytes;
  const offset =
    range.offset === undefined ? 0 : Number(range.offset);
  const length =
    range.length === undefined ? bytes.length - offset : Number(range.length);
  if (offset < 0 || length < 0 || offset > bytes.length) {
    throw makeError(
      X`EINVAL: cacheBackedRead range out of bounds (offset=${q(offset)}, length=${q(length)}, size=${q(bytes.length)})`,
    );
  }
  const end = Math.min(offset + length, bytes.length);
  return bytes.slice(offset, end);
};
harden(cacheBackedRead);

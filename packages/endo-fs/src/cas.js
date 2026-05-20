// @ts-check
/**
 * Reference content-addressed-store (CAS) consumer for `BlobRef`s
 * (DESIGN.md §6).
 *
 * `BlobRef.getInfo()` carries `{ algorithm, hash, size }` (eager
 * in spirit; one round-trip across CapTP today per §10.1). A
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
 * Build a fresh in-memory CAS. Backing is a plain `Map`; cached
 * values are hardened `Uint8Array`s. Not safe for use across
 * vat boundaries (the CAS is a host-process resource).
 *
 * @returns {ContentAddressedStore}
 */
export const makeMemoryCas = () => {
  /** @type {Map<string, Uint8Array>} */
  const map = new Map();
  return harden({
    has(info) {
      return map.has(keyOf(info));
    },
    get(info) {
      return map.get(keyOf(info));
    },
    put(info, bytes) {
      map.set(keyOf(info), harden(new Uint8Array(bytes)));
    },
    get size() {
      return map.size;
    },
  });
};
harden(makeMemoryCas);

/**
 * Drain a `PassableBytesReader` into a single `Uint8Array`.
 *
 * @param {any} readerRef
 */
const drainBytesReader = async readerRef => {
  /** @type {Uint8Array[]} */
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

/**
 * Read a `BlobRef`'s bytes, consulting `cas` first. On cache
 * hit, the bytes are served locally without calling
 * `BlobRef.fetch()` — no `fetch` round-trip touches the wire.
 * On miss, fetch the full content from the underlying blob,
 * populate the CAS, and return.
 *
 * `BlobRef.getInfo()` is always called (one round-trip today,
 * per DESIGN.md §10.1 — the eager-state design will collapse
 * this to zero once CapTP ships state alongside the cap's
 * slot).
 *
 * @param {any} blobRef
 * @param {ContentAddressedStore} cas
 * @returns {Promise<Uint8Array>}
 */
export const cacheBackedRead = async (blobRef, cas) => {
  const info = /** @type {BlobInfo} */ (await E(blobRef).getInfo());
  const hit = cas.get(info);
  if (hit !== undefined) {
    return hit;
  }
  // Miss: pull the full payload over the wire and cache it.
  const reader = await E(blobRef).fetch(0n, info.size);
  const bytes = await drainBytesReader(reader);
  cas.put(info, bytes);
  return bytes;
};
harden(cacheBackedRead);

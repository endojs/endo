// @ts-check

import { makeSnapshotStore, makeReaderRef } from '@endo/platform/fs/lite';

/**
 * Minimal in-memory `SnapshotStore` for unit tests over `makeMount`.
 *
 * Sufficient to drive `mount.snapshot()` and `mountFile.snapshot()`
 * round-tripping without bringing up the daemon's filesystem-backed
 * content store.  Blob identity is derived from content so the same
 * bytes always stamp the same id.
 *
 * @returns {import('@endo/platform/fs/lite/types').SnapshotStore}
 */
export const makeMemoryStore = () => {
  /** @type {Map<string, Uint8Array>} */
  const blobs = new Map();

  /** @type {import('@endo/platform/fs/lite/types').ContentStore} */
  const contentStore = harden({
    async store(readable) {
      const chunks = [];
      let length = 0;
      for await (const chunk of /** @type {AsyncIterable<Uint8Array>} */ (
        /** @type {unknown} */ (readable)
      )) {
        chunks.push(chunk);
        length += chunk.byteLength;
      }
      const combined = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      // Hash by content for stable identity across re-stores.
      let hash = 0;
      for (let i = 0; i < combined.length; i += 1) {
        hash = (hash * 31 + combined[i]) | 0; // eslint-disable-line no-bitwise
      }
      const id = `sha-${combined.length}-${hash}`;
      blobs.set(id, combined);
      return id;
    },
    fetch(sha256) {
      const maybeBytes = blobs.get(sha256);
      if (maybeBytes === undefined) {
        throw new Error(`No blob for ${sha256}`);
      }
      const bytes = /** @type {Uint8Array} */ (maybeBytes);
      const text = async () => new TextDecoder().decode(bytes);
      const json = async () => {
        await null;
        return JSON.parse(await text());
      };
      const streamBase64 = () => {
        /** @returns {AsyncIterable<Uint8Array>} */
        async function* iter() {
          yield bytes;
        }
        return makeReaderRef(iter());
      };
      return harden({ streamBase64, text, json });
    },
    async has(sha256) {
      return blobs.has(sha256);
    },
    async remove(sha256) {
      blobs.delete(sha256);
    },
  });
  return makeSnapshotStore(contentStore);
};
harden(makeMemoryStore);

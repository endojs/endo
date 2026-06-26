// @ts-check
/// <reference types="ses"/>

import harden from '@endo/harden';

/** @import { ContentStore } from '@endo/platform/fs/lite/types' */
/** @import { ContentStoreOptions } from '../types.js' */

/**
 * Filesystem-backed `ContentStore` extracted from
 * `packages/daemon/src/daemon-persistence-powers.js` so the daemon
 * can later swap the implementation for the Rust supervisor's
 * `cas-*` envelope verbs (`designs/daemon-cas-management.md`
 * Phase 5) without disturbing the consumer at
 * `packages/daemon/src/daemon.js`.
 *
 * `store` streams to a randomly-named temp file, hashes the bytes as
 * they land, then atomically renames the temp file to its sha256
 * hex name.  `fetch`, `has`, and `remove` operate directly on the
 * sha256-named blob.  `remove` is idempotent (`filePowers.removePath`
 * uses `fs.promises.rm` with `force: true`), matching the contract
 * `designs/daemon-content-store-gc.md` codified for the formula GC
 * sweep.
 *
 * @param {ContentStoreOptions} options
 * @returns {ContentStore}
 */
export const makeContentStore = options => {
  const { filePowers, cryptoPowers, storageDirectoryPath } = options;

  /** @type {ContentStore} */
  const rawStore = harden({
    /**
     * @param {AsyncIterable<Uint8Array> | AsyncIterator<Uint8Array>} readableOrIterator
     * @returns {Promise<string>}
     */
    async store(readableOrIterator) {
      const readable = /** @type {AsyncIterable<Uint8Array>} */ (
        /** @type {unknown} */ (readableOrIterator)
      );
      const digester = cryptoPowers.makeSha256();
      const storageId256 = await cryptoPowers.randomHex256();
      const temporaryStoragePath = filePowers.joinPath(
        storageDirectoryPath,
        storageId256,
      );

      // Stream to temporary file and calculate hash.
      await filePowers.makePath(storageDirectoryPath);
      const fileWriter = filePowers.makeFileWriter(temporaryStoragePath);
      // eslint-disable-next-line no-await-in-loop
      for await (const chunk of readable) {
        digester.update(chunk);
        // eslint-disable-next-line no-await-in-loop
        await fileWriter.next(chunk);
      }
      await fileWriter.return(undefined);

      // Calculate hash, finish with an atomic rename.
      const sha256 = digester.digestHex();
      const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
      await filePowers.renamePath(temporaryStoragePath, storagePath);
      return sha256;
    },
    /** @param {string} sha256 */
    fetch(sha256) {
      const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
      const makeFileReader = () => filePowers.makeFileReader(storagePath);
      const text = async () => filePowers.readFileText(storagePath);
      const json = async () => {
        await null;
        return JSON.parse(await text());
      };
      // Byte length of the stored blob (bigint) — the `size` half of the
      // content-addressed `getInfo()` triple, and the clamp bound for
      // range reads.
      const size = async () => {
        await null;
        return (await filePowers.statPath(storagePath)).size;
      };
      // Windowed read for `BlobRef.fetch`-style range access: only the
      // requested `[offset, offset + length)` window leaves disk.
      const readRange = (offset, length) =>
        filePowers.readFileRange(storagePath, offset, length);
      return harden({ makeFileReader, text, json, size, readRange });
    },
    /**
     * @param {string} sha256
     * @returns {Promise<boolean>}
     */
    async has(sha256) {
      await null;
      const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
      try {
        await filePowers.readFileText(storagePath);
        return true;
      } catch (_e) {
        return false;
      }
    },
    /**
     * @param {string} sha256
     * @returns {Promise<void>}
     */
    async remove(sha256) {
      const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
      // filePowers.removePath uses fs.promises.rm with force:true,
      // so removing a missing blob is not an error.
      await filePowers.removePath(storagePath);
    },
  });

  return rawStore;
};
harden(makeContentStore);

// @ts-check

import fs from 'node:fs';
import fspath from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import harden from '@endo/harden';
import { encodeHex } from '@endo/hex';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';

/**
 * @import {
 *   ContentStoreFilePowers,
 *   ContentStoreCryptoPowers,
 * } from '../fs/types.js'
 */

/**
 * The concrete `node:fs`-backed `ContentStoreFilePowers` a filesystem
 * content store (`@endo/daemon-cas`'s `makeContentStore`) materialises
 * blobs with.  Platform owns the `ContentStoreFilePowers` contract
 * (`@endo/platform/fs/lite/types`), so it also owns the canonical Node
 * implementation of it — the same subset the daemon's own
 * `daemon-node-powers.js` builds — rather than leaving each consumer
 * (or test) to hand-roll a duplicate over `node:fs`.
 *
 * @returns {ContentStoreFilePowers}
 */
export const makeContentStoreFilePowers = () =>
  harden({
    makeFileReader(path) {
      return makeNodeReader(fs.createReadStream(path));
    },
    makeFileWriter(path) {
      return makeNodeWriter(fs.createWriteStream(path));
    },
    async readFileText(path) {
      return fs.promises.readFile(path, 'utf-8');
    },
    async readFileRange(path, offset, length) {
      if (length <= 0) {
        return new Uint8Array(0);
      }
      const handle = await fs.promises.open(path, 'r');
      try {
        // Clamp the request to the bytes actually available before
        // allocating, so a huge `length` against a small file can't
        // drive an unbounded host allocation.
        const { size } = await handle.stat();
        const clamped = Math.min(length, Math.max(0, size - offset));
        if (clamped <= 0) {
          return new Uint8Array(0);
        }
        const buffer = new Uint8Array(clamped);
        const { bytesRead } = await handle.read(buffer, 0, clamped, offset);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    },
    async makePath(path) {
      await fs.promises.mkdir(path, { recursive: true });
    },
    joinPath(...components) {
      return fspath.join(...components);
    },
    async renamePath(source, target) {
      await fs.promises.rename(source, target);
    },
    async removePath(path) {
      // `force: true` makes removal idempotent (a missing path is not an
      // error), matching the `ContentStore.remove` contract.
      await fs.promises.rm(path, { force: true });
    },
    async statPath(path) {
      // `bigint: true` yields `size` / `mtimeNs` / `atimeNs` as bigint,
      // matching the `ContentStoreFilePowers.statPath` return shape.
      const stat = await fs.promises.lstat(path, { bigint: true });
      const kind = /** @type {'directory' | 'file' | 'symlink'} */ (
        stat.isDirectory()
          ? 'directory'
          : stat.isSymbolicLink()
            ? 'symlink'
            : 'file'
      );
      return harden({
        kind,
        size: stat.size,
        mtime: stat.mtimeNs,
        atime: stat.atimeNs,
      });
    },
  });
harden(makeContentStoreFilePowers);

/**
 * The concrete `node:crypto`-backed `ContentStoreCryptoPowers` a
 * filesystem content store hashes inbound streams and mints temp-file
 * names with.  The Node counterpart to `makeContentStoreFilePowers`.
 *
 * @returns {ContentStoreCryptoPowers}
 */
export const makeContentStoreCryptoPowers = () =>
  harden({
    makeSha256() {
      const digester = createHash('sha256');
      return harden({
        /** @param {Uint8Array} chunk */
        update(chunk) {
          digester.update(chunk);
        },
        digestHex() {
          return encodeHex(digester.digest());
        },
      });
    },
    async randomHex256() {
      await null;
      return encodeHex(randomBytes(32));
    },
  });
harden(makeContentStoreCryptoPowers);
